import { hardFilterLabels } from '@minnow/core';
import { getSearch, getSearchListings, latestSearchProgress, huntProgressCounts, searchByRequest } from '@minnow/db';
import { getUser } from '@/lib/auth/session';
import { HuntBusyError, HuntCreditError, HuntInputError, prepareHunt } from '@/lib/hunt';
import { dispatchHunt, ensureHuntDispatched } from '@/lib/hunt-dispatch';

export const maxDuration=60;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Progress check for durable hunts and to find out whether a click that
// lost its response was actually received (`?request=<id>`), so the client never has to guess or charge twice.
export async function GET(request:Request){
  const user=await getUser();
  if(!user) return Response.json({error:'Your session expired. Sign in again.'},{status:401});
  const query=new URL(request.url).searchParams;
  const requestId=query.get('request')??'';
  const id=query.get('id')??'';
  if(!UUID.test(id) && !UUID.test(requestId)) return Response.json({error:'Invalid search id.'},{status:400});
  const run=UUID.test(requestId) ? await searchByRequest(user.id,requestId) : await getSearch(id,user.id);
  if(!run) return Response.json({error:'Search not found.'},{status:404});
  if(run.status==='running') await ensureHuntDispatched(run.id);
  const [found,progress,liveCounts]=await Promise.all([run.status==='done'?getSearchListings(run.id,user.id).then(rows=>rows.length):0,latestSearchProgress(run.id),run.status==='running'?huntProgressCounts(run.id):undefined]);
  const snapshot=run.preference_snapshot;
  const drops=snapshot.hard_filter_drops as Record<string,number>|undefined;
  return Response.json({searchId:run.id,status:run.status,error:run.error,found,progress:progress?.detail??'',stage:progress?.step??'search',deep:snapshot.deep===true,
    strict:snapshot.strict,near:snapshot.near,relaxed:snapshot.relaxed,dropped:Object.entries(drops??{}).map(([key,count])=>({filter:hardFilterLabels[key]??key,count})),
    counts:liveCounts??{search:run.search_count,fetch:run.fetch_count,agent:run.agent_count}},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
  const user=await getUser();
  if(!user) return Response.json({error:'Your session expired. Sign in again.'},{status:401});
  const body=await request.json().catch(()=>({})) as {refresh?:boolean;form?:unknown;deep?:boolean;requestId?:string};
  const requestId=typeof body.requestId==='string' && UUID.test(body.requestId) ? body.requestId : undefined;
  const deep=body.deep===true;

  // The button decides the price: `deep` selects Deep Search pricing, otherwise normal Search pricing. Charging and
  // creating the search is one atomic statement inside prepareHunt.
  let prepared;
  try{ prepared=await prepareHunt(user,deep || body.refresh===true,body.form,deep,requestId); }
  catch(error){
    const status=error instanceof HuntCreditError?402:error instanceof HuntBusyError?409:error instanceof HuntInputError?400:500;
    return Response.json({error:error instanceof Error?error.message:'Could not start the search.'},{status});
  }
  // A retried click: the first click already created (and charged) this search. Return it, charge nothing.
  const searchId='duplicateOf' in prepared?prepared.duplicateOf:prepared.run.id;
  await dispatchHunt(searchId);
  return Response.json({searchId,background:true,deep,duplicate:'duplicateOf' in prepared},{status:202,headers:{'Cache-Control':'no-store'}});
}
