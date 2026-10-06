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

test('deep mode opens the detail page of board-only listings so the score reflects the real posting', async () => {
  const board = 'https://job-boards.greenhouse.io/acme';
  const detail = [`${board}/jobs/111`, `${board}/jobs/222`];
  const calls: string[][] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://api.search.')) return Response.json({ results: [{ url: board, title: 'Jobs at Acme', snippet: '' }] });
    const body = JSON.parse(String(init?.body)) as { urls: string[] };
    calls.push(body.urls);
    if (body.urls.includes(board)) {
      return Response.json({ results: [{ url: board, title: 'Careers', text: `# Careers\n\n[Software Engineer](${detail[0]})\n\n[Software Engineer II](${detail[1]})` }], errors: [] });
    }
    return Response.json({ results: body.urls.map(source => ({ url: source, title: 'Software Engineer', text: page.replace('London', 'Bengaluru, India') })), errors: [] });
  });
  const keepAlive = setTimeout(() => {}, 10_000);
  try {
    const run = (deep: boolean) => runSearch({ ...prefs, location: 'Bengaluru', country: 'IN', sources: ['greenhouse'] }, 'run', 'key', new AbortController().signal, () => {}, { maxAgentRuns: 0, agentDuration: 30, budgetMs: 60_000, deep, stats: emptyStats() });
    const normal = await run(false);
    assert.ok(normal.listings.length > 0 && normal.listings.every(job => job.verification === 'board'), 'normal mode keeps board stubs');
    calls.length = 0;
    const deep = await run(true);
    assert.ok(calls.some(urls => urls.some(url => detail.includes(url))), 'a second Fetch opens the job detail pages');
    assert.ok(deep.listings.length > 0 && deep.listings.every(job => job.verification === 'detail' && job.location.includes('Bengaluru')));
    assert.ok(deep.listings[0].match_score > normal.listings[0].match_score, 'confirmed details raise the match score');
    assert.ok(calls.every(urls => urls.length <= 10), 'never more than 10 URLs per Fetch call');
  } finally { clearTimeout(keepAlive); fetchMock.mock.restore(); }
});
