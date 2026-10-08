import { test,mock } from 'node:test';
import assert from 'node:assert/strict';
import { followHunt } from '../lib/hunt-observer';

test('leaving a hunt stops observation only and returning can observe its completed summary',async()=>{
  const calls:string[]=[];
  let complete=false;
  const transport=mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{
    calls.push(String(input));
    return Response.json({searchId:'one',status:complete?'done':'running',found:6,stage:'agent',progress:'Working',counts:{search:2,fetch:1,agent:1},strict:4,near:2,relaxed:['location']});
  });
  try{
    const first=new AbortController();
    await assert.rejects(followHunt('one',first.signal,()=>first.abort(),1));
    complete=true;
    let summary:unknown;
    await followHunt('one',new AbortController().signal,status=>{summary=status;},1);
    assert.equal((summary as {near:number}).near,2);
    assert.deepEqual(calls,['/api/hunt?id=one','/api/hunt?id=one']);
  }finally{transport.mock.restore();}
});
test('temporary progress failures retry without terminating server execution',async()=>{
  let reads=0;
  const transport=mock.method(globalThis,'fetch',async()=>{if(reads++===0)throw new TypeError('offline');return Response.json({status:'done',counts:{search:0,fetch:0,agent:0}});});
  try{await followHunt('one',new AbortController().signal,()=>{},1);assert.equal(reads,2);}finally{transport.mock.restore();}
});
test('an interrupted JSON response is retried and unavailable hunts stop the observer',async()=>{
  let reads=0;
  const transport=mock.method(globalThis,'fetch',async()=>reads++===0?new Response('{broken'):Response.json({status:'done',counts:{search:0,fetch:0,agent:0}}));
  try{await followHunt('one',new AbortController().signal,()=>{},1);assert.equal(reads,2);}finally{transport.mock.restore();}
  const unavailable=mock.method(globalThis,'fetch',async()=>new Response(null,{status:404}));
  try{await assert.rejects(followHunt('one',new AbortController().signal,()=>{},1),/not available/);}finally{unavailable.mock.restore();}
});
