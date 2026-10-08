import { start, getRun } from 'workflow/api';
import { activeHuntJobs, claimHuntDispatch, ensureSchema, getHuntJob, recordHuntDispatch, releaseFailedHunt, retryHuntDispatch, touchHuntJob } from '@minnow/db';
import { huntWorkflow } from '@/workflows/hunt';
import { recoverTerminalHunt } from './hunt-job';

export async function dispatchHunt(id:string) {
  const token=crypto.randomUUID();
  if(!await claimHuntDispatch(id,token)) return;
  try {
    const run=await start(huntWorkflow,[id]);
    await recordHuntDispatch(id,token,run.runId);
  } catch(error) {
    await retryHuntDispatch(id,token);
    // The outbox remains durable even when the acknowledgement was lost. Another dispatch is safe:
    // only one workflow can own the hunt, and paid Agent launches each have a permanent reservation.
    console.error('Hunt dispatch will be retried', {searchId:id,message:error instanceof Error?error.message:'Dispatch failed'});
  }
}
export async function recoverHunts() {
  await ensureSchema();
  const jobs=await activeHuntJobs();
  await Promise.all(jobs.map(async job=>{
    await touchHuntJob(job.search_id);
    const workflowId=job.workflow_id??job.dispatch_id;
    if(workflowId) {
      let terminal:boolean;
      try {
        const run=getRun(workflowId);
        terminal=!await run.exists || ['failed','cancelled','completed'].includes(await run.status);
      } catch { return; } // temporary workflow-service outage must never terminate or refund a healthy hunt
      if(!terminal) return;
      if(await recoverTerminalHunt(job.search_id,workflowId)==='settled') return;
      await releaseFailedHunt(job.search_id,workflowId);
    }
    await dispatchHunt(job.search_id);
  }));
  return jobs.length;
}
export async function ensureHuntDispatched(id:string) {
  const job=await getHuntJob(id);
  if(job && !job.workflow_id && !job.dispatch_id) await dispatchHunt(id);
}
