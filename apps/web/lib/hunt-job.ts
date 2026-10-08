import { createHash } from 'node:crypto';
import { extractAgent, rankWithFallback, type SearchEvent } from '@minnow/core';
import { addSearchEvents, claimHuntJob, copyCachedListings, getHuntJob, getSearch, getWallet, listHuntAgents, patchSearchSnapshot, reserveHuntAgent, saveHuntCheckpoint, settleSearch, updateHuntAgent, updateSourceHealth, type HuntJobRow } from '@minnow/db';
import { DEEP_BUDGET_MS, HUNT_BUDGET_MS, persistHuntResult, type PreparedHunt } from './hunt';
import { emptyStats, runSearch, type DiscoveryResult } from './pipeline';
import { toPreferences } from './hunt-input';
import { TinyFishClient, TinyFishError } from './tinyfish';

type Payload = Omit<PreparedHunt,'run'|'ownKey'> & {useOwnKey:boolean;maxAgentRuns:number};
async function ownedJob(id:string, owner:string) {
  const job=await getHuntJob(id);
  if(!job || job.workflow_id!==owner) throw new Error('Hunt ownership changed.');
  return job;
}
async function keyFor(job:HuntJobRow) {
  const payload=job.payload as unknown as Payload;
  const key=payload.useOwnKey ? (await getWallet(payload.user.id))?.tinyfish_key : process.env.TINYFISH_API_KEY;
  if(!key?.trim()) throw new Error('Search is not configured: the TinyFish key is unavailable.');
  return key.trim();
}
const clientFor=async(job:HuntJobRow)=>new TinyFishClient(await keyFor(job),emptyStats(),new AbortController().signal);
export async function ownHunt(id:string, owner:string) {
  const job=await claimHuntJob(id,owner);
  return Boolean(job);
}
export async function discoverHunt(id:string, owner:string):Promise<string[]> {
  const job=await ownedJob(id,owner);
  const payload=job.payload as unknown as Payload;
  if(job.checkpoint) return (job.checkpoint as unknown as DiscoveryResult).agentTargets;
  if(payload.cached) {
    await copyCachedListings(payload.cached.id,id,payload.user.id);
    await settleSearch(id,'done',null,{search:0,fetch:0,agent:0},false);
    return [];
  }
  // The key is read server-side per invocation. Nothing secret crosses a workflow boundary.
  let key:string;
  try { key=await keyFor(job); }
  catch(error) {
    await settleSearch(id,'error',error instanceof Error?error.message:'TinyFish key unavailable.',{search:0,fetch:0,agent:0},true);
    return [];
  }
  type Event={step:'search'|'fetch'|'agent'|'parse'|'rank';host:string|null;url:string|null;ok:boolean;detail:string};
  const buffer:Event[]=[];
  const health:[string,boolean,string|null][]=[];
  const flush=async()=>{
    const events=buffer.splice(0), checks=health.splice(0);
    await Promise.all([addSearchEvents(id,events),...checks.map(([host,ok,error])=>updateSourceHealth(host,ok,error))]);
  };
  let writes=Promise.resolve();
  let writeError:unknown;
  const emit=(event:SearchEvent)=>{
    if(event.type==='source') {
      const report=event.report;
      const host=new URL(report.url).hostname;
      buffer.push({step:report.stage,host,url:report.url,ok:report.status!=='error',detail:report.message});
      if(report.stage!=='search' && report.status!=='skipped') health.push([host,report.status!=='error',report.status==='error'?report.message:null]);
    } else if(event.type==='progress') {
      buffer.push({step:event.stage==='complete'?'rank':event.stage,host:null,url:null,ok:true,detail:event.message});
      writes=writes.then(flush).catch(error=>{writeError=error;});
    }
  };
  let result:DiscoveryResult;
  const stats=emptyStats();
  try {
    result=await runSearch(toPreferences(payload.input,payload.skills),id,key,new AbortController().signal,emit,{
      deferAgents:true,maxAgentRuns:payload.maxAgentRuns,agentDuration:0,
      deep:payload.deep,budgetMs:payload.deep?DEEP_BUDGET_MS:HUNT_BUDGET_MS,skippedHosts:payload.excludedHosts,stats,
    });
  } catch(error) {
    if(error instanceof TinyFishError) {
      await settleSearch(id,'error',error.message,{search:stats.searchRequests,fetch:stats.fetchRequests,agent:0},true);
      return [];
    }
    throw error;
  } finally { await writes; await flush(); if(writeError) throw writeError; }
  await saveHuntCheckpoint(id,owner,result);
  // Persist discovery results before starting Agents so crash recovery never discards readable sources.
  return result.agentTargets;
}

// Called only after the Workflow service reports a terminal owner. A finite retry
// policy prevents a permanently broken discovery step from holding a charge forever;
// active Agent rows remain recoverable and are never refunded or relaunched here.
export async function recoverTerminalHunt(id:string, owner:string):Promise<'retry'|'settled'> {
  const job=await getHuntJob(id);
  if(!job || (job.workflow_id??job.dispatch_id)!==owner || (await getSearch(id))?.status!=='running') return 'settled';
  if(job.attempts<3) return 'retry';
  const agents=await listHuntAgents(id);
  if(job.checkpoint) {
    // A workflow can fail after discovery or polling but before its final step.
    // The checkpoint and terminal Agent rows are enough to finish safely.
    if(agents.some(agent=>['launching','pending','unknown'].includes(agent.status))) return 'retry';
    await finishHuntJob(id,owner);
    return 'settled';
  }
  if(agents.some(agent=>['launching','pending','unknown'].includes(agent.status))) return 'retry';
  const detail='The hunt could not finish after repeated workflow failures. Your credits were refunded.';
  await addSearchEvents(id,[{step:'rank',host:null,url:null,ok:false,detail}]);
  await settleSearch(id,'error',detail,{search:0,fetch:0,agent:agents.length},true);
  return 'settled';
}

export async function launchHuntAgent(id:string, owner:string, url:string) {
  const job=await ownedJob(id,owner);
  const marker=`minnow:${id}:${createHash('sha256').update(url).digest('hex').slice(0,16)}`;
  const reserved=await reserveHuntAgent(id,url,marker);
  if(!reserved) return; // same step delivered twice or a workflow recovered: never launch again
  const client=await clientFor(job);
  const payload=job.payload as unknown as Payload;
  await addSearchEvents(id,[{step:'agent',host:null,url:null,ok:true,detail:`Agent queued for ${new URL(url).hostname}. This hunt continues if you close Minnow.`}]);
  try {
    const runId=await client.startAgent(url,toPreferences(payload.input,payload.skills),marker);
    await updateHuntAgent(id,url,'pending',runId);
  } catch(error) {
    const definitive=error instanceof TinyFishError && [400,401,402,403,429].includes(error.status);
    await updateHuntAgent(id,url,definitive?'failed':'unknown',null,null,error instanceof Error?error.message:'Agent launch acknowledgement was lost.');
  }
}
export async function pollHuntAgents(id:string, owner:string):Promise<boolean> {
  const job=await ownedJob(id,owner);
  const agents=await listHuntAgents(id);
  if(!agents.some(agent=>['launching','pending','unknown'].includes(agent.status))) return true;
  const client=await clientFor(job);
  await Promise.all(agents.filter(agent=>['launching','pending','unknown'].includes(agent.status)).map(async agent=>{
    let runId=agent.run_id;
    if(!runId) {
      // Resolve an ambiguous POST by its persisted unique goal marker, never by submitting another paid run.
      runId=await client.findAgent(agent.marker);
      if(!runId) {
        if(Date.now()-new Date(agent.created_at).getTime()>15*60_000) await updateHuntAgent(id,agent.url,'failed',null,null,'Agent launch could not be confirmed. It was not resubmitted to avoid a duplicate run.');
        return;
      }
      await updateHuntAgent(id,agent.url,'pending',runId);
    }
    const run=await client.agentRun(runId);
    if(run.status==='COMPLETED') await updateHuntAgent(id,agent.url,'completed',runId,run.result??null);
    else if(run.status==='FAILED' || run.status==='CANCELLED') await updateHuntAgent(id,agent.url,run.status==='FAILED'?'failed':'cancelled',runId,null,run.error?.message??`TinyFish reported ${run.status.toLowerCase()}.`);
    else {
      const detail=run.steps?.at(-1)?.action;
      if(detail) await addSearchEvents(id,[{step:'agent',host:null,url:null,ok:true,detail:`${new URL(agent.url).hostname}: ${detail.slice(0,240)}`}]);
    }
  }));
  return !(await listHuntAgents(id)).some(agent=>['launching','pending','unknown'].includes(agent.status));
}
export async function finishHuntJob(id:string, owner:string) {
  const job=await ownedJob(id,owner);
  const run=await getSearch(id);
  if(run?.status!=='running') return;
  const payload=job.payload as unknown as Payload;
  if(payload.cached) return;
  const discovery=job.checkpoint as unknown as DiscoveryResult;
  if(!discovery) throw new Error('Hunt discovery checkpoint is missing.');
  const agents=await listHuntAgents(id);
  if(agents.some(agent=>['launching','pending','unknown'].includes(agent.status))) throw new Error('Agents are still running.');
  const raw=[...discovery.unranked];
  const events:Parameters<typeof addSearchEvents>[1]=[];
  for(const agent of agents) {
    const jobs=agent.status==='completed'?extractAgent(agent.result,agent.url,discovery.preferences.filters.skills):[];
    raw.push(...jobs);
    const detail=agent.status==='completed'?`${jobs.length} openings extracted by Agent`:agent.error??`Agent ${agent.status}.`;
    events.push({step:'agent',host:new URL(agent.url).hostname,url:agent.url,ok:agent.status==='completed',detail});
    await updateSourceHealth(new URL(agent.url).hostname,agent.status==='completed',agent.status==='completed'?null:detail);
  }
  const matched=rankWithFallback(raw,discovery.preferences);
  const stats={...discovery.stats,agentRuns:agents.length,extracted:raw.length,duplicatesRemoved:matched.duplicatesRemoved,filteredOut:matched.filteredOut};
  const result={...discovery,...matched,listings:matched.listings.slice(0,60),stats};
  events.push({step:'rank',host:null,url:null,ok:true,detail:`${result.listings.length} matched listings (${result.strict} strict, ${result.near} near). All started Agent runs have reached a terminal status.`});
  await addSearchEvents(id,events);
  await persistHuntResult(id,payload.user.id,result);
}
