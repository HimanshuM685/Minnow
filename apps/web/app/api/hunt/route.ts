import { after } from 'next/server';
import { getSearch, getSearchListings } from '@minnow/db';
import { getUser } from '@/lib/auth/session';
import { executeHunt } from '@/lib/hunt';

export const runtime='nodejs';
export const maxDuration=300;
const HARD_LIMIT_MS=280_000;

// Progress check used by the client when its stream drops; the hunt itself keeps running server-side.
export async function GET(request:Request){
  const user=await getUser();
  if(!user) return Response.json({error:'Your session expired. Sign in again.'},{status:401});
  const id=new URL(request.url).searchParams.get('id')??'';
  if(!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({error:'Invalid search id.'},{status:400});
  const run=await getSearch(id,user.id);
  if(!run) return Response.json({error:'Search not found.'},{status:404});
  const found=run.status==='done'?(await getSearchListings(id,user.id)).length:0;
  return Response.json({status:run.status,error:run.error,found,counts:{search:run.search_count,fetch:run.fetch_count,agent:run.agent_count}},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:Request){
  const user=await getUser();
  if(!user) return Response.json({error:'Your session expired. Sign in again.'},{status:401});
  const body=await request.json().catch(()=>({})) as {refresh?:boolean;form?:unknown};
  const encoder=new TextEncoder();
  // Deliberately not tied to request.signal: a dropped connection must not abandon a charged hunt.
  const signal=AbortSignal.timeout(HARD_LIMIT_MS);
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
