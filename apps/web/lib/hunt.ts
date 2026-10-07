import { createHash } from 'node:crypto';
import { canonicalUrl, hardFilterLabels, normalizeFilters, type SearchEvent } from '@minnow/core';
import { addSearchEvents, updateSourceHealth, copyCachedListings, startSearch, settleSearch, searchByRequest, SearchConflictError, ensureProfile, findCachedSearch, getPreferences, getResume, getWallet, hasRunningSearch, insertListings, patchSearchSnapshot, reconcileStaleSearches, spendCredits, addCredits, DEEP_SEARCH_COST, SEARCH_COST, skippedHosts } from '@minnow/db';
import { emptyStats, runSearch } from './pipeline';
import { resumeSkills } from './resume';
import { huntInputSchema, toPreferences, toRow, type HuntInput } from './hunt-input';

export class HuntInputError extends Error {}
export class HuntCreditError extends HuntInputError {}
export class HuntBusyError extends HuntInputError {}
// Soft deadline for discovery. Must leave room inside the route's maxDuration for ranking and persistence.
export const HUNT_BUDGET_MS=150_000;
export const DEEP_BUDGET_MS=240_000;
export type HuntMessage = { type: 'started'; searchId: string } | { type: 'progress'; stage: string; message: string } | { type: 'complete'; found?: number; strict?: number; near?: number; relaxed?: string[]; dropped?: { filter: string; count: number }[]; searchId: string; counts: {search:number;fetch:number;agent:number}; cacheHit: boolean };
const limit = (value: string|undefined, fallback: number,min: number,max:number) => {
  const parsed=Number(value);return value && Number.isFinite(parsed) ? Math.floor(Math.min(max,Math.max(min,parsed))) : fallback;
};

// Web-only server orchestration. Durable writes are awaited before completion is emitted.
// prepareHunt validates, charges and creates the search row; runHunt does the (possibly long) work.
export type PreparedHunt={user:{id:string;name:string};input:HuntInput;skills:string[];run:{id:string};cached:{id:string}|null;cost:number;ownKey:string|null;excludedHosts:string[];deep:boolean};
export async function executeHunt(user: { id:string;name:string }, refresh:boolean, signal:AbortSignal, send:(event:HuntMessage)=>void, form?:unknown) {
  const prepared=await prepareHunt(user,refresh,form,false);
  if('duplicateOf' in prepared) return;
  await runHunt(prepared,signal,send);
}
export async function prepareHunt(user: { id:string;name:string }, refresh:boolean, form:unknown, deep:boolean, requestId?:string):Promise<PreparedHunt|{duplicateOf:string}> {
  await ensureProfile(user.id,user.name);
  // A retried click must resolve to its first search before any "already running" check can reject it.
  if(requestId){const first=await searchByRequest(user.id,requestId); if(first) return {duplicateOf:first.id};}
  // Independent reads run together: one round trip of latency instead of six.
  const [,running,saved,resume,excludedHosts,wallet]=await Promise.all([reconcileStaleSearches(user.id),hasRunningSearch(user.id),getPreferences(user.id),getResume(user.id),skippedHosts(),getWallet(user.id)]);
  if(running) throw new HuntBusyError('A hunt is already running for your account. Wait for it to finish, then try again.');
  // The form wins even when unsaved; the saved row is the fallback (e.g. a plain refresh).
  const candidate=form ?? (saved ? {...saved,filters:normalizeFilters(saved.filters)} : null);
  if(!candidate) throw new HuntInputError('Enter a role before running a hunt.');
  const parsed=huntInputSchema.safeParse(candidate);
  if(!parsed.success) throw new HuntInputError(parsed.error.issues[0]?.message ?? 'Save a role before running a hunt.');
  const input:HuntInput=parsed.data;
  const skills=resume?resumeSkills(resume.extracted_text):[];
  const prefs=toRow(input);
  const hash=createHash('sha256').update(JSON.stringify({...prefs,resume:resume?.uploaded_at??null,excludedHosts:excludedHosts.sort()})).digest('hex');
  const snapshot={...prefs,hash,resume_skills:skills};
  // Deep Search always does fresh work, so it is never replayed from cache.
  const cached=refresh||deep ? null : await findCachedSearch(user.id,hash);
  // A saved personal TinyFish key runs unmetered; otherwise a live (non-cached) hunt costs one credit.
  const ownKey=wallet?.tinyfish_key?.trim()||null;
  const cost=cached||ownKey ? 0 : deep ? DEEP_SEARCH_COST : SEARCH_COST;
  // Charge and create the search in one atomic statement. Which button was clicked decides the price: Deep Search
  // costs DEEP_SEARCH_COST, a normal search 1, a cache replay or your own key 0. A retried click (same requestId)
  // returns the first click's search instead of charging again.
  let started;
  try{ started=await startSearch({userId:user.id,snapshot:{...snapshot,deep},cacheHit:Boolean(cached),cost,reason:deep?'deep_search':'search',requestId}); }
  catch(error){ if(error instanceof SearchConflictError) throw new HuntBusyError('A hunt is already running for your account. Wait for it to finish, then try again.'); throw error; }
  if(!started) throw new HuntCreditError((deep?`Deep Search costs ${DEEP_SEARCH_COST} credits and you have fewer. `:'You are out of credits. ')+'Message @HimanshuM685 on Telegram for more, or add your own TinyFish API key on the Credits page.');
  if(started.existing) return {duplicateOf:started.search.id};
  const run=started.search;
  return {user,input,skills,run,cached,cost,ownKey,excludedHosts,deep};
}

export async function runHunt(prepared:PreparedHunt, signal:AbortSignal, send:(event:HuntMessage)=>void) {
  const {user,input,skills,run,cached,cost,ownKey,excludedHosts,deep}=prepared;
  // Refund at most once, whichever path ends a charged hunt without usable results.
  // Finishing and refunding are one statement and only the running -> finished transition can pay out, so a credit
  // is returned at most once however the hunt ends.
  const settle=(status:'done'|'error',error:string|null,counts:{search:number;fetch:number;agent:number},refund:boolean)=>settleSearch(run.id,status,error,counts,refund&&cost>0);
  const stats=emptyStats();
  const controller=new AbortController();
  const workSignal=AbortSignal.any([signal,controller.signal]);
  // Trace rows are buffered and written in one batch at stage boundaries; progress goes to the client immediately.
  type Step='search'|'fetch'|'agent'|'parse'|'rank';
  const buffer:{step:Step;host:string|null;url:string|null;ok:boolean;detail:string}[]=[];
  const health:[string,boolean,string|null][]=[];
  const trace=(step:Step,host:string|null,url:string|null,ok:boolean,detail:string)=>{buffer.push({step,host,url,ok,detail});};
  const flush=()=>{const events=buffer.splice(0);const checks=health.splice(0);return Promise.all([addSearchEvents(run.id,events),...checks.map(([host,ok,error])=>updateSourceHealth(host,ok,error))]);};
  let writes:Promise<unknown>=Promise.resolve();
  let writeError:unknown;
  const emit=(event:SearchEvent)=>{
    if(event.type==='source'){
      const report=event.report;const host=new URL(report.url).hostname;
      trace(report.stage,host,report.url,report.status!=='error',report.message);
      if(report.stage!=='search' && report.status!=='skipped') health.push([host,report.status!=='error',report.status==='error'?report.message:null]);
    }else if(event.type==='progress'){
      trace(event.stage==='complete'?'rank':event.stage,null,null,true,event.message);
      send(event);
      writes=writes.then(flush).catch(error=>{writeError=error;controller.abort(new Error('Could not persist the hunt trace.'));});
    }
  };
  try{
    send({type:'started',searchId:run.id});
    if(cached){
      trace('parse',null,null,true,`Cache replay from ${cached.id}; original fetched_at preserved. No TinyFish requests made.`);
      await Promise.all([copyCachedListings(cached.id,run.id,user.id),flush()]);
      const counts={search:0,fetch:0,agent:0};
      await settle('done',null,counts,false);
      send({type:'complete',searchId:run.id,counts,cacheHit:true});
      return;
    }
    trace('search',null,null,true,deep?'Deep Search started: wider discovery, job-detail enrichment and up to 5 agents.':'Hunt started with saved preferences and extracted resume skill hints.');
    const apiKey=ownKey??process.env.TINYFISH_API_KEY?.trim();
    if(!apiKey) throw new Error('Search is not configured: add your own TinyFish key on the Credits page.');
    const preferences=toPreferences(input,skills);
    const result=await runSearch(preferences,run.id,apiKey,workSignal,emit,{maxAgentRuns:deep?5:limit(process.env.MAX_AGENT_RUNS,2,0,2),agentDuration:deep?90:limit(process.env.AGENT_DURATION_SECONDS,60,30,120),budgetMs:deep?DEEP_BUDGET_MS:HUNT_BUDGET_MS,deep,skippedHosts:excludedHosts,stats});
    await writes;
    if(writeError) throw writeError;
    workSignal.throwIfAborted();
    trace('parse',null,null,true,`${stats.extracted} records extracted; ${stats.duplicatesRemoved} duplicate records merged.`);
    const dropped=Object.entries(result.drops).sort((a,b)=>b[1]-a[1]).map(([key,count])=>({filter:hardFilterLabels[key]??key,count}));
    const droppedTotal=dropped.reduce((sum,item)=>sum+item.count,0);
    trace('rank',null,null,true,`${result.listings.length} matched listings (${result.strict} strict, ${result.near} near); hard filters dropped ${droppedTotal}${dropped.length?` (${dropped.map(item=>`${item.filter} ${item.count}`).join(', ')})`:''}; resume tokens included in ranking.`);
    // Independent writes in parallel; the search is marked done only after all of them land.
    await Promise.all([flush(),patchSearchSnapshot(run.id,{hard_filter_drops:result.drops,hard_filter_drop_total:droppedTotal,strict:result.strict,near:result.near,relaxed:result.relaxed}),insertListings(result.listings.map(job=>({userId:user.id,searchId:run.id,dedupeKey:canonicalUrl(job.apply_url),title:job.title,company:job.company,location:job.location,seniority:job.seniority,workMode:job.work_mode,visaSignal:job.visa_signal,snippet:job.snippet,applyUrl:job.apply_url,sourceUrl:job.source_url,sourceName:job.source_name,score:job.match_score,matchReasons:job.match_reasons,uncertainties:job.uncertainties,facts:job.facts,fetchedAt:job.checked_at})))]);
    const counts={search:stats.searchRequests,fetch:stats.fetchRequests,agent:stats.agentRuns};
    // A hunt that found nothing is not billed, and is not cached (see findCachedSearch).
    await settle('done',null,counts,result.listings.length===0);
    send({type:'complete',searchId:run.id,counts,cacheHit:false,found:result.listings.length,strict:result.strict,near:result.near,relaxed:result.relaxed,dropped});
  }catch(error){
    await writes;
    const message=signal.aborted?'Hunt stopped or reached its time limit. Completed trace events are retained.':error instanceof Error?error.message:'Hunt failed.';
    trace('rank',null,null,false,message);
    await flush().catch(()=>{});
    await settle('error',message,{search:stats.searchRequests,fetch:stats.fetchRequests,agent:stats.agentRuns},true);
    throw new Error(message);
  }
}
