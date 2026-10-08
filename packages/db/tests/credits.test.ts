import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { neonConfig } from '@neondatabase/serverless';
import { addCredits, creditAudit, creditLedger, DEEP_SEARCH_COST, ensureProfile, forgetEnsuredProfiles, getWallet, reconcileStaleSearches, SearchConflictError, searchByRequest, SEARCH_COST, settleSearch, spendCredits, startSearch } from '../src/index';
import { migrations } from '../src/schema';
import { activeHuntJobs, claimHuntJob, claimHuntDispatch, getHuntJob, listHuntAgents, releaseFailedHunt, reserveHuntAgent, saveHuntCheckpoint } from '../src/jobs';
import { hasRunningSearch, runningSearch, getSearch, saveTinyfishKey } from '../src/index';
import { launchHuntAgent, pollHuntAgents, recoverTerminalHunt } from '../../../apps/web/lib/hunt-job';
import { defaultPreferences } from '@minnow/core';
import { mock } from 'node:test';

function pgText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 't' : 'f';
  if (value instanceof Date) return value.toISOString().replace('T', ' ').replace('Z', '+00');
  if (Array.isArray(value)) return `{${value.map(item => `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// A real Postgres (PGlite) behind the Neon HTTP driver. `loseResponseOf` runs the matching statement, then fails the
// network call, which is exactly the "charged but the client never heard back" case.
async function withDatabase(run: (db: PGlite, control: { loseResponseOf: RegExp | null }) => Promise<void>) {
  const db = new PGlite();
  await db.exec(`BEGIN; ${migrations.join(';\n')}; COMMIT;`);
  const oldUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://test:test@db.test/test';
  const original = neonConfig.fetchFunction;
  const control: { loseResponseOf: RegExp | null } = { loseResponseOf: null };
  neonConfig.fetchFunction = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { query?: string; params?: unknown[]; queries?: { query: string; params: unknown[] }[] };
    const execute = async (query: { query: string; params: unknown[] }) => {
      const result = await db.query<Record<string, unknown>>(query.query, query.params);
      return { fields: result.fields, rows: result.rows.map(row => result.fields.map(field => pgText(row[field.name]))), rowCount: result.affectedRows ?? result.rows.length };
    };
    try {
      let response: Response;
      if (body.queries) {
        const results = [];
        await db.exec('BEGIN');
        try { for (const query of body.queries) results.push(await execute(query)); await db.exec('COMMIT'); } catch (error) { await db.exec('ROLLBACK'); throw error; }
        response = Response.json({ results });
      } else response = Response.json(await execute({ query: body.query!, params: body.params ?? [] }));
      if (control.loseResponseOf && control.loseResponseOf.test(body.query ?? '')) { control.loseResponseOf = null; throw new TypeError('fetch failed'); }
      return response;
    } catch (error) {
      if (error instanceof TypeError) throw error;
      return Response.json({ message: error instanceof Error ? error.message : 'query failed' }, { status: 400 });
    }
  };
  forgetEnsuredProfiles();
  try { await run(db, control); } finally {
    neonConfig.fetchFunction = original;
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
    await db.close();
  }
}

const start = (userId: string, cost: number, extra: { requestId?: string; reason?: string } = {}) =>
  startSearch({ userId, snapshot: { role: 'Engineer', hash: Math.random().toString() }, cacheHit: false, cost, reason: extra.reason ?? (cost === DEEP_SEARCH_COST ? 'deep_search' : 'search'), requestId: extra.requestId });
const uuid = () => crypto.randomUUID();
const balance = async (id: string) => (await getWallet(id))!.credits;
const noDrift = async (id: string) => assert.deepEqual((await creditAudit(id))?.drift, 0, 'wallet equals the sum of its ledger');

test('signup grants exactly 10 credits once, and the balance is stable across sessions and refreshes', async () => {
  await withDatabase(async () => {
    await ensureProfile('new-user', 'Nia');
    assert.equal(await balance('new-user'), 10);
    assert.deepEqual((await creditLedger('new-user')).map(row => [row.delta, row.reason]), [[10, 'signup']]);
    // A new session / refresh / another server instance runs ensureProfile again: nothing is granted twice.
    for (let i = 0; i < 3; i++) { forgetEnsuredProfiles(); await ensureProfile('new-user', 'Nia'); }
    await Promise.all([ensureProfile('new-user', 'Nia'), ensureProfile('other', 'Omar')]);
    assert.equal(await balance('new-user'), 10);
    assert.equal((await creditLedger('new-user')).length, 1);
    assert.equal(await balance('other'), 10);
    await noDrift('new-user');
  });
});

test('Search costs 1, Deep Search costs 2, and each charge is tied to its search and ledger row', async () => {
  await withDatabase(async () => {
    await ensureProfile('u', 'U');
    const normal = await start('u', SEARCH_COST);
    assert.equal(await balance('u'), 9);
    await settleSearch(normal!.search.id, 'done', null, { search: 1, fetch: 1, agent: 0 }, false);
    const deep = await start('u', DEEP_SEARCH_COST);
    assert.equal(await balance('u'), 7);
    await settleSearch(deep!.search.id, 'done', null, { search: 1, fetch: 1, agent: 1 }, false);
    const ledger = await creditLedger('u');
    assert.deepEqual(ledger.slice(0, 2).map(row => [row.delta, row.reason, row.search_id]), [[-2, 'deep_search', deep!.search.id], [-1, 'search', normal!.search.id]]);
    // Free paths: cache replay or own key (cost 0) never touch the wallet.
    const free = await start('u', 0);
    await settleSearch(free!.search.id, 'done', null, { search: 0, fetch: 0, agent: 0 }, true);
    assert.equal(await balance('u'), 7, 'a refund of a free search is nothing');
    await noDrift('u');
  });
});

test('not enough credits changes nothing: no charge, no search row', async () => {
  await withDatabase(async db => {
    await ensureProfile('poor', 'P');
    await addCredits('poor', -9);
    assert.equal(await balance('poor'), 1);
    assert.equal(await start('poor', DEEP_SEARCH_COST), null);
    assert.equal(await balance('poor'), 1);
    assert.equal((await db.query('SELECT 1 FROM searches')).rows.length, 0);
    assert.equal(await spendCredits('poor', 2), null);
    assert.equal(await addCredits('poor', -5), false, 'a removal beyond the balance is refused');
    assert.equal(await balance('poor'), 1);
    await noDrift('poor');
  });
});

test('double click or two tabs: exactly one search is charged', async () => {
  await withDatabase(async db => {
    await ensureProfile('racer', 'R');
    const results = await Promise.allSettled([start('racer', SEARCH_COST), start('racer', SEARCH_COST), start('racer', DEEP_SEARCH_COST)]);
    const won = results.filter(result => result.status === 'fulfilled');
    const lost = results.filter(result => result.status === 'rejected');
    assert.equal(won.length, 1);
    assert.ok(lost.every(result => (result as PromiseRejectedResult).reason instanceof SearchConflictError));
    const charged = 10 - (await balance('racer'));
    assert.ok(charged === 1 || charged === 2, 'only the winner paid');
    assert.equal((await db.query('SELECT 1 FROM searches')).rows.length, 1);
    await noDrift('racer');
  });
});

test('a retried click (same request id) is idempotent, even when the first response was lost', async () => {
  await withDatabase(async (_db, control) => {
    await ensureProfile('flaky', 'F');
    const requestId = uuid();
    control.loseResponseOf = /INSERT INTO searches/; // the server charges, the client never hears back
    await assert.rejects(start('flaky', DEEP_SEARCH_COST, { requestId }), /fetch failed/);
    assert.equal(await balance('flaky'), 8, 'the first attempt really was charged');
    const retry = await start('flaky', DEEP_SEARCH_COST, { requestId });
    assert.equal(retry!.existing, true);
    assert.equal(await balance('flaky'), 8, 'the retry is not charged again');
    assert.equal((await searchByRequest('flaky', requestId))!.id, retry!.search.id);
    // Concurrent duplicates of one click collapse to one charge too.
    await settleSearch(retry!.search.id, 'done', null, { search: 1, fetch: 1, agent: 1 }, false);
    const again = uuid();
    const both = await Promise.allSettled([start('flaky', SEARCH_COST, { requestId: again }), start('flaky', SEARCH_COST, { requestId: again })]);
    assert.ok(both.every(result => result.status === 'fulfilled'));
    assert.equal(await balance('flaky'), 7);
    await noDrift('flaky');
  });
});

test('refunds happen exactly once, whichever path settles the search first', async () => {
  await withDatabase(async db => {
    await ensureProfile('refunds', 'R');
    const failed = await start('refunds', DEEP_SEARCH_COST);
    assert.equal(await balance('refunds'), 8);
    assert.deepEqual(await settleSearch(failed!.search.id, 'error', 'boom', { search: 1, fetch: 0, agent: 0 }, true), { settled: true, refunded: 2 });
    assert.deepEqual(await settleSearch(failed!.search.id, 'error', 'again', { search: 1, fetch: 0, agent: 0 }, true), { settled: false, refunded: 0 }, 'a second settle is a no-op');
    assert.equal(await reconcileStaleSearches('refunds'), 0);
    assert.equal(await balance('refunds'), 10);
    // A hunt killed by the platform is refunded by the stale cleanup, and a late settle cannot refund it again.
    const killed = await start('refunds', SEARCH_COST);
    await db.query(`UPDATE searches SET created_at=now()-interval '10 minutes' WHERE id=$1`, [killed!.search.id]);
    assert.equal(await reconcileStaleSearches('refunds'), 1);
    assert.equal(await reconcileStaleSearches('refunds'), 0);
    assert.deepEqual(await settleSearch(killed!.search.id, 'error', 'late', { search: 0, fetch: 0, agent: 0 }, true), { settled: false, refunded: 0 });
    assert.equal(await balance('refunds'), 10);
    // A hunt that found jobs keeps its charge.
    const good = await start('refunds', SEARCH_COST);
    await settleSearch(good!.search.id, 'done', null, { search: 1, fetch: 1, agent: 0 }, false);
    assert.equal(await balance('refunds'), 9);
    await noDrift('refunds');
  });
});

test('no drift after many mixed searches, retries, failures and top-ups', async () => {
  await withDatabase(async () => {
    await ensureProfile('soak', 'S');
    await addCredits('soak', 40, 'admin');
    let expected = 50;
    for (let i = 0; i < 24; i++) {
      const deep = i % 3 === 0;
      const cost = deep ? DEEP_SEARCH_COST : SEARCH_COST;
      const requestId = uuid();
      const first = await start('soak', cost, { requestId });
      const retry = await start('soak', cost, { requestId }); // back/forward or double submit
      assert.equal(retry!.existing, true);
      expected -= cost;
      const outcome = i % 4;
      if (outcome === 0) { await settleSearch(first!.search.id, 'error', 'network', { search: 0, fetch: 0, agent: 0 }, true); expected += cost; }
      else if (outcome === 1) { await settleSearch(first!.search.id, 'done', null, { search: 1, fetch: 0, agent: 0 }, true); expected += cost; } // found nothing
      else await settleSearch(first!.search.id, 'done', null, { search: 1, fetch: 1, agent: 0 }, false);
      assert.equal(await balance('soak'), expected, `after run ${i}`);
    }
    await noDrift('soak');
    assert.equal(await balance('soak'), expected);
  });
});

test('durable outbox is atomic with billing and remains active past six minutes',async()=>{
  await withDatabase(async(db,control)=>{
    await ensureProfile('durable','D');
    const requestId=uuid();
    const input={userId:'durable',snapshot:{role:'Engineer'},cacheHit:false,cost:2,reason:'deep_search',requestId,job:{version:1,user:{id:'durable'}}};
    control.loseResponseOf=/INSERT INTO searches/;
    await assert.rejects(startSearch(input),/fetch failed/);
    const recovered=await startSearch(input);
    const id=recovered!.search.id;
    assert.equal(recovered!.existing,true);
    assert.equal(await balance('durable'),8);
    assert.ok(await getHuntJob(id),'lost acceptance response still leaves a dispatchable outbox');
    assert.equal((await activeHuntJobs()).length,1);
    await db.query("UPDATE searches SET created_at=now()-interval '30 minutes' WHERE id=$1",[id]);
    assert.equal(await reconcileStaleSearches('durable'),0);
    assert.equal((await getSearch(id))?.status,'running');
    assert.equal(await hasRunningSearch('durable'),true);
    assert.equal((await runningSearch('durable'))?.id,id);
    assert.equal(await balance('durable'),8,'reading/reconciling does not refund a healthy durable job');
    assert.equal(await claimHuntDispatch(id,uuid()),true);
    assert.equal(await claimHuntDispatch(id,uuid()),false,'dispatch lease excludes simultaneous dispatchers');
    assert.ok(await claimHuntJob(id,'workflow-a'));
    assert.equal(await claimHuntJob(id,'workflow-b'),undefined,'only one workflow performs paid work');
    await saveHuntCheckpoint(id,'workflow-a',{agentTargets:['https://example.com/jobs'],saved:true});
    await releaseFailedHunt(id,'workflow-b');
    assert.equal((await getHuntJob(id))?.workflow_id,'workflow-a','a stale owner cannot release a live one');
    await releaseFailedHunt(id,'workflow-a');
    assert.ok(await claimHuntJob(id,'workflow-recovery'));
    assert.equal((await getHuntJob(id))?.checkpoint?.saved,true);
    await assert.rejects(saveHuntCheckpoint(id,'workflow-a',{}),/ownership/);
    await settleSearch(id,'done',null,{search:1,fetch:1,agent:0},false);
    assert.equal((await activeHuntJobs()).length,0);
    await noDrift('durable');
  });
});

test('async Agent recovery reuses upstream identity after an accepted POST loses its acknowledgement',async()=>{
  await withDatabase(async()=>{
    await ensureProfile('agent-owner','A');
    const oldKey=process.env.TINYFISH_API_KEY;
    process.env.TINYFISH_API_KEY='fixture-key';
    const input={role:'Engineer',profession:'',location_label:'London',location_country_code:'GB',work_mode:'any',keywords:[],filters:defaultPreferences.filters};
    const created=await startSearch({userId:'agent-owner',snapshot:{role:'Engineer'},cacheHit:false,cost:1,reason:'search',job:{user:{id:'agent-owner',name:'A'},input,skills:[],useOwnKey:false,deep:false}});
    const id=created!.search.id;
    await claimHuntJob(id,'workflow');
    let launches=0;let complete=false;let marker='';
    const calls:string[]=[];
    const transport=mock.method(globalThis,'fetch',async(request:string|URL|Request,init?:RequestInit)=>{
      const url=String(request);calls.push(url);
      if(url.endsWith('/run-async')) {launches++;const body=JSON.parse(String(init?.body));assert.equal(body.agent_config,undefined);marker=/Tracking reference: ([^ ]+)\./.exec(body.goal)![1];throw new TypeError('Lost acknowledgement after upstream acceptance');}
      if(url.includes('/runs?goal=')) return Response.json({data:[{run_id:'upstream-123',goal:`Tracking reference: ${marker}.`}]});
      if(url.includes('/runs/upstream-123')) return Response.json({run_id:'upstream-123',status:complete?'COMPLETED':'RUNNING',result:complete?{listings:[]}:null});
      throw new Error(`Unexpected URL ${url}`);
    });
    try{
      const url='https://jobs.ashbyhq.com/example';
      await launchHuntAgent(id,'workflow',url);
      assert.equal((await listHuntAgents(id))[0].status,'unknown');
      await launchHuntAgent(id,'workflow',url);
      assert.equal(launches,1);
      assert.equal(await pollHuntAgents(id,'workflow'),false);
      assert.equal((await listHuntAgents(id))[0].run_id,'upstream-123');
      await releaseFailedHunt(id,'workflow');await claimHuntJob(id,'recovered-workflow');
      await launchHuntAgent(id,'recovered-workflow',url);
      complete=true;
      assert.equal(await pollHuntAgents(id,'recovered-workflow'),true);
      assert.equal((await listHuntAgents(id))[0].status,'completed');
      assert.equal(launches,1,'workflow recovery cannot launch the same paid source again');
      assert.equal(calls.some(url=>url.endsWith('/cancel')),false);
      assert.equal(await reserveHuntAgent(id,url,'new-marker'),undefined);
    }finally{transport.mock.restore();if(oldKey===undefined)delete process.env.TINYFISH_API_KEY;else process.env.TINYFISH_API_KEY=oldKey;}
  });
});

test('repeated terminal discovery failure refunds once, but active Agents remain recoverable',async()=>{
  await withDatabase(async()=>{
    await ensureProfile('recovery-policy','R');
    assert.equal(await saveTinyfishKey('recovery-policy','fixture-own-key'),true);
    const first=await startSearch({userId:'recovery-policy',snapshot:{},cost:2,cacheHit:false,reason:'deep_search',job:{useOwnKey:false}});
    const id=first!.search.id;
    for(let i=0;i<3;i++) {
      await claimHuntJob(id,`owner-${i}`);
      if(i<2) {assert.equal(await recoverTerminalHunt(id,`owner-${i}`),'retry');await releaseFailedHunt(id,`owner-${i}`);}
    }
    assert.equal(await recoverTerminalHunt(id,'owner-2'),'settled');
    assert.equal((await getSearch(id))?.status,'error');
    assert.equal(await balance('recovery-policy'),10);
    await recoverTerminalHunt(id,'owner-2');
    assert.equal((await creditLedger('recovery-policy')).filter(row=>row.reason==='refund').length,1);
    const own=await startSearch({userId:'recovery-policy',snapshot:{},cost:0,cacheHit:false,reason:'search',job:{useOwnKey:true}});
    assert.ok(own);
    // A stored personal key cannot disappear while its durable hunt depends on it.
    assert.equal(await saveTinyfishKey('recovery-policy',null),false);
    await settleSearch(own!.search.id,'done',null,{search:0,fetch:0,agent:0},false);
    assert.equal(await saveTinyfishKey('recovery-policy',null),true);
    const second=await startSearch({userId:'recovery-policy',snapshot:{},cost:1,cacheHit:false,reason:'search',job:{}});
    const agentId=second!.search.id;
    for(let i=0;i<4;i++){await claimHuntJob(agentId,`agent-owner-${i}`);if(i<3)await releaseFailedHunt(agentId,`agent-owner-${i}`);}
    await reserveHuntAgent(agentId,'https://example.com/careers','marker');
    assert.equal(await recoverTerminalHunt(agentId,'agent-owner-3'),'retry');
    assert.equal((await getSearch(agentId))?.status,'running');
    assert.equal(await balance('recovery-policy'),9);
    await noDrift('recovery-policy');
  });
});
