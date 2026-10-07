import { after } from 'next/server';
import { getSearch, getSearchListings, lastSearchProgress, searchByRequest } from '@minnow/db';
import { getUser } from '@/lib/auth/session';
import { HuntBusyError, HuntCreditError, HuntInputError, prepareHunt, runHunt } from '@/lib/hunt';

export const runtime='nodejs';
export const maxDuration=300;
const HARD_LIMIT_MS=280_000;
const UUID=/^[0-9a-f-]{36}$/i;

// Progress check used when a stream drops, for background (Deep Search) runs, and to find out whether a click that
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
  const [found,progress]=await Promise.all([run.status==='done'?getSearchListings(run.id,user.id).then(rows=>rows.length):0,run.status==='running'?lastSearchProgress(run.id):'']);
  return Response.json({searchId:run.id,status:run.status,error:run.error,found,progress,deep:run.preference_snapshot.deep===true,counts:{search:run.search_count,fetch:run.fetch_count,agent:run.agent_count}},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
  const user=await getUser();
  if(!user) return Response.json({error:'Your session expired. Sign in again.'},{status:401});
  const body=await request.json().catch(()=>({})) as {refresh?:boolean;form?:unknown;deep?:boolean;requestId?:string};
  const requestId=typeof body.requestId==='string' && UUID.test(body.requestId) ? body.requestId : undefined;
  // Deliberately not tied to request.signal: a dropped connection must not abandon a charged hunt.
  const signal=AbortSignal.timeout(HARD_LIMIT_MS);
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
  if('duplicateOf' in prepared) return Response.json({searchId:prepared.duplicateOf,background:true,duplicate:true});

  if(deep){
    // Answer immediately and keep working after the response so the user can leave the page.
    const job=prepared;
    after(()=>runHunt(job,signal,()=>{}).catch(()=>{}));
    return Response.json({searchId:job.run.id,background:true});
  }

  const encoder=new TextEncoder();
  let connected=true;
  let controller:ReadableStreamDefaultController<Uint8Array>|undefined;
  const write=(chunk:string)=>{if(connected&&controller){try{controller.enqueue(encoder.encode(chunk));}catch{connected=false;}}};
  const send=(value:unknown)=>write(`data: ${JSON.stringify(value)}\n\n`);
  const job=prepared;
  const work=(async()=>{
    const heartbeat=setInterval(()=>write(': heartbeat\n\n'),10_000);
    try{await runHunt(job,signal,send);}
    catch(error){send({type:'error',message:error instanceof Error?error.message:'Could not persist or finish the hunt.'});}
    finally{clearInterval(heartbeat);if(connected){try{controller?.close();}catch{}}}
  })();
  after(()=>work); // keeps the function alive until the hunt is persisted, even if the client left
  const stream=new ReadableStream<Uint8Array>({
    start(c){controller=c;},
    cancel(){connected=false;},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}
