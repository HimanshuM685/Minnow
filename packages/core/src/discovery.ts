import type { Preferences, SourceName } from './contracts';
import { countryAliases } from './geography';
import { seniorityFor } from './filters';
import { canonicalUrl, companyKey, isJobUrl, publicUrl, sourceFor } from './urls';

export interface SearchHit { title: string; snippet: string; url: string; date?: string; }
export interface SearchQuery { name: string; query: string; domains?: string; exclude?: string; }
export interface Candidate extends SearchHit { source: SourceName; priority: number; }

const domains: Partial<Record<SourceName, string>> = {
  greenhouse: 'boards.greenhouse.io,job-boards.greenhouse.io',
  lever: 'jobs.lever.co', ashby: 'jobs.ashbyhq.com', workday: 'myworkdayjobs.com',
  portal: 'builtin.com,wellfound.com,internshala.com,weworkremotely.com,remotive.com',
};
const allBoards = `${Object.values(domains).join(',')},linkedin.com,facebook.com,youtube.com,pinterest.com,reddit.com,quora.com`;

const employmentText = { any: '', full_time: 'full-time', part_time: 'part-time', contract: 'contract', freelance: 'freelance', temporary: 'temporary', internship: 'internship', apprenticeship: 'apprenticeship' };
const workModeText = { any: '', remote: 'remote', hybrid: 'hybrid', onsite: 'on-site' };

// Query text only: role, keywords, city, country, work mode, employment type and company names.
// Salary, benefits, stage and radius are not search operators, so they are applied after parsing.
export function buildQueries(prefs: Preferences): SearchQuery[] {
  const f = prefs.filters;
  const seniority = f.experience.band === 'any' ? prefs.seniority : seniorityFor(f.experience);
  const level = { any: '', intern: 'internship intern', new_grad: 'new graduate entry level', mid: '', senior: 'senior' }[seniority];
  const countryName = prefs.country ? countryAliases[prefs.country]?.[0] ?? '' : '';
  const place = [prefs.location, countryName && !prefs.location.toLowerCase().includes(countryName) ? countryName : '', workModeText[prefs.workMode]].filter(Boolean).join(' ');
  const companies = f.companiesInclude.length ? `(${f.companiesInclude.map(name => `"${name}"`).join(' OR ')})` : '';
  const excluded = f.companiesExclude.map(name => `-"${name}"`).join(' ');
  // Long keyword lists over-constrain Search; the first few carry the intent. Profession only helps a one-word role.
  const keywords = prefs.keywords.split(/[,;\n]/).map(item => item.trim()).filter(Boolean).slice(0, 3).join(' ');
  const profession = prefs.role.trim().split(/\s+/).length > 1 ? '' : prefs.profession;
  const base = [prefs.role, profession, keywords, level, employmentText[f.employmentType], place, companies, excluded].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return [...new Set(prefs.sources)].map(source => ({
    name: { careers: 'Company careers', greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', workday: 'Workday', portal: 'Public job boards' }[source],
    query: `${base} ${source === 'careers' ? 'careers open positions apply' : 'jobs apply'}`,
    domains: domains[source], exclude: source === 'careers' ? allBoards : 'linkedin.com',
  }));
}

export function discover(hits: SearchHit[], prefs: Preferences, limit = 12): Candidate[] {
  const unique = new Map<string, Candidate>();
  for (const hit of hits) {
    const url = publicUrl(hit.url);
    if (!url) continue;
    const host = new URL(url).hostname;
    if (/(^|\.)(linkedin\.com|facebook\.com|youtube\.com|reddit\.com|quora\.com|pinterest\.com)$/.test(host)) continue;
    if (/\/(blog|news|articles|guides|login|signin|sign-in)\b/i.test(new URL(url).pathname)) continue;
    if (/\b(how to|interview questions|resume tips|top \d+|best \d+)\b/i.test(hit.title)) continue;
    const source = sourceFor(url);
    if (!prefs.sources.includes(source)) continue;
    if (source === 'careers' && !isJobUrl(url) && !/career|hiring|jobs|open positions/i.test(`${hit.title} ${url}`)) continue;
    const candidate = { ...hit, url, source, priority: (isJobUrl(url) ? 30 : 10) + (source !== 'portal' ? 5 : 0) };
    unique.set(canonicalUrl(url), candidate);
  }
  for (const url of prefs.careersUrls) {
    if (publicUrl(url)) unique.set(canonicalUrl(url), { url, title: 'Your careers page', snippet: '', source: sourceFor(url), priority: 60 });
  }
  return diversify([...unique.values()], limit);
}

export function diversify<T extends { url: string; priority: number }>(items: T[], limit: number): T[] {
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const selected: T[] = [];
  const counts = new Map<string, number>();
  while (selected.length < limit && sorted.length) {
    sorted.sort((a, b) => (b.priority - (counts.get(companyKey(b.url)) ?? 0) * 20) - (a.priority - (counts.get(companyKey(a.url)) ?? 0) * 20));
    const next = sorted.shift()!;
    selected.push(next);
    counts.set(companyKey(next.url), (counts.get(companyKey(next.url)) ?? 0) + 1);
  }
  return selected;
}
