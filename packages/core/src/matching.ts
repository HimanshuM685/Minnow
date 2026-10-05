import type { Listing, Preferences } from './contracts';
import { canonicalUrl, isJobUrl } from './urls';
import { countryAliases, countryFromLocation } from './geography';

const stopwords = new Set(['a', 'an', 'and', 'the', 'or', 'in', 'of', 'for', 'at', 'job', 'jobs', 'role', 'intern', 'internship', 'new', 'grad', 'graduate', 'senior', 'junior', 'entry', 'level', 'remote', 'full', 'time']);
export function normalize(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bengineering\b|\bengineers\b/g, 'engineer').replace(/\bdevelopment\b|\bdevelopers\b/g, 'developer')
    .replace(/\bdesigners\b/g, 'designer').replace(/\bbangalore\b/g, 'bengaluru')
    .replace(/\bnyc\b/g, 'new york').replace(/\bsf\b/g, 'san francisco')
    .replace(/\busa\b|\bu\.?s\.?a?\b/g, 'united states').replace(/\buk\b/g, 'united kingdom')
    .replace(/[^a-z0-9+#]+/g, ' ').trim();
}

function roleWords(role: string): string[] {
  const words = normalize(role).split(' ').filter(word => word.length > 1 && !stopwords.has(word));
  return words.length ? [...new Set(words)] : normalize(role).split(' ').filter(Boolean);
}

export function roleFit(title: string, role: string): number {
  const normalized = normalize(title);
  const words = new Set(normalized.split(' '));
  const desired = roleWords(role);
  if (!desired.length) return 0;
  let matched = desired.filter(word => words.has(word)).length;
  if (desired.includes('engineer') && words.has('developer') || desired.includes('developer') && words.has('engineer')) matched++;
  return Math.min(1, matched / desired.length);
}

function identity(job: Listing): string {
  return [normalize(job.company), normalize(job.title), normalize(job.location)].join('|');
}

export function dedupe(listings: Listing[]): { listings: Listing[]; removed: number } {
  const byUrl = new Map<string, Listing>();
  const byIdentity = new Map<string, string>();
  const aliases = new Map<string, string>();
  for (const job of listings) {
    const key = canonicalUrl(job.apply_url);
    const origin = isJobUrl(job.source_url) ? canonicalUrl(job.source_url) : key;
    const identityKey = identity(job);
    const existingKey = aliases.get(key) ?? aliases.get(origin) ?? byIdentity.get(identityKey);
    const old = existingKey ? byUrl.get(existingKey) : undefined;
    if (!old) {
      byUrl.set(key, { ...job, sources: [...job.sources] }); byIdentity.set(identityKey, key);
      aliases.set(key, key); aliases.set(origin, key); continue;
    }
    const quality = (item: Listing) => (item.verification === 'detail' ? 10 : 0) + (item.source_name !== 'portal' ? 3 : 0) + (item.visa_signal !== 'unknown' ? 2 : 0) + (item.location !== 'Not stated' ? 1 : 0);
    const best = quality(job) > quality(old) ? job : old;
    const merged = { ...best, id: old.id, sources: [...new Set([...old.sources, ...job.sources])] };
    byUrl.set(existingKey!, merged);
    aliases.set(key, existingKey!); aliases.set(origin, existingKey!);
    byIdentity.set(identity(merged), existingKey!);
  }
  return { listings: [...byUrl.values()], removed: listings.length - byUrl.size };
}

function locationFit(job: Listing, prefs: Preferences): 'match' | 'unknown' | 'mismatch' | 'any' {
  if (!prefs.location && !prefs.country) return 'any';
  if (!job.location || job.location === 'Not stated') return 'unknown';
  const location = normalize(job.location);
  const anywhere = /\b(worldwide|anywhere|global|work from anywhere)\b/.test(location);
  const country = prefs.country || countryFromLocation(prefs.location);
  const aliases = country ? countryAliases[country] ?? [country.toLowerCase()] : [];
  const knownCountry = Object.entries(countryAliases).find(([, values]) => values.some(value => location.includes(normalize(value))));
  if (country && knownCountry && knownCountry[0] !== country && !aliases.some(alias => location.includes(normalize(alias))) && !anywhere) return 'mismatch';
  const places = prefs.location.split(/\s+or\s+|;|\n/i).map(normalize).filter(Boolean);
  if (!places.length) return anywhere || aliases.some(alias => location.includes(normalize(alias))) ? 'match' : 'unknown';
  if (places.some(place => location.includes(place) || place.includes(location))) return 'match';
  if (anywhere && job.work_mode === 'remote') return 'match';
  if (job.work_mode === 'remote' && (prefs.workMode === 'remote' || places.includes('remote'))) return 'unknown';
  return 'mismatch';
}

export function matchListings(listings: Listing[], prefs: Preferences): { listings: Listing[]; duplicatesRemoved: number; filteredOut: number } {
  const unique = dedupe(listings);
  const ranked: Listing[] = [];
  for (const job of unique.listings) {
    const fit = roleFit(job.title, prefs.role);
    if (fit < 0.5) continue;
    if (prefs.seniority !== 'any' && job.seniority !== 'unknown' && job.seniority !== prefs.seniority) continue;
    if (prefs.workMode !== 'any' && job.work_mode !== 'unknown' && job.work_mode !== prefs.workMode) continue;
    if (prefs.visa === 'confirmed_only' && job.visa_signal !== 'sponsors') continue;
    const place = locationFit(job, prefs);
    if (place === 'mismatch') continue;
    const reasons = [fit === 1 ? 'Role matches' : 'Related role'];
    const uncertainties: string[] = [];
    let score = fit * 45 + (job.verification === 'detail' ? 8 : 0) + (job.source_name !== 'portal' ? 5 : 0);
    if (place === 'match') { score += 15; reasons.push(job.location); }
    if (place === 'unknown') uncertainties.push(job.work_mode === 'remote' ? 'Check remote location eligibility' : 'Location not confirmed');
    if (prefs.seniority !== 'any' && job.seniority === prefs.seniority) { score += 10; reasons.push('Experience matches'); }
    if (prefs.seniority !== 'any' && job.seniority === 'unknown') uncertainties.push('Experience not stated');
    if (prefs.workMode !== 'any' && job.work_mode === prefs.workMode) { score += 5; if (place !== 'match') reasons.push(`${prefs.workMode.charAt(0).toUpperCase()}${prefs.workMode.slice(1)} role`); }
    if (prefs.workMode !== 'any' && job.work_mode === 'unknown') uncertainties.push('Work mode not stated');
    const keywords = prefs.keywords.split(/[,;\n]/).map(normalize).filter(Boolean);
    const haystack = normalize(`${job.title} ${job.snippet}`);
    const hits = keywords.filter(keyword => ` ${haystack} `.includes(` ${keyword} `));
    if (hits.length) { score += Math.min(12, hits.length * 4); reasons.push(...hits.slice(0, 2).map(keyword => `Mentions ${keyword}`)); }
    const resumeHits = prefs.resumeKeywords.map(normalize).filter(keyword => ` ${haystack} `.includes(` ${keyword} `));
    if (resumeHits.length) { score += Math.min(10, resumeHits.length * 2); reasons.push(`Resume skill: ${resumeHits[0]}`); }
    if (prefs.visa !== 'any') {
      if (job.visa_signal === 'sponsors') { score += 10; reasons.push('Sponsorship mentioned'); }
      else if (job.visa_signal === 'no_sponsor') { score -= 25; uncertainties.push('Posting explicitly does not offer sponsorship'); }
      else { score -= 10; uncertainties.push('Sponsorship not confirmed'); }
    }
    if (job.verification === 'board') uncertainties.push('Found on a live board; details not inspected');
    if (job.posted_at && Date.now() - Date.parse(job.posted_at) < 14 * 86400_000) score += 2;
    ranked.push({ ...job, match_score: Math.min(100, Math.max(1, Math.round(score))), match_reasons: reasons.slice(0, 6), uncertainties });
  }
  ranked.sort((a, b) => b.match_score - a.match_score || a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
  return { listings: ranked, duplicatesRemoved: unique.removed, filteredOut: unique.listings.length - ranked.length };
}
