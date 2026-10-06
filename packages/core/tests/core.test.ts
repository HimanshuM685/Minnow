import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, listingSchema, type Listing } from '../src/contracts.js';
import { readSSE } from '../src/sse.js';
import { canonicalUrl, isJobUrl, publicUrl } from '../src/urls.js';
import { buildQueries, discover } from '../src/discovery.js';
import { extractAgent, extractPage, inferVisa } from '../src/extraction.js';
import { dedupe, matchListings } from '../src/matching.js';
import { countryFromLocation } from '../src/geography.js';

const prefs = { ...defaultPreferences, role: 'Software engineer', seniority: 'intern' as const };
const board = 'https://job-boards.greenhouse.io/acme';
const jobUrl = `${board}/jobs/12345`;
const detailText = `# Software Engineer Intern\n\nLocation: Bengaluru, India\n\nWork arrangement: Hybrid\n\n## About the role\n\nBuild distributed systems in Python with our engineering team. You will ship software and learn from engineers who care about reliable products.\n\n## Requirements\n\nCurrently studying computer science. We provide visa sponsorship for eligible candidates.\n\n[Apply for this job](${jobUrl}#application)`;
function job(overrides: Partial<Listing> = {}): Listing {
  const applyUrl = overrides.apply_url ?? jobUrl;
  const sourceUrl = overrides.source_url ?? applyUrl;
  return listingSchema.parse({
    id: 'job1', title: 'Software Engineer Intern', company: 'Acme', location: 'Bengaluru, India',
    seniority: 'intern', work_mode: 'hybrid', visa_signal: 'unknown', visa_evidence: '', snippet: 'Build distributed systems using Python.',
    apply_url: applyUrl, source_url: sourceUrl, source_name: 'greenhouse', sources: [sourceUrl],
    posted_at: null, checked_at: new Date().toISOString(), extraction: 'fetch', verification: 'detail',
    match_score: 0, match_reasons: [], uncertainties: [], ...overrides,
  });
}

test('SSE survives arbitrary UTF-8 boundaries, CRLF, comments, and multiline data', async () => {
  const bytes = new TextEncoder().encode(': keepalive\r\ndata: {"message":\r\ndata: "Bengaluru 🐟"}\r\n\r\ndata: {"type":"done"}');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3)); controller.close(); } });
  const events = [];
  for await (const event of readSSE(stream)) events.push(event);
  assert.deepEqual(events, [{ message: 'Bengaluru 🐟' }, { type: 'done' }]);
});

test('URLs remove tracking without stripping job IDs and reject non-public schemes', () => {
  assert.equal(canonicalUrl(`${jobUrl}?utm_source=mail&gh_jid=12345#apply`), jobUrl);
  assert.equal(canonicalUrl('https://careers.acme.com/opening?jobId=42&ref=mail'), 'https://careers.acme.com/opening?jobId=42');
  for (const url of ['javascript:alert(1)', 'http://127.0.0.1/job/1', 'http://[::1]/', 'https://localhost/', 'https://user:secret@example.com/', 'https://example.com:8080/']) assert.equal(publicUrl(url), null);
});

test('public job-portal detail paths are recognized alongside ATS job URLs', () => {
  assert.equal(isJobUrl('https://weworkremotely.com/remote-jobs/acme-software-engineer'), true);
  assert.equal(isJobUrl('https://remotive.com/remote-jobs/software-dev/software-engineer-1234'), true);
  assert.equal(isJobUrl('https://internshala.com/internship/detail/software-development-at-acme1234'), true);
  assert.equal(isJobUrl('https://wellfound.com/jobs/12345-software-engineer'), true);
  assert.equal(isJobUrl('https://job-boards.greenhouse.io/acme'), false);
});

test('source discovery adapts to preferences and filters irrelevant or gated results', () => {
  const queries = buildQueries({ ...prefs, role: 'Product designer', location: 'London', sources: ['ashby', 'careers'] });
  assert.equal(queries.length, 2);
  assert.match(queries[0].query, /Product designer.*London/);
  assert.equal(queries[0].domains, 'jobs.ashbyhq.com');
  const found = discover([
    { url: jobUrl, title: 'Software Engineer Intern', snippet: '' },
    { url: `${jobUrl}?utm_source=test`, title: 'Software Engineer Intern', snippet: '' },
    { url: 'https://example.com/blog/internship', title: 'How to find an internship', snippet: '' },
    { url: 'https://linkedin.com/jobs/view/123', title: 'Engineer', snippet: '' },
  ], prefs);
  assert.equal(found.length, 1);
});

test('Fetch extracts job-specific metadata and sponsorship evidence', () => {
  const extracted = extractPage({ url: jobUrl, title: 'Job Application for Software Engineer Intern at Acme', text: detailText }, prefs);
  assert.equal(extracted.listings.length, 1);
  const item = extracted.listings[0];
  assert.equal(item.title, 'Software Engineer Intern');
  assert.equal(item.company, 'Acme');
  assert.equal(item.location, 'Bengaluru, India');
  assert.equal(item.work_mode, 'hybrid');
  assert.equal(item.visa_signal, 'sponsors');
  assert.match(item.visa_evidence, /We provide visa sponsorship/);
  assert.equal(item.verification, 'detail');
});

test('an employer heading is not mistaken for the job title', () => {
  const extracted = extractPage({ url: jobUrl, title: 'Software Engineer Intern at Acme', text: `# Acme\n\n${detailText}` }, prefs);
  assert.equal(extracted.listings[0].title, 'Software Engineer Intern');
  assert.equal(extracted.listings[0].location, 'Bengaluru, India');
});

test('visa questions and generic authorization do not imply sponsorship', () => {
  assert.equal(inferVisa('Will you now or in the future require visa sponsorship?').signal, 'unknown');
  assert.equal(inferVisa('You must be authorized to work in India.').signal, 'unknown');
  assert.equal(inferVisa('We are unable to provide visa sponsorship for this role.').signal, 'no_sponsor');
  assert.equal(inferVisa('Visa sponsorship is not available.').signal, 'no_sponsor');
  assert.equal(inferVisa('We provide visa sponsorship. We will not sponsor this position.').signal, 'no_sponsor');
});

test('board listings remain unverified and closed jobs are excluded', () => {
  const result = extractPage({ url: board, title: 'Jobs at Acme', text: `# Careers\n\n[Software Engineer Intern](${jobUrl})\n\n[Apply now](${jobUrl})\n\nOffices: London, Bengaluru. We provide visa sponsorship.` }, prefs);
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].location, 'Not stated');
  assert.equal(result.listings[0].visa_signal, 'unknown');
  assert.equal(result.listings[0].verification, 'board');
  const closed = extractPage({ url: jobUrl, text: '# Software Engineer Intern\n\nThis position has been filled. Apply for other jobs.' }, prefs);
  assert.equal(closed.closed, true);
  assert.equal(closed.listings.length, 0);
});

test('dedupe merges redirected details with a board listing and preserves identity', () => {
  const first = job({ location: 'Not stated', verification: 'board', source_url: board, id: 'stable-board-id' });
  const detail = job({ id: 'redirect-id', apply_url: 'https://careers.acme.com/jobs/software-intern?gh_jid=12345', source_url: jobUrl });
  const deduped = dedupe([first, detail]);
  assert.equal(deduped.listings.length, 1);
  assert.equal(deduped.removed, 1);
  assert.equal(deduped.listings[0].verification, 'detail');
  assert.equal(deduped.listings[0].location, 'Bengaluru, India');
  assert.equal(deduped.listings[0].id, 'stable-board-id');
  assert.equal(deduped.listings[0].sources.length, 2);
});

test('ranking respects experience, city aliases, keywords, and sponsorship uncertainty', () => {
  const search = { ...prefs, location: 'Bangalore', keywords: 'Python', visa: 'needs_sponsorship' as const };
  const matched = matchListings([
    job({ id: 'sponsor', visa_signal: 'sponsors', visa_evidence: 'We provide visa sponsorship.' }),
    job({ id: 'unknown', company: 'Beta', apply_url: `${board}/jobs/222` }),
    job({ id: 'refused', company: 'Gamma', apply_url: `${board}/jobs/333`, visa_signal: 'no_sponsor' }),
    job({ id: 'senior', company: 'Delta', apply_url: `${board}/jobs/444`, title: 'Senior Software Engineer', seniority: 'senior' }),
    job({ id: 'unrelated', company: 'Eta', apply_url: `${board}/jobs/555`, title: 'Marketing Intern' }),
  ], search);
  assert.deepEqual(matched.listings.map(item => item.id), ['sponsor', 'unknown', 'refused']);
  assert.ok(matched.listings[0].match_reasons.includes('Mentions python'));
  assert.ok(matched.listings[1].uncertainties.includes('Visa not stated'));
  assert.equal(matchListings([job()], { ...search, visa: 'confirmed_only' }).listings.length, 0);
});

test('remote does not override foreign country restrictions', () => {
  const usOnly = job({ location: 'Remote, United States', work_mode: 'remote' });
  assert.equal(matchListings([usOnly], { ...prefs, location: 'Bengaluru or Remote', workMode: 'remote' }).listings.length, 0);
  assert.equal(matchListings([usOnly], { ...prefs, country: 'IN', workMode: 'remote' }).listings.length, 0);
  const worldwide = job({ location: 'Remote, Worldwide', work_mode: 'remote' });
  assert.equal(matchListings([worldwide], { ...prefs, location: 'Bengaluru', workMode: 'remote' }).listings.length, 1);
});

test('automatic geo-targeting uses recognizable cities without substring collisions', () => {
  assert.equal(countryFromLocation('Bangalore or Remote'), 'IN');
  assert.equal(countryFromLocation('London'), 'GB');
  assert.equal(countryFromLocation('São Paulo'), 'BR');
  assert.equal(countryFromLocation('Remote'), undefined);
  assert.equal(countryFromLocation('Ukraine'), undefined);
});

test('Agent output is validated per item and sponsorship still requires evidence', () => {
  const output = { listings: [
    { title: 'Software Engineer Intern', company: 'Acme', location: 'London', apply_url: jobUrl, snippet: 'Build useful software.', visa_evidence: '', visa_signal: 'sponsors', seniority: 'intern', work_mode: 'hybrid' },
    { title: 'Unsafe', company: 'Bad', location: '', apply_url: 'javascript:alert(1)' },
  ] };
  const result = extractAgent(output, board);
  assert.equal(result.length, 1);
  assert.equal(result[0].visa_signal, 'unknown');
  assert.equal(result[0].extraction, 'agent');
});

test('extracted resume tokens boost fit and contribute a visible match reason', () => {
  const base=matchListings([job()],prefs).listings[0];
  const boosted=matchListings([job()],{ ...prefs,resumeKeywords:['python'] }).listings[0];
  assert.ok(boosted.match_score>base.match_score);
  assert.ok(boosted.match_reasons.includes('Resume skill: python'));
});

// ---- Hunt filters: hard filters drop (and are counted), soft filters only rank ----
import { normalizeFilters, inferFacts, parsePostedAt } from '../src/index.js';
const withFilters = (filters: object, extra: object = {}) => ({ ...prefs, seniority: 'any' as const, ...extra, filters: normalizeFilters(filters) });
const facts = (value: object) => ({ facts: value as Listing['facts'] });

test('hard filters drop and report which filter removed each listing', () => {
  const listings = [
    job({ id: 'ok', title: 'Software Engineer', seniority: 'unknown', work_mode: 'hybrid', ...facts({ employment_type: 'full_time' }) }),
    job({ id: 'onsite', company: 'B', apply_url: `${board}/jobs/2`, title: 'Software Engineer', seniority: 'unknown', work_mode: 'onsite' }),
    job({ id: 'contract', company: 'C', apply_url: `${board}/jobs/3`, title: 'Software Engineer', seniority: 'unknown', work_mode: 'hybrid', ...facts({ employment_type: 'contract' }) }),
    job({ id: 'excluded', company: 'Evil Corp', apply_url: `${board}/jobs/4`, title: 'Software Engineer', seniority: 'unknown', work_mode: 'hybrid' }),
    job({ id: 'kw', company: 'D', apply_url: `${board}/jobs/5`, title: 'Software Engineer', snippet: 'Requires clearance', seniority: 'unknown', work_mode: 'hybrid' }),
    job({ id: 'old', company: 'E', apply_url: `${board}/jobs/6`, title: 'Software Engineer', seniority: 'unknown', work_mode: 'hybrid', posted_at: new Date(Date.now() - 20 * 86400_000).toISOString() }),
  ];
  const result = matchListings(listings, withFilters({ employmentType: 'full_time', companiesExclude: ['Evil Corp'], excludeKeywords: ['clearance'], postedWithin: '7d' }, { workMode: 'hybrid', location: '', country: '' }));
  assert.deepEqual(result.listings.map(item => item.id), ['ok']);
  assert.deepEqual(result.drops, { workMode: 1, employmentType: 1, companyExcluded: 1, keywordExcluded: 1, posted: 1 });
  assert.ok(result.listings[0].match_reasons.includes('hybrid') && result.listings[0].match_reasons.includes('full time'));
});

test('experience bands use stated years, then seniority; unknown stays in with a note', () => {
  const rows = [
    job({ id: 'y2', seniority: 'unknown', company: 'A', apply_url: `${board}/jobs/11`, ...facts({ years_min: 2 }) }),
    job({ id: 'y6', seniority: 'unknown', company: 'B', apply_url: `${board}/jobs/12`, ...facts({ years_min: 6 }) }),
    job({ id: 'senior', seniority: 'senior', company: 'C', apply_url: `${board}/jobs/13` }),
    job({ id: 'none', seniority: 'unknown', company: 'D', apply_url: `${board}/jobs/14` }),
  ];
  const result = matchListings(rows, withFilters({ experience: { band: '1-3' } }));
  assert.deepEqual(result.listings.map(item => item.id).sort(), ['none', 'y2']);
  assert.equal(result.drops.experience, 2);
  assert.ok(result.listings.find(item => item.id === 'none')!.uncertainties.includes('Experience not stated'));
});

test('radius keeps unknown cities, drops far ones, and ignores Remote', () => {
  const rows = [
    job({ id: 'near', location: 'Whitefield, Bengaluru', seniority: 'unknown', company: 'A', apply_url: `${board}/jobs/21` }),
    job({ id: 'far', location: 'Mumbai, India', seniority: 'unknown', company: 'B', apply_url: `${board}/jobs/22` }),
    job({ id: 'unknown', location: 'India', seniority: 'unknown', company: 'C', apply_url: `${board}/jobs/23` }),
  ];
  const local = matchListings(rows, withFilters({ radiusKm: 25 }, { location: 'Bengaluru', country: 'IN' }));
  assert.deepEqual(local.listings.map(item => item.id).sort(), ['near', 'unknown']);
  assert.equal(local.drops.radius, 1);
  assert.ok(local.listings.find(item => item.id === 'unknown')!.uncertainties.includes('Location not stated'));
  assert.equal(matchListings(rows, withFilters({ radiusKm: 25 }, { location: 'Remote', country: '' })).drops.radius, undefined);
});

test('skills ALL vs ANY, salary overlap and currency mismatch rank without dropping', () => {
  const rows = [
    job({ id: 'both', seniority: 'unknown', company: 'A', apply_url: `${board}/jobs/31`, ...facts({ skills_found: ['TypeScript', 'React'], salary: { min: 90000, max: 120000, currency: 'USD', period: 'annual' } }) }),
    job({ id: 'one', seniority: 'unknown', company: 'B', apply_url: `${board}/jobs/32`, ...facts({ skills_found: ['TypeScript'], salary: { min: 40, max: 50, currency: 'EUR', period: 'hourly' } }) }),
    job({ id: 'none', seniority: 'unknown', company: 'C', apply_url: `${board}/jobs/33` }),
  ];
  const filters = { skills: ['TypeScript', 'React'], salary: { min: 100000, max: 150000, currency: 'USD', period: 'annual' } };
  const all = matchListings(rows, withFilters({ ...filters, skillMode: 'all' }));
  assert.equal(all.listings.length, 3, 'nothing is dropped by soft filters');
  assert.deepEqual(all.listings.map(item => item.id), ['both', 'one', 'none']);
  assert.ok(all.listings[0].match_reasons.includes('Skill: TypeScript, React') && all.listings[0].match_reasons.includes('Salary overlaps your range'));
  assert.ok(all.listings[1].uncertainties.includes('Currency differs') && all.listings[1].uncertainties.includes('Missing skills: React'));
  assert.equal(matchListings(rows, withFilters({ ...filters, skillMode: 'any' })).listings.length, 3);
});

test('queries carry role, keywords, city, country, mode, employment type and company names only', () => {
  const [query] = buildQueries(withFilters({ employmentType: 'contract', companiesInclude: ['Acme'], companiesExclude: ['Evil'], salary: { min: 5, max: 9, currency: 'USD', period: 'annual' }, radiusKm: 25, }, { keywords: 'python', location: 'Berlin', country: 'DE', workMode: 'hybrid', sources: ['careers', 'workday'] }));
  for (const part of ['Software engineer', 'python', 'Berlin', 'germany', 'hybrid', 'contract', '"Acme"', '-"Evil"']) assert.ok(query.query.includes(part), part);
  assert.ok(!/25|salary|\b5\b/.test(query.query.replace(/Software engineer/i, '')));
  assert.deepEqual(buildQueries(withFilters({}, { sources: ['careers', 'workday'] })).map(item => item.name), ['Company careers', 'Workday']);
});

test('page facts are read only when stated', () => {
  const text = 'Full-time. Salary: $90,000 - $120,000 per year. 3+ years of experience. A Bachelor’s degree is required. Equity and health insurance. Series B startup.';
  const facts = inferFacts('Backend Engineer', text, ['Go', 'Python']);
  assert.equal(facts.employment_type, 'full_time'); assert.equal(facts.years_min, 3); assert.equal(facts.education, 'bachelor');
  assert.deepEqual(facts.salary, { min: 90000, max: 120000, currency: 'USD', period: 'annual' });
  assert.deepEqual(facts.benefits, ['equity', 'health']); assert.equal(facts.company_stage, 'series_b'); assert.equal(facts.department, 'engineering');
  assert.equal(inferFacts('Backend Engineer', 'We are building things.').salary, undefined);
  assert.equal(parsePostedAt('Posted 3 days ago', null, 1_000_000_000_000), new Date(1_000_000_000_000 - 3 * 86_400_000).toISOString());
  assert.equal(parsePostedAt('nothing here'), null);
});
