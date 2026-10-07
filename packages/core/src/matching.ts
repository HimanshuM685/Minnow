import type { Listing, Preferences } from './contracts';
import { canonicalUrl, isJobUrl } from './urls';
import { fixTypos, alternativesFor, isLevelOnlyRole, INTERN_MARKERS, SENIORITY_WORDS } from './role';
import { cityCoords, countryAliases, countryFromLocation, distanceKm } from './geography';
import { experienceRange, postedLimitMs, type HuntFilters } from './filters';

const stopwords = new Set(['a', 'an', 'and', 'the', 'or', 'in', 'of', 'for', 'at', 'job', 'jobs', 'role', 'intern', 'internship', 'new', 'grad', 'graduate', 'senior', 'junior', 'entry', 'level', 'remote', 'full', 'time']);
export function normalize(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bengineering\b|\bengineers\b/g, 'engineer').replace(/\bdevelopment\b|\bdevelopers\b/g, 'developer')
    .replace(/\bdesigners\b/g, 'designer').replace(/\bbangalore\b/g, 'bengaluru')
    .replace(/\bml\b/g, 'machine learning').replace(/\bfront[ -]?end\b/g, 'frontend').replace(/\bback[ -]?end\b/g, 'backend').replace(/\bfull[ -]?stack\b/g, 'fullstack')
    .replace(/\bswe\b|\bsde\b/g, 'software engineer').replace(/\bpm\b/g, 'product manager').replace(/\bnyc\b/g, 'new york').replace(/\bsf\b/g, 'san francisco')
    .replace(/\busa\b|\bu\.?s\.?a?\b/g, 'united states').replace(/\buk\b/g, 'united kingdom')
    .replace(/[^a-z0-9+#]+/g, ' ').trim();
}

function roleWords(role: string): string[] {
  const words = normalize(fixTypos(role)).split(' ').filter(word => word.length > 1 && !stopwords.has(word));
  return words.length ? [...new Set(words)] : normalize(role).split(' ').filter(Boolean);
}

// A listing must match most of the role words; half a match ("Director of Engineering" for "Software Engineer") is noise.
export const MIN_ROLE_FIT = 0.75;
// 1 = the title says exactly what was asked; each missing word lowers it; synonyms (AI ~ ML ~ LLM) count.
// A role that only names a level ("Intern") matches any title with that level marker.
export function roleFit(title: string, role: string): number {
  const padded = ` ${normalize(title)} `;
  if (isLevelOnlyRole(role)) return INTERN_MARKERS.test(title) || /\b(graduate|junior|entry level|fresher)\b/i.test(title) ? 0.9 : 0;
  const desired = roleWords(role);
  if (!desired.length) return 0;
  const phrase = ` ${desired.join(' ')} `;
  const matched = desired.filter(word => alternativesFor(word).some(alternative => padded.includes(` ${normalize(alternative)} `))).length;
  const base = matched / desired.length;
  // An intern search returns internships only: a plain "Software Engineer" title is not a near miss, it is a different job.
  if (INTERN_MARKERS.test(role) && !INTERN_MARKERS.test(title)) return Math.min(base, 0.6);
  return padded.includes(phrase) ? 1 : Math.min(0.95, base);
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
  // "Remote" as the location: a remote role matches, an unstated mode is unconfirmed, only an explicit office role conflicts.
  if (/^\s*remote\s*$/i.test(prefs.location)) return job.work_mode === 'remote' || anywhere ? 'match' : job.work_mode === 'unknown' ? 'unknown' : 'mismatch';
  const places = prefs.location.split(/\s+or\s+|;|\n/i).map(normalize).filter(Boolean);
  if (!places.length) return anywhere || aliases.some(alias => location.includes(normalize(alias))) ? 'match' : 'unknown';
  if (places.some(place => location.includes(place) || place.includes(location))) return 'match';
  if (anywhere && job.work_mode === 'remote') return 'match';
  if (job.work_mode === 'remote' && (prefs.workMode === 'remote' || places.includes('remote'))) return 'unknown';
  // Right country but no specific city (or a remote role open in that country): not a conflict, just unconfirmed.
  if (country && countryFromLocation(job.location) === country && !cityCoords(job.location)) return 'unknown';
  if (job.work_mode === 'remote' && country && (!knownCountry || knownCountry[0] === country)) return 'unknown';
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

export type Relax = 'location' | 'employment' | 'experience';
export const MIN_RESULTS = 6;
export function matchListings(listings: Listing[], prefs: Preferences, relax: ReadonlySet<Relax> = new Set()): { listings: Listing[]; duplicatesRemoved: number; filteredOut: number; drops: Record<string, number> } {
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
    // A relaxed filter keeps the listing but records it, so near matches are always labelled.
    const relaxedHere: string[] = [];
    const fit = roleFit(job.title, prefs.role);
    if (fit < MIN_ROLE_FIT) { drop('role'); continue; }
    const experience = experienceFit(job, filters, prefs);
    if (experience === 'mismatch') { if (relax.has('experience')) relaxedHere.push('experience'); else { drop('experience'); continue; } }
    if (prefs.workMode !== 'any' && job.work_mode !== 'unknown' && job.work_mode !== prefs.workMode) { drop('workMode'); continue; }
    const employment = job.facts.employment_type;
    // An internship satisfies a full-time search for an intern/entry role; only a different stated type conflicts.
    const typeConflict = filters.employmentType !== 'any' && !!employment && employment !== filters.employmentType && !(employment === 'internship' && filters.employmentType === 'full_time') && !(filters.employmentType === 'internship' && job.seniority === 'intern');
    if (typeConflict) { if (relax.has('employment')) relaxedHere.push('employment'); else { drop('employmentType'); continue; } }
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
        if (distanceKm(userCity, jobCity) > filters.radiusKm) { if (relax.has('location')) { relaxedHere.push('location'); place = 'unknown'; } else { drop('radius'); continue; } } else place = 'match';
      } else {
        radiusNote = 'Location not stated';
        if (place === 'mismatch' && prefs.country && countryFromLocation(job.location) === prefs.country) place = 'unknown';
      }
    }
    if (place === 'mismatch') { if (relax.has('location')) { relaxedHere.push('location'); place = 'unknown'; } else { drop('location'); continue; } }
    const reasons = [fit === 1 ? 'Role matches' : 'Related role'];
    const uncertainties: string[] = [];
    if (radiusNote) uncertainties.push(radiusNote);
    // The score is the share of what THIS user asked for that the post satisfies. Dimensions the user left unset
    // are excluded; unknown page data earns half; an explicit conflict earns nothing.
    const parts: Record<string, [number, number]> = {};
    const part = (name: string, earned: number, possible: number) => { parts[name] = [Math.round(earned * 10) / 10, possible]; };
    // Exact wording earns full role points; partial wording scales between half and full. A senior-looking title the
    // user did not ask for loses a quarter.
    const askedSenior = SENIORITY_WORDS.test(prefs.role) || filters.experience.band === '8+';
    const seniorTitle = !askedSenior && SENIORITY_WORDS.test(job.title.replace(/\barchitect\b/i, ''));
    part('role', (fit >= 1 ? 40 : 40 * Math.max(0, (fit - 0.5) / 0.5)) * (seniorTitle ? 0.75 : 1), 40);
    if (seniorTitle) uncertainties.push('Senior-level title');
    if (prefs.location || prefs.country) {
      part('place', place === 'match' ? 15 : 6, 15);
      if (place === 'match') reasons.push(job.location);
      if (place === 'unknown') uncertainties.push(job.work_mode === 'remote' ? 'Check remote location eligibility' : 'Location not confirmed');
    }
    if (experience !== 'any') {
      part('experience', experience === 'match' ? 10 : 4, 10);
      if (experience === 'match') reasons.push('Experience matches'); else uncertainties.push('Experience not stated');
    }
    if (prefs.workMode !== 'any') {
      part('mode', job.work_mode === prefs.workMode ? 5 : 2, 5);
      if (job.work_mode === prefs.workMode) reasons.push(label(prefs.workMode === 'onsite' ? 'on-site' : prefs.workMode)); else uncertainties.push('Work mode not stated');
    }
    // Skills: filter skills, keywords and resume skills, averaged over the ones that apply.
    const keywords = prefs.keywords.split(/[,;\n]/).map(normalize).filter(Boolean);
    const haystack = normalize(`${job.title} ${job.snippet}`);
    const hits = keywords.filter(keyword => ` ${haystack} `.includes(` ${keyword} `));
    const resumeHits = prefs.resumeKeywords.map(normalize).filter(keyword => ` ${haystack} `.includes(` ${keyword} `));
    const found = skills.length ? (job.facts.skills_found ?? []).filter(skill => skills.includes(skill)) : [];
    // Resume skills are a bonus on top of the score, never a requirement the post can fail.
    if (skills.length || keywords.length) {
      const ratios: number[] = [];
      if (skills.length) ratios.push(filters.skillMode === 'all' ? found.length / skills.length : found.length ? Math.min(1, 0.5 + 0.5 * found.length / skills.length) : 0);
      if (keywords.length) ratios.push(hits.length / keywords.length);
      const unread = job.verification === 'board' && !job.snippet;
      part('skills', unread ? 6 : 15 * (ratios.reduce((sum, value) => sum + value, 0) / ratios.length), 15);
    }
    if (found.length) reasons.push(`Skill: ${found.slice(0, 2).join(', ')}`);
    if (skills.length && filters.skillMode === 'all' && found.length < skills.length) uncertainties.push(`Missing skills: ${skills.filter(skill => !found.includes(skill)).slice(0, 3).join(', ')}`);
    if (skills.length && !found.length) uncertainties.push('No listed skill found');
    if (hits.length) reasons.push(...hits.slice(0, 2).map(keyword => `Mentions ${keyword}`));
    if (resumeHits.length) reasons.push(`Resume skill: ${resumeHits[0]}`);
    // Everything else the user can set: 1 = satisfied, 0.5 = not stated, 0 = conflict.
    const checks: number[] = [];
    if (filters.employmentType !== 'any') {
      if (employment === filters.employmentType) { checks.push(1); reasons.push(label(employment)); } else { checks.push(0.4); uncertainties.push('Employment type not stated'); }
    }
    if (filters.postedWithin !== 'any') {
      if (!Number.isNaN(postedMs)) { checks.push(1); reasons.push(`Posted within ${{ '24h': '24 hours', '3d': '3 days', '7d': 'this week', '30d': '30 days' }[filters.postedWithin]}`); } else { checks.push(0.4); uncertainties.push('Posting date not stated'); }
    }
    if (filters.visa === 'needs_sponsorship' || prefs.visa !== 'any') {
      if (job.visa_signal === 'sponsors') { checks.push(1); reasons.push('Sponsorship mentioned'); }
      else if (job.visa_signal === 'no_sponsor') { checks.push(0); uncertainties.push('Posting explicitly does not offer sponsorship'); }
      else { checks.push(0.4); uncertainties.push('Visa not stated'); }
    } else if (filters.visa === 'no_sponsorship_needed') checks.push(1);
    else if (filters.visa === 'relocation_ok') { if (job.facts.benefits?.includes('relocation')) { checks.push(1); reasons.push('Relocation offered'); } else { checks.push(0.4); uncertainties.push('Relocation not stated'); } }
    else if (filters.visa === 'open_globally') { if (job.work_mode === 'remote' && /\b(worldwide|anywhere|global)\b/i.test(job.location)) { checks.push(1); reasons.push('Open globally'); } else { checks.push(0.4); uncertainties.push('Global eligibility not stated'); } }
    const wanted = filters.salary;
    if (wanted.min !== null || wanted.max !== null) {
      const pay = job.facts.salary;
      if (!pay) { checks.push(0.4); uncertainties.push('Salary not stated'); }
      else if (pay.currency !== wanted.currency) { checks.push(0.4); uncertainties.push('Currency differs'); }
      else {
        const annual = (value: number, period: keyof typeof salaryYear) => value * salaryYear[period];
        const [lo, hi] = [annual(pay.min, pay.period), annual(pay.max, pay.period)];
        const [wantLo, wantHi] = [wanted.min === null ? 0 : annual(wanted.min, wanted.period), wanted.max === null ? Infinity : annual(wanted.max, wanted.period)];
        if (hi >= wantLo && lo <= wantHi) { checks.push(1); reasons.push('Salary overlaps your range'); } else { checks.push(0); uncertainties.push(hi < wantLo ? 'Salary below your range' : 'Salary above your range'); }
      }
    }
    const soft: [string, string | undefined, string][] = [
      [filters.companySize, job.facts.company_size, 'Company size'], [filters.companyStage, job.facts.company_stage, 'Company stage'],
      [filters.industry, job.facts.industry, 'Industry'], [filters.department, job.facts.department, 'Department'],
    ];
    for (const [wantedValue, actual, name] of soft) {
      if (wantedValue === 'any') continue;
      if (actual === wantedValue) { checks.push(1); reasons.push(`${name}: ${label(wantedValue)}`); } else if (!actual) { checks.push(0.4); uncertainties.push(`${name} not stated`); } else checks.push(0);
    }
    for (const benefit of filters.benefits) {
      const stated = benefit === 'visa_support' ? job.visa_signal === 'sponsors' : job.facts.benefits?.includes(benefit);
      checks.push(stated ? 1 : 0.5); if (stated) reasons.push(`Benefit: ${label(benefit)}`);
    }
    if (filters.language !== 'any') {
      if (job.facts.language === filters.language) { checks.push(1); reasons.push(`Language: ${filters.language}`); } else if (!job.facts.language) { checks.push(0.4); uncertainties.push('Posting language not detected'); } else checks.push(0);
    }
    if (filters.companiesInclude.length) {
      const listed = filters.companiesInclude.some(name => company.includes(normalize(name)));
      checks.push(listed ? 1 : 0); if (listed) reasons.push(`Company: ${job.company}`);
    }
    if (checks.length) part('prefs', 5 * (checks.reduce((sum, value) => sum + value, 0) / checks.length), 5);
    part('quality', (job.verification === 'detail' ? 5 : 0) + (job.source_name !== 'portal' ? 3 : 0) + (job.posted_at && now - postedMs < 14 * 86400_000 ? 2 : 0), 10);
    if (job.verification === 'board') uncertainties.push('Found on a live board; details not inspected');
    const resumeBonus = Math.min(4, resumeHits.length * 2);
    const earned = Object.values(parts).reduce((sum, [value]) => sum + value, 0) + resumeBonus;
    const possible = Object.values(parts).reduce((sum, [, max]) => sum + max, 0);
    const breakdown = Object.fromEntries(Object.entries(parts).map(([name, [value, max]]) => [name, { earned: value, possible: max }]));
    // Evidence caps: a link seen only on a board is unverified, and a near match is never shown as a perfect one.
    const cap = relaxedHere.length ? 70 : job.verification === 'board' ? 65 : 100;
    const percent = Math.min(cap, Math.round(100 * earned / possible)) - 6 * relaxedHere.length;
    if (relaxedHere.length) uncertainties.unshift(`Near match: ${[...new Set(relaxedHere)].join(', ')} relaxed`);
    ranked.push({ ...job, match_score: Math.min(100, Math.max(1, percent)), match_reasons: [...new Set(reasons)].slice(0, 8), uncertainties, facts: { ...job.facts, breakdown, ...(relaxedHere.length ? { relaxed: [...new Set(relaxedHere)] } : {}) } });
  }
  ranked.sort((a, b) => Number(!!a.facts.relaxed) - Number(!!b.facts.relaxed) || b.match_score - a.match_score || a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
  return { listings: ranked, duplicatesRemoved: unique.removed, filteredOut: unique.listings.length - ranked.length, drops };
}

// Strict matching first. If that leaves fewer than `min` posts, relax the location, employment type and experience
// filters in that fixed order and label every post it adds as a near match. Never silent, never past those three.
export function rankWithFallback(listings: Listing[], prefs: Preferences, min = MIN_RESULTS) {
  const strict = matchListings(listings, prefs);
  const steps: Relax[][] = [['location'], ['location', 'employment'], ['location', 'employment', 'experience']];
  let result = strict;
  const relaxed = new Set<string>();
  if (strict.listings.length < min) {
    for (const step of steps) {
      result = matchListings(listings, prefs, new Set(step));
      step.forEach(name => relaxed.add(name));
      if (result.listings.length >= min) break;
    }
  }
  const near = result.listings.filter(job => job.facts.relaxed?.length).length;
  return { ...result, drops: strict.drops, strict: result.listings.length - near, near, relaxed: near ? [...new Set(result.listings.flatMap(job => job.facts.relaxed ?? []))] : [] };
}
