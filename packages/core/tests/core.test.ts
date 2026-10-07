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
  assert.equal(queries.length, 3, 'ATS families add an internship wording variant for intern searches');
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
  const unconfirmed=job({ location: 'Not stated' });
  const base=matchListings([unconfirmed],{ ...prefs,location:'Bengaluru' }).listings[0];
  const boosted=matchListings([unconfirmed],{ ...prefs,location:'Bengaluru',resumeKeywords:['python'] }).listings[0];
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

test('queries carry role, keywords, city, mode, employment type and company names only (the country travels as the Search location parameter)', () => {
  const [query] = buildQueries(withFilters({ employmentType: 'contract', companiesInclude: ['Acme'], companiesExclude: ['Evil'], salary: { min: 5, max: 9, currency: 'USD', period: 'annual' }, radiusKm: 25, }, { keywords: 'python', location: 'Berlin', country: 'DE', workMode: 'hybrid', sources: ['careers', 'workday'] }));
  for (const part of ['Software engineer', 'python', 'Berlin', 'hybrid', 'contract', '"Acme"', '-"Evil"']) assert.ok(query.query.includes(part), part);
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

test('shortlist matching: synonyms match, half-matched titles do not, and unconfirmed places rank lower', () => {
  const rows = [
    job({ id: 'ml', title: 'ML Engineer', seniority: 'unknown', company: 'A', apply_url: `${board}/jobs/41`, location: 'Bengaluru, India' }),
    job({ id: 'director', title: 'Director of Engineering', seniority: 'unknown', company: 'B', apply_url: `${board}/jobs/42`, location: 'Bengaluru, India' }),
    job({ id: 'country', title: 'Machine Learning Engineer', seniority: 'unknown', company: 'C', apply_url: `${board}/jobs/43`, location: 'India' }),
    job({ id: 'remote-in', title: 'Machine Learning Engineer', seniority: 'unknown', company: 'D', apply_url: `${board}/jobs/44`, location: 'Remote - India', work_mode: 'remote' }),
    job({ id: 'abroad', title: 'Machine Learning Engineer', seniority: 'unknown', company: 'E', apply_url: `${board}/jobs/45`, location: 'Berlin, Germany' }),
  ];
  const result = matchListings(rows, withFilters({}, { role: 'Machine Learning Engineer', location: 'Bengaluru', country: 'IN' }));
  assert.deepEqual(result.listings.map(item => item.id), ['ml', 'country', 'remote-in'], 'confirmed city first, then same-country listings');
  assert.equal(result.drops.role, 1);
  assert.equal(result.drops.location, 1);
  assert.ok(result.listings[1].uncertainties.includes('Location not confirmed'));
});

test('queries stay short: a few keywords, profession only for one-word roles', () => {
  const [query] = buildQueries({ ...prefs, role: 'Product designer', profession: 'Design', keywords: 'figma, systems, research, motion, 3d', sources: ['careers'] });
  assert.ok(query.query.includes('figma systems research') && !query.query.includes('motion') && !query.query.includes('Design '));
});

test('match score is the percentage of what this user asked for, with a stored breakdown', () => {
  const perfect = job({ seniority: 'unknown', location: 'London, United Kingdom', work_mode: 'hybrid', snippet: 'Build things.' });
  const none = matchListings([perfect], withFilters({}, { role: 'Software Engineer Intern' })).listings[0];
  assert.deepEqual(Object.keys(none.facts.breakdown!).sort(), ['quality', 'role'], 'unset dimensions are not scored');
  const asked = withFilters({}, { role: 'Software Engineer Intern', location: 'London', country: 'GB', workMode: 'hybrid' });
  const matched = matchListings([perfect], asked).listings[0];
  assert.deepEqual(Object.keys(matched.facts.breakdown!).sort(), ['mode', 'place', 'quality', 'role']);
  assert.equal(matched.facts.breakdown!.place.earned, 15, 'confirmed city earns full place points');
  assert.ok(matched.match_score >= 90 && matched.match_score <= 100);
  // Unknown earns 40%, an explicit conflict earns nothing.
  const unknown = matchListings([job({ location: 'Not stated', work_mode: 'unknown', seniority: 'unknown' })], asked).listings[0];
  assert.equal(unknown.facts.breakdown!.place.earned, 6); assert.equal(unknown.facts.breakdown!.mode.earned, 2);
  assert.ok(unknown.match_score < matched.match_score);
  const refused = matchListings([job({ seniority: 'unknown', visa_signal: 'no_sponsor' })], withFilters({ visa: 'needs_sponsorship' }, { role: 'Software Engineer Intern' })).listings[0];
  const sponsored = matchListings([job({ seniority: 'unknown', visa_signal: 'sponsors' })], withFilters({ visa: 'needs_sponsorship' }, { role: 'Software Engineer Intern' })).listings[0];
  assert.equal(refused.facts.breakdown!.prefs.earned, 0); assert.equal(sponsored.facts.breakdown!.prefs.earned, 5);
  assert.ok(sponsored.match_score > refused.match_score);
});

test('Deep discovery keeps a wider candidate list than the normal limit', () => {
  const hits = Array.from({ length: 20 }, (_, i) => ({ url: `https://job-boards.greenhouse.io/company${i}/jobs/${100 + i}`, title: `Software Engineer at C${i}`, snippet: '' }));
  assert.equal(discover(hits, { ...prefs, sources: ['greenhouse'] }).length, 12);
  assert.equal(discover(hits, { ...prefs, sources: ['greenhouse'] }, 24).length, 20);
});

// ---- ATS feeds, role understanding and the 6-result floor ----
import { boardApiUrl, boardFromUrl, boardsFromHits, fixTypos, isLevelOnlyRole, listingFromHit, parseBoard, rankWithFallback, roleFit as fit, MIN_ROLE_FIT } from '../src/index.js';

const greenhouseFeed = '```\n' + JSON.stringify({ jobs: [
  { id: 101, title: 'Software Engineer, Intern (Summer 2027)', location: { name: 'Singapore' }, first_published: '2026-09-03T13:32:53-04:00', updated_at: '2026-09-25T16:45:00-04:00', company_name: 'Stripe' },
  { id: 102, title: 'Internal Audit Lead', location: { name: 'London' }, first_published: '2026-09-01T00:00:00Z', company_name: 'Stripe' },
] }) + '\n```';
const leverFeed = JSON.stringify([{ id: 'aaaaaaaa-1111-2222-3333-444444444444', text: 'Backend Engineer Intern', hostedUrl: 'https://jobs.lever.co/acme/aaaaaaaa-1111-2222-3333-444444444444', categories: { location: 'Remote - India', commitment: 'Intern', team: 'Engineering' }, workplaceType: 'remote', createdAt: 1790000000000, salaryRange: { min: 20, max: 30, currency: 'usd', interval: 'per-hour-wage' }, descriptionPlain: 'Work with Python and SQL.\nLearn fast.' }]).replace('Work with Python and SQL.\\nLearn fast.', 'Work with Python and SQL.\nLearn fast.');
const ashbyFeed = '"x":1},{"id":"11111111-1111-1111-1111-111111111111","title":"AI Engineer Intern","employmentType":"Intern","location":"Remote - US","publishedAt":"2026-09-25T16:09:30.018+00:00","isListed":true,"isRemote":true,"workplaceType":"Remote","jobUrl":"https://jobs.ashbyhq.com/acme/11111111-1111-1111-1111-111111111111","applyUrl":"https://jobs.ashbyhq.com/acme/11111111-1111-1111-1111-111111111111/application","descriptionHtml":"<p>x</p>","descriptionPlain":"Build LLM features."},{"id":"22222222-2222-2222-2222-222222222222","title":"Unlisted Role","employmentType":"FullTime","location":"Berlin","publishedAt":"2026-09-01T00:00:00Z","isListed":false,"isRemote":false,"workplaceType":"OnSite","jobUrl":"https://jobs.ashbyhq.com/acme/22222222-2222-2222-2222-222222222222","descriptionHtml":"<p>y</p>","descriptionPlain":"z"}],"apiVersion":"1"}';

test('board URLs map to their public ATS feeds, strongest boards first', () => {
  assert.deepEqual(boardFromUrl('https://job-boards.greenhouse.io/stripe/jobs/8031833'), { vendor: 'greenhouse', token: 'stripe' });
  assert.deepEqual(boardFromUrl('https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd'), { vendor: 'lever', token: 'palantir' });
  assert.deepEqual(boardFromUrl('https://jobs.ashbyhq.com/cohere/8c035d3d'), { vendor: 'ashby', token: 'cohere' });
  assert.equal(boardFromUrl('https://example.com/jobs/1'), null);
  assert.equal(boardApiUrl({ vendor: 'greenhouse', token: 'stripe' }), 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs');
  assert.deepEqual(boardsFromHits(['https://job-boards.greenhouse.io/a/jobs/1', 'https://job-boards.greenhouse.io/b/jobs/1', 'https://job-boards.greenhouse.io/b/jobs/2', 'https://x.com'], 5).map(board => board.token), ['b', 'a']);
});

test('ATS feeds parse into dated, structured, open listings and survive bad input', () => {
  const [intern, audit] = parseBoard({ vendor: 'greenhouse', token: 'stripe' }, greenhouseFeed);
  assert.equal(intern.apply_url, 'https://job-boards.greenhouse.io/stripe/jobs/101');
  assert.equal(intern.location, 'Singapore'); assert.equal(intern.company, 'Stripe'); assert.equal(intern.source_name, 'greenhouse');
  assert.equal(intern.posted_at, '2026-09-03T17:32:53.000Z'); assert.equal(intern.facts.open_on_board, true); assert.equal(intern.verification, 'detail');
  assert.equal(audit.title, 'Internal Audit Lead');
  const [lever] = parseBoard({ vendor: 'lever', token: 'acme' }, leverFeed);
  assert.equal(lever.facts.employment_type, 'internship'); assert.equal(lever.work_mode, 'remote'); assert.deepEqual(lever.facts.salary, { min: 20, max: 30, currency: 'USD', period: 'hourly' });
  assert.ok(lever.snippet.includes('Python') && lever.posted_at!.startsWith('2026'));
  const ashby = parseBoard({ vendor: 'ashby', token: 'acme' }, ashbyFeed);
  assert.deepEqual(ashby.map(job => job.title), ['AI Engineer Intern'], 'unlisted postings are skipped; feeds missing their opening braces still parse');
  assert.equal(ashby[0].work_mode, 'remote'); assert.equal(ashby[0].facts.employment_type, 'internship');
  for (const vendor of ['greenhouse', 'lever', 'ashby'] as const) assert.deepEqual(parseBoard({ vendor, token: 'x' }, 'not json at all'), []);
});

test('a Search hit that is a job page becomes a listing instead of being thrown away', () => {
  const job = listingFromHit({ url: 'http://job-boards.greenhouse.io/samsara/jobs/8082091', title: 'Samsara Careers | Software Engineering Internship - San Francisco', snippet: 'This internship is a full-time, paid experience.' })!;
  assert.equal(job.title, 'Software Engineering Internship'); assert.equal(job.location, 'San Francisco');
  assert.equal(job.apply_url, 'https://job-boards.greenhouse.io/samsara/jobs/8082091'); assert.equal(job.verification, 'board');
});

test('role understanding: typos, synonyms, level-only roles and false friends', () => {
  assert.equal(fixTypos('AI Enginner'), 'AI engineer');
  assert.ok(fit('Machine Learning Engineer Intern', 'AI Enginner Intern') >= MIN_ROLE_FIT, 'ML engineer satisfies an AI engineer search');
  assert.ok(fit('LLM Engineer Intern (Summer 2027)', 'AI Engineer Intern') >= MIN_ROLE_FIT);
  assert.equal(fit('Internal Audit Lead', 'Intern'), 0, 'Internal is not Intern');
  assert.ok(isLevelOnlyRole('Intern') && isLevelOnlyRole('Graduate trainee') && !isLevelOnlyRole('Software Intern'));
  assert.ok(fit('Software Engineering Internship - San Francisco', 'Intern') >= MIN_ROLE_FIT, 'a level-only role matches any internship');
  assert.ok(fit('Software Engineer', 'Software Engineer Intern') < MIN_ROLE_FIT, 'an intern search never returns a regular engineering job');
  assert.ok(fit('Director of Engineering', 'Software Engineer') < MIN_ROLE_FIT);
});

const internJob = (n: number, over: Partial<Listing> = {}) => job({ id: `i${n}`, title: `Software Engineer Intern ${n}`, company: `Co${n}`, apply_url: `${board}/jobs/${900 + n}`, seniority: 'intern', work_mode: 'unknown', location: 'San Francisco, CA', ...over });

test('intern searches: internship satisfies full-time, Remote keeps unstated modes, near matches fill the 6-result floor with labels', () => {
  const rows = Array.from({ length: 8 }, (_, i) => internJob(i, { facts: { employment_type: 'internship' } as Listing['facts'] }));
  const asked = withFilters({ employmentType: 'full_time', experience: { band: 'entry' } }, { role: 'Software Engineer Intern', location: 'Remote', country: '', seniority: 'intern' });
  const strict = matchListings(rows, asked);
  assert.equal(strict.listings.length, 8, 'internship passes a full-time filter and unstated mode passes Remote');
  assert.ok(strict.listings.every(item => item.uncertainties.includes('Location not confirmed')));
  // Kolkata + India: every posting is a US office job, so strict finds none and the fallback must say so.
  const india = withFilters({}, { role: 'Software Engineer Intern', location: 'Kolkata', country: 'IN', seniority: 'intern' });
  assert.equal(matchListings(rows, india).listings.length, 0);
  const ranked = rankWithFallback(rows, india);
  assert.equal(ranked.listings.length, 8); assert.equal(ranked.near, 8); assert.equal(ranked.strict, 0); assert.deepEqual(ranked.relaxed, ['location']);
  assert.ok(ranked.listings.every(item => item.facts.relaxed?.[0] === 'location' && item.match_score <= 64 && item.uncertainties[0] === 'Near match: location relaxed'));
  assert.equal(ranked.drops.location, 8, 'the empty strict result still names the filter that blocked it');
  // Strict results stay first and unlabelled when there are enough of them.
  const enough = rankWithFallback(Array.from({ length: 6 }, (_, i) => internJob(i, { location: 'Kolkata, India' })), india);
  assert.equal(enough.near, 0); assert.equal(enough.strict, 6);
});

test('scores are calibrated: unverified board links are capped, exact wording beats partial', () => {
  const asked = withFilters({}, { role: 'Software Engineer Intern', seniority: 'intern' });
  const verified = matchListings([internJob(1, { verification: 'detail', location: 'London, UK' })], asked).listings[0];
  const boardOnly = matchListings([internJob(2, { verification: 'board', location: 'London, UK' })], asked).listings[0];
  const senior = matchListings([internJob(3, { title: 'Senior Software Engineer Intern', verification: 'detail' })], asked).listings[0];
  assert.ok(verified.match_score > 85 && verified.match_score <= 100);
  assert.ok(boardOnly.match_score <= 65);
  assert.ok(senior.match_score < verified.match_score && senior.uncertainties.includes('Senior-level title'));
});
