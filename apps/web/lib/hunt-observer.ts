export interface HuntStatus {
  searchId:string;status:'running'|'done'|'error';error?:string;found:number;progress?:string;stage?:string;deep?:boolean;
  counts:{search:number;fetch:number;agent:number};strict?:number;near?:number;relaxed?:string[];dropped?:{filter:string;count:number}[];
}
export function observationDelay(ms:number,signal:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    signal.throwIfAborted();
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
    signal.addEventListener('abort',abort,{once:true});
  });
}
// Cancellation belongs only to this observer. There is no execution/cancellation endpoint here.
export async function followHunt(id:string,signal:AbortSignal,onStatus:(status:HuntStatus)=>void,interval=3000) {
  for(;;) {
    signal.throwIfAborted();
    let response:Response|undefined;
    try { response=await fetch(`/api/hunt?id=${encodeURIComponent(id)}`,{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(20_000)])}); }
    catch { signal.throwIfAborted(); }
    if(response?.status===401) throw new Error('Your session expired. Sign in again; your hunt continues on the server.');
    if(response?.status===404 || response?.status===403) throw new Error('This hunt is not available for your account.');
    if(response?.ok) {
      let status:HuntStatus|undefined;
      try { status=await response.json() as HuntStatus; } catch { signal.throwIfAborted(); }
      signal.throwIfAborted();
      if(status && ['running','done','error'].includes(status.status)) {
        onStatus(status);
        if(status.status!=='running') return;
      }
    }
    await observationDelay(interval,signal);
  }
}
