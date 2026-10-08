import { getWorkflowMetadata, sleep } from 'workflow';
import { claimStep, discoveryStep, launchStep, pollStep, finishStep } from './hunt-steps';

export async function huntWorkflow(searchId:string) {
  'use workflow';
  const owner=getWorkflowMetadata().workflowRunId;
  if(!await claimStep(searchId,owner)) return; // duplicated dispatch cannot duplicate paid work
  const targets=await discoveryStep(searchId,owner);
  await Promise.all(targets.map(url=>launchStep(searchId,owner,url)));
  let polls=0;
  while(!await pollStep(searchId,owner)) {
    // A durable timer, not an open socket or a serverless function held alive.
    await sleep(polls++<20?'10s':'30s');
  }
  await finishStep(searchId,owner);
}
