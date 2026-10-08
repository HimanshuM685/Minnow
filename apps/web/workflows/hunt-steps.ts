import { ownHunt, discoverHunt, launchHuntAgent, pollHuntAgents, finishHuntJob } from '@/lib/hunt-job';

export async function claimStep(id:string,owner:string) { 'use step'; return ownHunt(id,owner); }
export async function discoveryStep(id:string,owner:string) { 'use step'; return discoverHunt(id,owner); }
export async function launchStep(id:string,owner:string,url:string) { 'use step'; await launchHuntAgent(id,owner,url); }
// A paid launch is protected by a database reservation as well as disabled automatic error retries.
launchStep.maxRetries=0;
export async function pollStep(id:string,owner:string) { 'use step'; return pollHuntAgents(id,owner); }
export async function finishStep(id:string,owner:string) { 'use step'; await finishHuntJob(id,owner); }
