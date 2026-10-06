import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { neonConfig } from '@neondatabase/serverless';
import { forgetEnsuredProfiles, reconcileStaleSearches, hasRunningSearch, addCredits, getWallet, spendCredit, addSearchEvent, copyCachedListings, createSearch, ensureProfile, findCachedSearch, finishSearch, getPreferences, getProfile, getResume, getSearchEvents, getSearchListings, hideListing, insertListings, listPeople, listSources, overviewStats, savePreferences, skippedHosts, skipSource, updateProfile, updateSourceHealth, upsertResume, downloadResume } from '../src/index';
import { executeHunt, type HuntMessage } from '../../../apps/web/lib/hunt';
import { getSearch } from '../src/index';
import { migrations } from '../src/schema';

function pgText(value: unknown): string|null {
  if(value===null || value===undefined) return null;
  if(typeof value==='boolean') return value?'t':'f';
  if(value instanceof Date) return value.toISOString().replace('T',' ').replace('Z','+00');
  if(Array.isArray(value)) return `{${value.map(item=>`"${String(item).replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`).join(',')}}`;
  if(typeof value==='object') return JSON.stringify(value);
  return String(value);
}

test('Neon query helpers round-trip preferences, durable traces, moderation, cache replay, resumes and source skipping', async () => {
  const db=new PGlite();
  await db.exec(`BEGIN; ${migrations.join(';\n')}; COMMIT;`);
  const oldUrl=process.env.DATABASE_URL;
  process.env.DATABASE_URL='postgresql://test:test@db.test/test';
  const original=neonConfig.fetchFunction;
  neonConfig.fetchFunction=async (_input, init) => {
    const body=JSON.parse(String(init?.body)) as {query?:string;params?:unknown[];queries?:{query:string;params:unknown[]}[]};
    const execute=async (query: {query:string;params:unknown[]}) => {
      const result=await db.query<Record<string,unknown>>(query.query,query.params);
      return { fields:result.fields, rows:result.rows.map(row=>result.fields.map(field=>pgText(row[field.name]))),rowCount:result.affectedRows??result.rows.length };
    };
    try {
      if(body.queries) {
        const results=[];
        await db.exec('BEGIN');
        try { for(const query of body.queries) results.push(await execute(query)); await db.exec('COMMIT'); }
        catch(error){await db.exec('ROLLBACK');throw error;}
        return Response.json({results});
      }
      return Response.json(await execute({query:body.query!,params:body.params??[]}));
    } catch(error){return Response.json({message:error instanceof Error ? error.message : 'query failed'},{status:400});}
  };
  try {
    forgetEnsuredProfiles();
    await ensureProfile('user-a','Ada'); await ensureProfile('user-b','Grace');
    assert.equal((await getWallet('user-a'))?.credits,10);
    for(let i=9;i>=0;i--) assert.equal(await spendCredit('user-a'),i);
    assert.equal(await spendCredit('user-a'),null);
    await addCredits('user-a',2); assert.equal((await getWallet('user-a'))?.credits,2);
    await savePreferences('user-a',{ role:'Software engineer',profession:'Engineering',location_label:'London',location_country_code:'GB',seniority:'intern',work_mode:'hybrid',visa:'needs_sponsorship',keywords:['Python','SQL'] });
    assert.equal((await getPreferences('user-a'))?.role,'Software engineer');
    await updateProfile('user-a', 'Ada Lovelace', 'Computer Scientist', 'Computing pioneer');
    const profile = await getProfile('user-a');
    assert.equal(profile?.display_name, 'Ada Lovelace');
    assert.equal(profile?.profession, 'Computer Scientist');
    assert.equal(profile?.headline, 'Computing pioneer');
    assert.equal((await getPreferences('user-a'))?.profession, 'Computer Scientist');
    const first=await createSearch({userId:'user-a',preferenceSnapshot:{role:'Software engineer',hash:'prefs-hash'}});
    await addSearchEvent(first.id,'search','api.search.tinyfish.ai','https://api.search.tinyfish.ai',true,'Discovered two sources');
    await addSearchEvent(first.id,'fetch','jobs.example.com','https://jobs.example.com/jobs/1',false,'Page timed out');
    await addSearchEvent(first.id,'rank',null,null,true,'One listing retained');
    const fetchedAt='2026-10-05T10:00:00.000Z';
    const listing={userId:'user-a',searchId:first.id,dedupeKey:'https://jobs.example.com/jobs/1',title:'Software Engineer Intern',company:'Example',location:'London',seniority:'intern',workMode:'hybrid',visaSignal:'unknown',snippet:'Build Python services',applyUrl:'https://jobs.example.com/jobs/1',sourceUrl:'https://jobs.example.com/jobs/1',sourceName:'careers',score:80,matchReasons:['Role matches'],fetchedAt};
    await insertListings([listing,listing]);
    await finishSearch(first.id,'done',null,{search:4,fetch:1,agent:0});
    assert.equal((await getSearchListings(first.id,'user-a')).length,1);
    assert.equal((await getSearchListings(first.id,'user-b')).length,0);
    assert.equal((await getSearchEvents(first.id)).length,3);
    assert.equal((await findCachedSearch('user-a','prefs-hash'))?.id,first.id);
    assert.equal(await findCachedSearch('user-b','prefs-hash'),null);
    const stored=(await getSearchListings(first.id,'user-a'))[0];
    await hideListing(stored.id,true,'Duplicate posting');
    assert.equal((await getSearchListings(first.id,'user-a')).length,0);
    const replay=await createSearch({userId:'user-a',preferenceSnapshot:{hash:'prefs-hash'},cacheHit:true});
    await copyCachedListings(first.id,replay.id,'user-a');
    await finishSearch(replay.id,'done',null,{search:0,fetch:0,agent:0});
    const copied=(await getSearchListings(replay.id,'user-a',true))[0];
    assert.equal(copied.hidden,true);
    assert.equal(new Date(copied.fetched_at).toISOString(),fetchedAt);
    await hideListing(copied.id,false,'');
    assert.equal((await getSearchListings(first.id,'user-a')).length,1);
    await hideListing(copied.id,true,'Hidden on replay');
    assert.equal((await getSearchListings(first.id,'user-a')).length,0,'moderation of a cached copy must propagate to its canonical source');
    await db.query("UPDATE searches SET created_at=now()-interval '16 minutes' WHERE id=$1",[first.id]);
    assert.equal(await findCachedSearch('user-a','prefs-hash'),null,'cache replays must not extend the original live-read TTL');
    await updateSourceHealth('jobs.example.com',false,'timeout');
    await updateSourceHealth('jobs.example.com',true,null);
    await skipSource('jobs.example.com',true);
    assert.deepEqual(await skippedHosts(),['jobs.example.com']);
    const sources=await listSources();
    assert.equal(sources[0].error_count,1);assert.equal(sources[0].ok_count,1);
    const buffer=Buffer.from('Ada: Python, SQL, distributed systems.');
    await upsertResume('user-a','resume.txt','text/plain',buffer,buffer.toString());
    await upsertResume('user-a','replacement.txt','text/plain',buffer,buffer.toString());
    assert.equal((await getResume('user-a'))?.file_name,'replacement.txt');
    assert.equal(await downloadResume('user-b'),null);
    assert.equal(Buffer.from((await downloadResume('user-a'))!.data,'base64').toString(),buffer.toString());
    const people=await listPeople();assert.equal(people.find(p=>p.user_id==='user-a')?.hunts,2);
    const overview=await overviewStats();assert.equal(overview.totals.listings_stored,2);assert.equal(overview.totals.fetch_errors,1);

    // Exercise the actual web orchestrator with real SQL and mocked TinyFish transport.
    const previousKey=process.env.TINYFISH_API_KEY;
    const previousAgent=process.env.MAX_AGENT_RUNS;
    process.env.TINYFISH_API_KEY='test-key';process.env.MAX_AGENT_RUNS='0';
    let fail=false;let tinyfishRequests=0;
    const fetchMock=mock.method(globalThis,'fetch',async(input:string|URL|Request,init?:RequestInit)=>{
      tinyfishRequests++;
      if(fail) return Response.json({error:'invalid key'},{status:401});
      const url=String(input);
      const direct='https://job-boards.greenhouse.io/acme/jobs/12345';
      const second='https://jobs.lever.co/beta/12345678-1234-1234-1234-123456789012';
      if(url.startsWith('https://api.search.')) return Response.json({results:[{url:direct,title:'Software Engineer Intern at Acme',snippet:''},{url:second,title:'Software Engineer Intern at Beta',snippet:''}]});
      const body=JSON.parse(String(init?.body)) as {urls:string[]};
      return Response.json({results:body.urls.map(source=>({url:source,title:`Software Engineer Intern at ${source.includes('lever')?'Beta':'Acme'}`,text:'# Software Engineer Intern\n\nLocation: London\n\nWork arrangement: Hybrid\n\n## About the role\n\nBuild reliable software services in Python and SQL. Learn from experienced engineers and collaborate across teams to solve useful software problems. Apply for this position today.'})),errors:[]});
    });
    try{
      const events:HuntMessage[]=[];
      await executeHunt({id:'user-a',name:'Ada'},true,new AbortController().signal,event=>events.push(event));
      const completed=events.find(event=>event.type==='complete');assert.ok(completed && completed.type==='complete');
      assert.equal(completed.counts.search,5);assert.equal(completed.counts.fetch,2);assert.equal(completed.counts.agent,0);
      assert.equal((await getSearch(completed.searchId))?.status,'done');
      assert.equal((await getSearchListings(completed.searchId,'user-a')).length,2);
      const trace=await getSearchEvents(completed.searchId);
      assert.ok(trace.some(event=>event.step==='parse'));
      assert.ok(trace.some(event=>event.step==='rank'));
      assert.ok(trace.filter(event=>event.step==='fetch' && event.host).length>=2);
      const callsBeforeReplay=tinyfishRequests;
      const replayEvents:HuntMessage[]=[];
      await executeHunt({id:'user-a',name:'Ada'},false,new AbortController().signal,event=>replayEvents.push(event));
      assert.equal(tinyfishRequests,callsBeforeReplay);
      const replayDone=replayEvents.find(event=>event.type==='complete');assert.ok(replayDone && replayDone.type==='complete');
      assert.equal(replayDone.cacheHit,true);assert.equal((await getSearch(replayDone.searchId))?.cache_hit,true);
      fail=true;
      const failureEvents:HuntMessage[]=[];
      await assert.rejects(executeHunt({id:'user-a',name:'Ada'},true,new AbortController().signal,event=>failureEvents.push(event)),/API key/);
      const failure=failureEvents.find(event=>event.type==='started');assert.ok(failure && failure.type==='started');
      assert.equal((await getSearch(failure.searchId))?.status,'error');
      assert.ok((await getSearchEvents(failure.searchId)).some(event=>event.ok===false && event.step==='search'));
      // Credit correctness: a failed hunt is refunded, a cached replay is free, the balance never goes negative.
      const balance=async(id='user-a')=>(await getWallet(id))!.credits;
      const afterFailure=await balance();
      assert.equal(afterFailure,1,'2 credits: live hunt charged 1, replay free, failed hunt refunded');
      assert.equal(await balance('user-b'),10,'untouched wallets keep their full balance');
      // Filters are real hunt inputs: the unsaved form wins, hard filters drop and are counted, the snapshot keeps them.
      fail=false;
      const form=(over:object)=>({role:'Software Engineer',profession:'',location_label:'',location_country_code:'',work_mode:'any',keywords:[],filters:{},...over});
      const strict:HuntMessage[]=[];
      await executeHunt({id:'user-a',name:'Ada'},true,new AbortController().signal,event=>strict.push(event),form({work_mode:'onsite',filters:{employmentType:'full_time',skills:['Python']}}));
      const strictDone=strict.find(event=>event.type==='complete');assert.ok(strictDone && strictDone.type==='complete');
      assert.equal(strictDone.found,0);
      assert.deepEqual(strictDone.dropped,[{filter:'Work mode',count:2}],'the empty result names the hard filter that removed everything');
      const strictRun=await getSearch(strictDone.searchId);
      assert.equal(strictRun?.preference_snapshot.work_mode,'onsite');
      assert.equal((strictRun?.preference_snapshot.filters as {employmentType:string}).employmentType,'full_time');
      assert.equal(strictRun?.preference_snapshot.hard_filter_drop_total,2);
      assert.equal(await balance(),afterFailure,'a hunt that found nothing is not charged');
      const loose:HuntMessage[]=[];
      await executeHunt({id:'user-a',name:'Ada'},true,new AbortController().signal,event=>loose.push(event),form({work_mode:'hybrid',filters:{skills:['Python','SQL'],skillMode:'all'}}));
      const looseDone=loose.find(event=>event.type==='complete');assert.ok(looseDone && looseDone.type==='complete');
      const looseListings=await getSearchListings(looseDone.searchId,'user-a');
      assert.equal(looseListings.length,2);
      assert.ok(looseListings[0].match_reasons.includes('hybrid') && looseListings[0].match_reasons.some(reason=>reason.startsWith('Skill:')));
      assert.deepEqual(looseListings[0].facts.skills_found,['Python','SQL']);
      assert.equal(await balance(),afterFailure-1);
      await addCredits('user-a',1);
      // Stale 'running' hunts are closed once and refunded once; a fresh running hunt blocks a second one.
      const stuck=await createSearch({userId:'user-b',preferenceSnapshot:{charged:true,hash:'stuck'}});
      assert.equal(await hasRunningSearch('user-b'),true);
      assert.equal(await reconcileStaleSearches('user-b'),0,'not stale yet');
      await db.query(`UPDATE searches SET created_at=now()-interval '10 minutes' WHERE id=$1`,[stuck.id]);
      assert.equal(await reconcileStaleSearches('user-b'),1);
      assert.equal(await reconcileStaleSearches('user-b'),0,'refund happens once');
      assert.equal(await balance('user-b'),11);
      assert.equal((await getSearch(stuck.id))?.status,'error');
      assert.equal(await hasRunningSearch('user-b'),false);
      // Zero-listing searches are not cache hits.
      const empty=await createSearch({userId:'user-b',preferenceSnapshot:{hash:'empty-hash'}});
      await finishSearch(empty.id,'done',null,{search:1,fetch:0,agent:0});
      assert.equal(await findCachedSearch('user-b','empty-hash'),null);
    }finally{
      fetchMock.mock.restore();
      if(previousKey===undefined) delete process.env.TINYFISH_API_KEY;else process.env.TINYFISH_API_KEY=previousKey;
      if(previousAgent===undefined) delete process.env.MAX_AGENT_RUNS;else process.env.MAX_AGENT_RUNS=previousAgent;
    }
  } finally {
    neonConfig.fetchFunction=original;
    if(oldUrl===undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=oldUrl;
    await db.close();
  }
});
