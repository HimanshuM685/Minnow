import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, type SearchEvent } from '../src/contracts.js';
import { runSearch } from '../../../apps/web/lib/pipeline.js';

test('pipeline reads selected job details in small parallel batches, escalates a thin board and retains partial failures', async () => {
  const board = 'https://job-boards.greenhouse.io/acme';
  const detail = `${board}/jobs/12345`;
  const closed = `${board}/jobs/99999`;
  const ashby = 'https://jobs.ashbyhq.com/beta';
  const agentJob = `${ashby}/12345678-1234-1234-1234-123456789012`;
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  const mocked = mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ url, body });
    assert.equal((init?.headers as Record<string, string>)['X-API-Key'], 'test-key');
    if (url.startsWith('https://api.search.')) {
      assert.equal(new URL(url).searchParams.get('location'), 'GB');
      return Response.json({ results: [{ url: detail, title: 'Software Engineer Intern at Acme', snippet: 'Internships' }, { url: closed, title: 'Software Engineer Intern at Acme', snippet: 'Internships' }, { url: ashby, title: 'Jobs at Beta', snippet: 'Internships' }] });
    }
    if (url === 'https://api.fetch.tinyfish.ai') {
      assert.equal(body?.ttl, 600);
      assert.equal(body?.links, true);
      const urls = body?.urls as string[];
      assert.ok(urls.length <= 10);
      const results = urls.filter(item => item !== closed).map(item => ({ url: item, title: item === detail ? 'Software Engineer Intern at Acme' : 'Careers', text: item === board
        ? `# Careers\n\n[Software Engineer Intern](${detail})\n\n[Software Engineer Intern](${closed})`
        : item === ashby ? 'You need to enable JavaScript to view the careers application.'
        : '# Software Engineer Intern\n\nLocation: London\n\n## The role\n\nBuild Python services for customers, learn from experienced engineers and ship products that improve how teams work. You will collaborate with engineers on software development. Apply for this position today.' }));
      return Response.json({ results, errors: urls.includes(closed) ? [{ url: closed, error: 'page_not_found', status: 404 }] : [] });
    }
    if (url.endsWith('/run-async')) {
      assert.equal(body?.url, ashby);
      assert.ok(body?.output_schema);
      assert.equal(body?.agent_config, undefined, 'no automatic wall-clock cutoff');
      return Response.json({run_id:'agent-123',error:null});
    }
    if(url.includes('/runs/agent-123')) return Response.json({run_id:'agent-123',status:'COMPLETED',result:{listings:[{ title: 'Software Engineer Intern', company: 'Beta', location: 'London', apply_url: agentJob, snippet: 'Work with Python services.', visa_evidence: '', visa_signal: 'unknown', seniority: 'intern', work_mode: 'unknown' }]}});
    throw new Error(`Unexpected request ${url}`);
  });
  try {
    const events: SearchEvent[] = [];
    const result = await runSearch({ ...defaultPreferences, role: 'Software engineer', seniority: 'intern', location: 'London', sources: ['greenhouse', 'ashby'] }, 'r1', 'test-key', new AbortController().signal, event => events.push(event), { maxAgentRuns: 2, agentDuration: 30 });
    assert.equal(result.listings.length, 2);
    assert.equal(result.stats.companies, 2);
    assert.equal(result.stats.searchRequests, 4, 'two ATS families, each with an internship wording variant');
    assert.equal(result.stats.fetchRequests, 4, 'one board-feed call plus three candidate pages in parallel batches');
    assert.equal(result.stats.agentRuns, 1);
    assert.ok(result.reports.some(report => report.url === closed && report.status === 'error'));
    assert.ok(result.listings.every(job => job.verification === 'detail'));
    assert.ok(result.listings.some(job => job.extraction === 'agent'));
    assert.ok(events.some(event => event.type === 'partial'));
    assert.ok(events.some(event => event.type === 'progress' && event.stage === 'agent'));
    assert.ok(calls.length >= 4);
  } finally { mocked.mock.restore(); }
});

test('Observatory-skipped hosts are dropped before Fetch and the decision is traced', async()=>{
  const blocked='https://job-boards.greenhouse.io/acme/jobs/12345';
  const events:SearchEvent[]=[];
  const fetchMock=mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{
    assert.ok(String(input).startsWith('https://api.search.'));
    return Response.json({results:[{url:blocked,title:'Software Engineer Intern',snippet:''}]});
  });
  try{
    const result=await runSearch({...defaultPreferences,role:'Software engineer',sources:['greenhouse']},'skipped-run','test-key',new AbortController().signal,event=>events.push(event),{maxAgentRuns:0,agentDuration:30,skippedHosts:['greenhouse.io']});
    assert.equal(result.stats.fetchRequests,0);
    assert.ok(events.some(event=>event.type==='source' && event.report.message==='Host skipped by Observatory'));
  }finally{fetchMock.mock.restore();}
});

test('stopping an Agent observer never cancels the upstream run', async () => {
  const { TinyFishClient } = await import('../../../apps/web/lib/tinyfish.js');
  const { emptyStats } = await import('../../../apps/web/lib/pipeline.js');
  const controller = new AbortController();
  const calls: string[] = [];
  const mocked = mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if(url.endsWith('/run-async')) {const body=JSON.parse(String(init?.body));assert.equal(body.agent_config,undefined);return Response.json({run_id:'keep-running',error:null});}
    return Response.json({run_id:'keep-running',status:'RUNNING',steps:[{action:'Loading'}]});
  });
  try {
    const client = new TinyFishClient('test-key', emptyStats(), controller.signal);
    await assert.rejects(client.agent('https://jobs.ashbyhq.com/acme', { ...defaultPreferences, role: 'Engineer' }, 30, () => controller.abort()));
    assert.ok(calls.some(url => url.includes('/runs/keep-running')));
    assert.equal(calls.filter(url=>url.endsWith('/cancel')).length,0);
  } finally { mocked.mock.restore(); }
});
