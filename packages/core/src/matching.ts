import type { Listing, Preferences } from './contracts';
import { canonicalUrl, isJobUrl } from './urls';
import { cityCoords, countryAliases, countryFromLocation, distanceKm } from './geography';
import { experienceRange, postedLimitMs, type HuntFilters } from './filters';

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

// Names shown when a hard filter removes everything ("Nothing matched after: Work mode removed 12").
export const hardFilterLabels: Record<string, string> = {
  role: 'Role title', workMode: 'Work mode', employmentType: 'Employment type', experience: 'Experience', location: 'Country / location',
  radius: 'Radius', posted: 'Posted within', companyExcluded: 'Excluded companies', keywordExcluded: 'Excluded keywords', source: 'Job source', education: 'Education', visa: 'Visa',
};
const salaryYear = { hourly: 2080, monthly: 12, annual: 1 };
const rank = { none: 0, bachelor: 1, master: 2, phd: 3 };
const label = (value: string) => value.replace(/_/g, ' ');

function experienceFit(job: Listing, filters: HuntFilters, prefs: Preferences): 'match' | 'unknown' | 'mismatch' | 'any' {
  const range = experienceRange(filters.experience);
  if (range.kind === 'any') {
    if (prefs.seniority === 'any') return 'any';
    if (job.seniority === 'unknown') return 'unknown';
    return job.seniority === prefs.seniority ? 'match' : 'mismatch';
  }
  if (range.kind === 'intern') return job.seniority === 'intern' ? 'match' : job.seniority === 'unknown' ? 'unknown' : 'mismatch';
  const { years_min: min, years_max: max } = job.facts;
  if (typeof min === 'number') {
    if (range.max !== null && min > range.max) return 'mismatch';
    if (range.min !== null && (max ?? min) < range.min && range.min > 0) return 'mismatch';
    return 'match';
  }
  if (job.seniority === 'senior' && range.max !== null && range.max < 5) return 'mismatch';
  if (job.seniority === 'intern' && (range.min ?? 0) >= 3) return 'mismatch';
  if (job.seniority === 'new_grad' && (range.min ?? 0) >= 5) return 'mismatch';
  return job.seniority === 'unknown' ? 'unknown' : 'match';
}

export function matchListings(listings: Listing[], prefs: Preferences): { listings: Listing[]; duplicatesRemoved: number; filteredOut: number; drops: Record<string, number> } {
  const unique = dedupe(listings);
  const filters = prefs.filters;
  const drops: Record<string, number> = {};
  const ranked: Listing[] = [];
  const now = Date.now();
  const userCity = filters.radiusKm > 0 && !/\bremote\b/i.test(prefs.location) ? cityCoords(prefs.location) : undefined;
  const excludedKeywords = filters.excludeKeywords.map(normalize).filter(Boolean);
  const skills = filters.skills;
  for (const job of unique.listings) {
    const drop = (reason: string) => { drops[reason] = (drops[reason] ?? 0) + 1; };
    const fit = roleFit(job.title, prefs.role);
    if (fit < 0.5) { drop('role'); continue; }
    const experience = experienceFit(job, filters, prefs);
    if (experience === 'mismatch') { drop('experience'); continue; }
    if (prefs.workMode !== 'any' && job.work_mode !== 'unknown' && job.work_mode !== prefs.workMode) { drop('workMode'); continue; }
    const employment = job.facts.employment_type;
    if (filters.employmentType !== 'any' && employment && employment !== filters.employmentType && !(filters.employmentType === 'internship' && job.seniority === 'intern')) { drop('employmentType'); continue; }
    if (prefs.visa === 'confirmed_only' && job.visa_signal !== 'sponsors') { drop('visa'); continue; }
    if (!prefs.sources.includes(job.source_name)) { drop('source'); continue; }
    const company = normalize(job.company);
    if (filters.companiesExclude.some(name => company.includes(normalize(name)))) { drop('companyExcluded'); continue; }
    const text = ` ${normalize(`${job.title} ${job.snippet}`)} `;
    if (excludedKeywords.some(word => text.includes(` ${word} `))) { drop('keywordExcluded'); continue; }
    const required = job.facts.education;
    if (filters.education !== 'any' && required && rank[required] > rank[filters.education === 'none' ? 'none' : filters.education]) { drop('education'); continue; }
    const postedMs = job.posted_at ? Date.parse(job.posted_at) : NaN;
    if (filters.postedWithin !== 'any' && !Number.isNaN(postedMs) && now - postedMs > postedLimitMs[filters.postedWithin]) { drop('posted'); continue; }
    // With a radius, distance decides between known cities; otherwise fall back to name matching.
    const jobCity = userCity && job.work_mode !== 'remote' ? cityCoords(job.location) : undefined;
    let place = locationFit(job, prefs);
    let radiusNote = '';
    if (userCity && job.work_mode !== 'remote') {
      if (jobCity) {
        if (distanceKm(userCity, jobCity) > filters.radiusKm) { drop('radius'); continue; }
        place = 'match';
      } else {
        radiusNote = 'Location not stated';
        if (place === 'mismatch' && prefs.country && countryFromLocation(job.location) === prefs.country) place = 'unknown';
      }
    }
    if (place === 'mismatch') { drop('location'); continue; }
    const reasons = [fit === 1 ? 'Role matches' : 'Related role'];
    const uncertainties: string[] = [];
    if (radiusNote) uncertainties.push(radiusNote);
    let score = fit * 45 + (job.verification === 'detail' ? 8 : 0) + (job.source_name !== 'portal' ? 5 : 0);
    if (place === 'match') { score += 15; reasons.push(job.location); }
    if (place === 'unknown') uncertainties.push(job.work_mode === 'remote' ? 'Check remote location eligibility' : 'Location not confirmed');
    if (experience === 'match') { score += 10; reasons.push('Experience matches'); }
    if (experience === 'unknown') uncertainties.push('Experience not stated');
    if (prefs.workMode !== 'any' && job.work_mode === prefs.workMode) { score += 5; reasons.push(label(prefs.workMode === 'onsite' ? 'on-site' : prefs.workMode)); }
    if (prefs.workMode !== 'any' && job.work_mode === 'unknown') uncertainties.push('Work mode not stated');
    if (filters.employmentType !== 'any') {
      if (employment === filters.employmentType) { score += 4; reasons.push(label(employment)); } else if (!employment) uncertainties.push('Employment type not stated');
    }
    if (filters.postedWithin !== 'any') {
      if (!Number.isNaN(postedMs)) { score += 4; reasons.push(`Posted within ${{ '24h': '24 hours', '3d': '3 days', '7d': 'this week', '30d': '30 days' }[filters.postedWithin]}`); } else uncertainties.push('Posting date not stated');
    }
    const keywords = prefs.keywords.split(/[,;\n]/).map(normalize).filter(Boolean);
    const haystack = normalize(`${job.title} ${job.snippet}`);
    const hits = keywords.filter(keyword => ` ${haystack} `.includes(` ${keyword} `));
    if (hits.length) { score += Math.min(12, hits.length * 4); reasons.push(...hits.slice(0, 2).map(keyword => `Mentions ${keyword}`)); }
    const resumeHits = prefs.resumeKeywords.map(normalize).filter(keyword => ` ${haystack} `.includes(` ${keyword} `));
    if (resumeHits.length) { score += Math.min(10, resumeHits.length * 2); reasons.push(`Resume skill: ${resumeHits[0]}`); }
    if (skills.length) {
      const found = (job.facts.skills_found ?? []).filter(skill => skills.includes(skill));
      if (found.length) { score += filters.skillMode === 'all' ? Math.round(14 * found.length / skills.length) : Math.min(12, found.length * 4); reasons.push(`Skill: ${found.slice(0, 2).join(', ')}`); }
      if (filters.skillMode === 'all' && found.length < skills.length) { score -= 4; uncertainties.push(`Missing skills: ${skills.filter(skill => !found.includes(skill)).slice(0, 3).join(', ')}`); }
      if (!found.length) uncertainties.push('No listed skill found');
    }
    // Visa: soft rank only. Unknown stays unknown.
    if (filters.visa === 'needs_sponsorship' || prefs.visa !== 'any') {
      if (job.visa_signal === 'sponsors') { score += 10; reasons.push('Sponsorship mentioned'); }
      else if (job.visa_signal === 'no_sponsor') { score -= 25; uncertainties.push('Posting explicitly does not offer sponsorship'); }
      else { score -= 10; uncertainties.push('Visa not stated'); }
    } else if (filters.visa === 'no_sponsorship_needed' && job.visa_signal === 'no_sponsor') uncertainties.push('Posting does not offer sponsorship (you do not need it)');
    else if (filters.visa === 'relocation_ok') { if (job.facts.benefits?.includes('relocation')) { score += 5; reasons.push('Relocation offered'); } else uncertainties.push('Relocation not stated'); }
    else if (filters.visa === 'open_globally') { if (job.work_mode === 'remote' && /\b(worldwide|anywhere|global)\b/i.test(job.location)) { score += 5; reasons.push('Open globally'); } else uncertainties.push('Global eligibility not stated'); }
    const wanted = filters.salary;
    if (wanted.min !== null || wanted.max !== null) {
      const pay = job.facts.salary;
      if (!pay) uncertainties.push('Salary not stated');
      else if (pay.currency !== wanted.currency) { score -= 2; uncertainties.push('Currency differs'); }
      else {
        const annual = (value: number, period: keyof typeof salaryYear) => value * salaryYear[period];
        const [lo, hi] = [annual(pay.min, pay.period), annual(pay.max, pay.period)];
        const [wantLo, wantHi] = [wanted.min === null ? 0 : annual(wanted.min, wanted.period), wanted.max === null ? Infinity : annual(wanted.max, wanted.period)];
        if (hi >= wantLo && lo <= wantHi) { score += 6; reasons.push('Salary overlaps your range'); } else { score -= 6; uncertainties.push(hi < wantLo ? 'Salary below your range' : 'Salary above your range'); }
      }
    }
    const soft: [string, string | undefined, string][] = [
      [filters.companySize, job.facts.company_size, 'Company size'], [filters.companyStage, job.facts.company_stage, 'Company stage'],
      [filters.industry, job.facts.industry, 'Industry'], [filters.department, job.facts.department, 'Department'],
    ];
    for (const [wantedValue, actual, name] of soft) {
      if (wantedValue === 'any') continue;
      if (actual === wantedValue) { score += 3; reasons.push(`${name}: ${label(wantedValue)}`); } else if (!actual) uncertainties.push(`${name} not stated`);
    }
    for (const benefit of filters.benefits) {
      const stated = benefit === 'visa_support' ? job.visa_signal === 'sponsors' : job.facts.benefits?.includes(benefit);
      if (stated) { score += 2; reasons.push(`Benefit: ${label(benefit)}`); }
    }
    if (filters.language !== 'any') {
      if (job.facts.language === filters.language) { score += 2; reasons.push(`Language: ${filters.language}`); } else if (!job.facts.language) uncertainties.push('Posting language not detected');
    }
    if (filters.companiesInclude.some(name => company.includes(normalize(name)))) { score += 5; reasons.push(`Company: ${job.company}`); }
    if (job.verification === 'board') uncertainties.push('Found on a live board; details not inspected');
    if (job.posted_at && now - postedMs < 14 * 86400_000) score += 2;
    ranked.push({ ...job, match_score: Math.min(100, Math.max(1, Math.round(score))), match_reasons: [...new Set(reasons)].slice(0, 8), uncertainties });
  }
  ranked.sort((a, b) => b.match_score - a.match_score || a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
  return { listings: ranked, duplicatesRemoved: unique.removed, filteredOut: unique.listings.length - ranked.length, drops };
}
