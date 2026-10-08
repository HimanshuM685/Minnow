import { getSql } from './client';

export interface HuntJobRow {
  search_id: string; payload: Record<string, unknown>; checkpoint: Record<string, unknown> | null;
  workflow_id: string | null; dispatch_id: string | null; dispatch_token: string | null;
  attempts: number; updated_at: string;
}
export interface HuntAgentRow {
  search_id: string; url: string; marker: string; run_id: string | null;
  status: 'launching' | 'pending' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  result: unknown; error: string | null; created_at: string; updated_at: string;
}
export async function getHuntJob(id: string) { return (await getSql()`SELECT * FROM hunt_jobs WHERE search_id=${id}`)[0] as HuntJobRow | undefined; }
export async function claimHuntJob(id: string, workflowId: string) {
  return (await getSql()`UPDATE hunt_jobs SET workflow_id=${workflowId},attempts=attempts+CASE WHEN workflow_id IS NULL THEN 1 ELSE 0 END,updated_at=now()
    WHERE search_id=${id} AND (workflow_id IS NULL OR workflow_id=${workflowId}) AND EXISTS(SELECT 1 FROM searches WHERE id=${id} AND status='running') RETURNING *`)[0] as HuntJobRow | undefined;
}
export async function saveHuntCheckpoint(id: string, workflowId: string, checkpoint: unknown) {
  const updated = await getSql()`UPDATE hunt_jobs SET checkpoint=${JSON.stringify(checkpoint)}::jsonb,updated_at=now() WHERE search_id=${id} AND workflow_id=${workflowId} RETURNING search_id`;
  if (!updated.length) throw new Error('Hunt ownership changed.');
}
export async function claimHuntDispatch(id: string, token: string) {
  return (await getSql()`UPDATE hunt_jobs SET dispatch_token=${token},dispatch_after=now()+interval '2 minutes'
    WHERE search_id=${id} AND workflow_id IS NULL AND dispatch_id IS NULL AND dispatch_after<=now()
    AND EXISTS(SELECT 1 FROM searches WHERE id=${id} AND status='running') RETURNING search_id`).length > 0;
}
export async function recordHuntDispatch(id: string, token: string, workflowId: string) {
  await getSql()`UPDATE hunt_jobs SET dispatch_id=${workflowId},dispatch_token=NULL,updated_at=now() WHERE search_id=${id} AND dispatch_token=${token}`;
}
export async function retryHuntDispatch(id: string, token: string) {
  await getSql()`UPDATE hunt_jobs SET dispatch_token=NULL,dispatch_after=now()+interval '30 seconds' WHERE search_id=${id} AND dispatch_token=${token}`;
}
export async function activeHuntJobs(limit = 25) {
  return await getSql()`SELECT j.* FROM hunt_jobs j JOIN searches s ON s.id=j.search_id WHERE s.status='running' ORDER BY j.updated_at LIMIT ${limit}` as HuntJobRow[];
}
// Rotate checked jobs to the back of the recovery batch, including healthy long-running hunts.
export async function touchHuntJob(id: string) { await getSql()`UPDATE hunt_jobs SET updated_at=now() WHERE search_id=${id}`; }
export async function huntProgressCounts(id: string) {
  const row = (await getSql()`SELECT COALESCE((checkpoint->'stats'->>'searchRequests')::int,0) AS search,
    COALESCE((checkpoint->'stats'->>'fetchRequests')::int,0) AS fetch,
    (SELECT count(*)::int FROM hunt_agents WHERE search_id=${id}) AS agent FROM hunt_jobs WHERE search_id=${id}`)[0];
  return row as {search:number;fetch:number;agent:number} | undefined;
}
// Called only after the workflow service reports a terminal failed/cancelled owner.
export async function releaseFailedHunt(id: string, workflowId: string) {
  await getSql()`UPDATE hunt_jobs SET workflow_id=NULL,dispatch_id=NULL,dispatch_token=NULL,dispatch_after=now(),updated_at=now()
    WHERE search_id=${id} AND (workflow_id=${workflowId} OR (workflow_id IS NULL AND dispatch_id=${workflowId}))`;
}
export async function listHuntAgents(id: string) { return await getSql()`SELECT * FROM hunt_agents WHERE search_id=${id} ORDER BY url` as HuntAgentRow[]; }
export async function reserveHuntAgent(id: string, url: string, marker: string) {
  // Reservation is never reclaimed to repeat a paid launch after an uncertain response.
  return (await getSql()`INSERT INTO hunt_agents(search_id,url,marker) VALUES(${id},${url},${marker}) ON CONFLICT DO NOTHING RETURNING *`)[0] as HuntAgentRow | undefined;
}
export async function updateHuntAgent(id: string, url: string, status: HuntAgentRow['status'], runId: string | null, result: unknown = null, error: string | null = null) {
  await getSql()`UPDATE hunt_agents SET status=${status},run_id=COALESCE(${runId},run_id),result=${JSON.stringify(result)}::jsonb,error=${error},updated_at=now() WHERE search_id=${id} AND url=${url}`;
}
