import { after } from 'next/server';
import { getSearch, getSearchListings, lastSearchProgress } from '@minnow/db';
import { getUser } from '@/lib/auth/session';
import { HuntBusyError, HuntCreditError, HuntInputError, executeHunt, prepareHunt, runHunt } from '@/lib/hunt';

export const runtime='nodejs';
export const maxDuration=300;
const HARD_LIMIT_MS=280_000;

// Progress check used by the client when its stream drops and by background (Deep Search) runs.
export async function GET(request:Request){
  const user=await getUser();
  if(!user) return Response.json({error:'Your session expired. Sign in again.'},{status:401});
  const id=new URL(request.url).searchParams.get('id')??'';
  if(!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({error:'Invalid search id.'},{status:400});
  const run=await getSearch(id,user.id);
  if(!run) return Response.json({error:'Search not found.'},{status:404});
  const [found,progress]=await Promise.all([run.status==='done'?getSearchListings(id,user.id).then(rows=>rows.length):0,run.status==='running'?lastSearchProgress(id):'']);
  return Response.json({status:run.status,error:run.error,found,progress,deep:run.preference_snapshot.deep===true,counts:{search:run.search_count,fetch:run.fetch_count,agent:run.agent_count}},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
  const user=await getUser();
  if(!user) return Response.json({error:'Your session expired. Sign in again.'},{status:401});
  const body=await request.json().catch(()=>({})) as {refresh?:boolean;form?:unknown;deep?:boolean};
  // Deliberately not tied to request.signal: a dropped connection must not abandon a charged hunt.
  const signal=AbortSignal.timeout(HARD_LIMIT_MS);

  if(body.deep===true){
    // Deep Search: validate, charge and create the search now, answer immediately, then keep working after the
    // response so the user can leave the page.
    try{
      const prepared=await prepareHunt(user,true,body.form,true);
      after(()=>runHunt(prepared,signal,()=>{}).catch(()=>{}));
      return Response.json({searchId:prepared.run.id,background:true});
    }catch(error){
      const status=error instanceof HuntCreditError?402:error instanceof HuntBusyError?409:error instanceof HuntInputError?400:500;
      return Response.json({error:error instanceof Error?error.message:'Could not start Deep Search.'},{status});
    }
  }

  const encoder=new TextEncoder();
  let connected=true;
  let controller:ReadableStreamDefaultController<Uint8Array>|undefined;
  const write=(chunk:string)=>{if(connected&&controller){try{controller.enqueue(encoder.encode(chunk));}catch{connected=false;}}};
  const send=(value:unknown)=>write(`data: ${JSON.stringify(value)}\n\n`);
  const work=(async()=>{
    const heartbeat=setInterval(()=>write(': heartbeat\n\n'),10_000);
    try{await executeHunt(user,body.refresh===true,signal,send,body.form);}
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
