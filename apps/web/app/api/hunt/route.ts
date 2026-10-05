import { auth } from '@/lib/auth/server';
import { executeHunt } from '@/lib/hunt';

export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:Request){
  const {data:session}=await auth.getSession();
  if(!session?.user) return Response.json({error:'Unauthorized'},{status:401});
  const body=await request.json().catch(()=>({})) as {refresh?:boolean};
  const encoder=new TextEncoder();
  const abort=new AbortController();
  const signal=AbortSignal.any([abort.signal,request.signal,AbortSignal.timeout(285_000)]);
  const stream=new ReadableStream<Uint8Array>({
    async start(controller){
      let connected=true;
      const send=(value:unknown)=>{if(connected){try{controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));}catch{connected=false;}}};
      const heartbeat=setInterval(()=>{if(connected){try{controller.enqueue(encoder.encode(': heartbeat\n\n'));}catch{connected=false;}}},15_000);
      try{await executeHunt(session.user,body.refresh===true,signal,send);}
      catch(error){send({type:'error',message:error instanceof Error?error.message:'Could not persist or finish the hunt.'});}
      finally{clearInterval(heartbeat);if(connected){try{controller.close();}catch{}}}
    },
    cancel(){abort.abort(new Error('Client disconnected.'));},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}
