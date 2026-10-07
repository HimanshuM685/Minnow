import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences } from '@minnow/core';
import { emptyStats, runSearch } from '../lib/pipeline';

const page = '# Software Engineer Intern\n\nLocation: London\n\nWork arrangement: Hybrid\n\n## About the role\n\nBuild reliable software services in Python and SQL. Learn from experienced engineers and collaborate across teams to solve useful software problems. Apply for this position today.';
const hits = Array.from({ length: 8 }, (_, i) => ({ url: `https://job-boards.greenhouse.io/company${i}/jobs/${1000 + i}`, title: `Software Engineer Intern at Company ${i}`, snippet: '' }));
const prefs = { ...defaultPreferences, role: 'Software engineer intern', location: 'London', country: 'GB', useAgent: false, sources: ['greenhouse' as const] };

// Slow Fetch batch must not discard the pages that did load: the hunt ranks what it has when the budget ends.
test('budget expiry keeps partial results instead of failing the hunt', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.search.')) return Response.json({ results: hits });
    const body = JSON.parse(String(init?.body)) as { urls: string[] };
    if (body.urls.some(item => item.includes('company7'))) {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
    }
    return Response.json({ results: body.urls.map(source => ({ url: source, title: 'Software Engineer Intern', text: page })), errors: [] });
  });
  const keepAlive = setTimeout(() => {}, 10_000); // AbortSignal.timeout timers are unref'd; a real socket would hold the loop
  try {
    const started = Date.now();
    const result = await runSearch(prefs, 'run', 'key', new AbortController().signal, () => {}, { maxAgentRuns: 0, agentDuration: 30, budgetMs: 400, stats: emptyStats() });
    assert.ok(result.listings.length > 0, 'listings from the fast batch are returned');
    assert.ok(Date.now() - started < 5000, 'a hanging batch is cut at the budget');
    assert.ok(result.reports.some(report => report.stage === 'fetch' && report.status === 'error'), 'the slow batch is reported as a source error');
  } finally { clearTimeout(keepAlive); fetchMock.mock.restore(); }
});

test('a quota error from every search is reported as itself, not as a generic failure', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 402 }));
  try {
    await assert.rejects(runSearch(prefs, 'run', 'key', new AbortController().signal, () => {}, { maxAgentRuns: 0, agentDuration: 30, stats: emptyStats() }), /account access|balance/);
  } finally { fetchMock.mock.restore(); }
});

test('opening the detail page of board-only listings (when there is time) makes the score reflect the real posting', async () => {
  const board = 'https://job-boards.greenhouse.io/acme';
  const detail = [`${board}/jobs/111`, `${board}/jobs/222`];
  const calls: string[][] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.search.')) return Response.json({ results: [{ url: board, title: 'Jobs at Acme', snippet: '' }] });
    const body = JSON.parse(String(init?.body)) as { urls: string[] };
    calls.push(body.urls);
    if (body.urls.includes(board)) {
      return Response.json({ results: [{ url: board, title: 'Careers', text: `# Careers\n\n[Software Engineer Intern](${detail[0]})\n\n[Software Engineer Intern II](${detail[1]})` }], errors: [] });
    }
    return Response.json({ results: body.urls.map(source => ({ url: source, title: 'Software Engineer Intern', text: page.replace('London', 'Bengaluru, India') })), errors: [] });
  });
  const keepAlive = setTimeout(() => {}, 10_000);
  try {
    // Under 25s of budget there is no time to open details, so board stubs stay unverified; with time they are opened.
    const run = (deep: boolean, budgetMs: number) => runSearch({ ...prefs, location: 'Bengaluru', country: 'IN', sources: ['greenhouse'] }, 'run', 'key', new AbortController().signal, () => {}, { maxAgentRuns: 0, agentDuration: 30, budgetMs, deep, stats: emptyStats() });
    const normal = await run(false, 20_000);
    assert.ok(normal.listings.length > 0 && normal.listings.every(job => job.verification === 'board'), 'without time, board stubs stay unverified');
    calls.length = 0;
    const deep = await run(false, 60_000);
    assert.ok(calls.some(urls => urls.some(url => detail.includes(url))), 'a second Fetch opens the job detail pages');
    assert.ok(deep.listings.length > 0 && deep.listings.every(job => job.verification === 'detail' && job.location.includes('Bengaluru')));
    assert.ok(deep.listings[0].match_score > normal.listings[0].match_score, 'confirmed details raise the match score');
    assert.ok(calls.every(urls => urls.length <= 10), 'never more than 10 URLs per Fetch call');
  } finally { clearTimeout(keepAlive); fetchMock.mock.restore(); }
});

// ---- Intern search against company ATS feeds (what real TinyFish returned for these shapes) ----
const gh = (token: string, id: number) => `https://job-boards.greenhouse.io/${token}/jobs/${id}`;
const feed = (company: string, base: number) => '```\n' + JSON.stringify({ jobs: [
  { id: base, title: 'Software Engineer, Intern (Summer 2027)', location: { name: 'Bengaluru, India' }, first_published: '2026-09-20T00:00:00Z', company_name: company },
  { id: base + 1, title: 'Software Engineer Intern', location: { name: 'San Francisco, CA' }, first_published: '2026-09-21T00:00:00Z', company_name: company },
  { id: base + 2, title: 'Staff Software Engineer', location: { name: 'Bengaluru, India' }, first_published: '2026-09-01T00:00:00Z', company_name: company },
  { id: base + 3, title: 'Internal Audit Lead', location: { name: 'London' }, first_published: '2026-09-01T00:00:00Z', company_name: company },
] }) + '\n```';
const tokens = Array.from({ length: 8 }, (_, i) => `co${i}`);
const internPrefs = { ...prefs, role: 'Software Engineer Intern', location: 'Remote', country: 'IN', seniority: 'intern' as const, sources: ['greenhouse' as const], filters: { ...prefs.filters, experience: { band: 'entry' as const, min: null, max: null }, employmentType: 'full_time' as const } };

test('intern search reads company ATS feeds, returns 6+ open posts, drops closed hits and never fetches more than 10 URLs per call', async () => {
  const calls: string[][] = [];
  let agentCalls = 0;
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.search.')) return Response.json({ results: [...tokens.map((token, i) => ({ url: gh(token, 1000 + i * 10), title: `Software Engineer, Intern (Summer 2027)`, snippet: 'Apply for this internship.' })), { url: gh('co0', 999), title: 'Software Engineer Intern', snippet: 'a closed posting' }] });
    if (url.includes('run-sse')) { agentCalls++; throw new Error('agents must not run when 6 strong matches exist'); }
    const body = JSON.parse(String(init?.body)) as { urls: string[] };
    calls.push(body.urls);
    return Response.json({ results: body.urls.map(source => { const token = /boards\/([^/]+)\/jobs/.exec(source)?.[1] ?? 'co0'; return { url: source, title: null, text: feed(token.toUpperCase(), 1000 + Number(token.slice(2)) * 10) }; }), errors: [] });
  });
  try {
    const result = await runSearch(internPrefs, 'run', 'key', new AbortController().signal, () => {}, { maxAgentRuns: 2, agentDuration: 30, budgetMs: 60_000, stats: emptyStats() });
    assert.ok(result.listings.length >= 6, `expected 6+ open intern posts, got ${result.listings.length}`);
    assert.equal(result.strict, result.listings.length, 'all strict: Remote keeps the unstated work modes');
    assert.ok(result.listings.every(job => job.facts.open_on_board && job.verification === 'detail' && /intern/i.test(job.title)));
    assert.ok(!result.listings.some(job => job.apply_url.endsWith('/jobs/999')), 'a hit that is not on its company board is closed and dropped');
    assert.ok(result.listings.every(job => job.location.includes('India') || job.location.includes('San Francisco')) === true);
    assert.ok(calls.length > 0 && calls.every(urls => urls.length <= 10), 'Fetch never gets more than 10 URLs per call');
    assert.ok(calls.some(urls => urls.some(url => url.startsWith('https://boards-api.greenhouse.io/v1/boards/'))), 'company feeds are read through Fetch');
    assert.equal(agentCalls, 0);
    assert.ok(result.listings[0].match_score >= result.listings.at(-1)!.match_score && result.listings[0].match_score > 60);
  } finally { fetchMock.mock.restore(); }
});

test('when board feeds cannot be read, Search hits still come back as clearly unverified posts', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.search.')) return Response.json({ results: tokens.map((token, i) => ({ url: gh(token, 2000 + i), title: `Software Engineer Intern - Bengaluru`, snippet: 'Internship.' })) });
    const body = JSON.parse(String(init?.body)) as { urls: string[] };
    return Response.json({ results: [], errors: body.urls.map(source => ({ url: source, error: 'timeout' })) });
  });
  try {
    const result = await runSearch(internPrefs, 'run', 'key', new AbortController().signal, () => {}, { maxAgentRuns: 0, agentDuration: 30, budgetMs: 60_000, stats: emptyStats() });
    assert.ok(result.listings.length >= 6);
    assert.ok(result.listings.every(job => job.verification === 'board' && job.match_score <= 65 && job.uncertainties.some(note => /not inspected/.test(note))));
  } finally { fetchMock.mock.restore(); }
});
