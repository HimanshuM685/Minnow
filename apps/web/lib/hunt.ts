import { createHash } from 'node:crypto';
import { defaultPreferences, canonicalUrl, type SearchEvent } from '@minnow/core';
import { addSearchEvent, copyCachedListings, createSearch, ensureProfile, findCachedSearch, finishSearch, getPreferences, getResume, insertListings, skippedHosts, updateSourceHealth } from '@minnow/db';
import { emptyStats, runSearch } from './pipeline';
import { resumeSkills } from './resume';

export class HuntInputError extends Error {}
export type HuntMessage = { type: 'started'; searchId: string } | { type: 'progress'; stage: string; message: string } | { type: 'complete'; searchId: string; counts: {search:number;fetch:number;agent:number}; cacheHit: boolean };
const limit = (value: string|undefined, fallback: number,min: number,max:number) => {
  const parsed=Number(value);return value && Number.isFinite(parsed) ? Math.floor(Math.min(max,Math.max(min,parsed))) : fallback;
};

// Web-only server orchestration. Durable writes are awaited before completion is emitted.
export async function executeHunt(user: { id:string;name:string }, refresh:boolean, signal:AbortSignal, send:(event:HuntMessage)=>void) {
  await ensureProfile(user.id,user.name);
  const [prefs,resume,excludedHosts]=await Promise.all([getPreferences(user.id),getResume(user.id),skippedHosts()]);
  if(!prefs?.role || prefs.role.trim().length<2) throw new HuntInputError('Save a role before running a hunt.');
  const hash=createHash('sha256').update(JSON.stringify({...prefs,updated_at:undefined,resume:resume?.uploaded_at??null,excludedHosts:excludedHosts.sort()})).digest('hex');
  const snapshot={...prefs,hash,resume_skills:resume?resumeSkills(resume.extracted_text):[]};
  const cached=refresh ? null : await findCachedSearch(user.id,hash);
  const run=await createSearch({userId:user.id,preferenceSnapshot:snapshot,cacheHit:Boolean(cached)});
  const stats=emptyStats();
  const controller=new AbortController();
  const workSignal=AbortSignal.any([signal,controller.signal]);
  const trace=(step:'search'|'fetch'|'agent'|'parse'|'rank',host:string|null,url:string|null,ok:boolean,detail:string)=>addSearchEvent(run.id,step,host,url,ok,detail);
  let writes=Promise.resolve();
  let writeError:unknown;
  const emit=(event:SearchEvent)=>{
    writes=writes.then(async()=>{
      if(event.type==='source'){
        const report=event.report;const host=new URL(report.url).hostname;
        await trace(report.stage,host,report.url,report.status!=='error',report.message);
        if(report.stage!=='search' && report.status!=='skipped') await updateSourceHealth(host,report.status!=='error',report.status==='error'?report.message:null);
      }else if(event.type==='progress'){
        await trace(event.stage==='complete'?'rank':event.stage,null,null,true,event.message);
        send(event);
      }
    }).catch(error=>{writeError=error;controller.abort(new Error('Could not persist the hunt trace.'));});
  };
  try{
    send({type:'started',searchId:run.id});
    if(cached){
      await trace('parse',null,null,true,`Cache replay from ${cached.id}; original fetched_at preserved. No TinyFish requests made.`);
      await copyCachedListings(cached.id,run.id,user.id);
      const counts={search:0,fetch:0,agent:0};
      await finishSearch(run.id,'done',null,counts);
      send({type:'complete',searchId:run.id,counts,cacheHit:true});
      return;
    }
    await trace('search',null,null,true,'Hunt started with saved preferences and extracted resume skill hints.');
    if(!process.env.TINYFISH_API_KEY?.trim()) throw new Error('Set TINYFISH_API_KEY in apps/web/.env.local.');
    const preferences={...defaultPreferences,role:prefs.role,profession:prefs.profession,location:prefs.location_label,country:prefs.location_country_code,seniority:prefs.seniority,workMode:prefs.work_mode,visa:prefs.visa==='needs_sponsorship'?'needs_sponsorship' as const:'any' as const,keywords:prefs.keywords.join(', '),resumeKeywords:snapshot.resume_skills};
    const result=await runSearch(preferences,run.id,process.env.TINYFISH_API_KEY,workSignal,emit,{maxAgentRuns:limit(process.env.MAX_AGENT_RUNS,2,0,2),agentDuration:limit(process.env.AGENT_DURATION_SECONDS,120,30,120),skippedHosts:excludedHosts,stats});
    await writes;
    if(writeError) throw writeError;
    workSignal.throwIfAborted();
    await trace('parse',null,null,true,`${stats.extracted} records extracted; ${stats.duplicatesRemoved} duplicate records merged.`);
    await trace('rank',null,null,true,`${result.listings.length} matched listings; ${stats.filteredOut} known mismatches removed; resume tokens included in ranking.`);
    await insertListings(result.listings.map(job=>({userId:user.id,searchId:run.id,dedupeKey:canonicalUrl(job.apply_url),title:job.title,company:job.company,location:job.location,seniority:job.seniority,workMode:job.work_mode,visaSignal:job.visa_signal,snippet:job.snippet,applyUrl:job.apply_url,sourceUrl:job.source_url,sourceName:job.source_name,score:job.match_score,matchReasons:[...job.match_reasons,...job.uncertainties],fetchedAt:job.checked_at})));
    const counts={search:stats.searchRequests,fetch:stats.fetchRequests,agent:stats.agentRuns};
    await finishSearch(run.id,'done',null,counts);
    send({type:'complete',searchId:run.id,counts,cacheHit:false});
  }catch(error){
    await writes;
    const message=signal.aborted?'Hunt stopped or reached its time limit. Completed trace events are retained.':error instanceof Error?error.message:'Hunt failed.';
    await trace('rank',null,null,false,message);
    await finishSearch(run.id,'error',message,{search:stats.searchRequests,fetch:stats.fetchRequests,agent:stats.agentRuns});
    throw new Error(message);
  }
}
