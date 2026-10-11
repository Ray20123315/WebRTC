const {test}=require('node:test'),assert=require('node:assert/strict');
const {DeepfaceService}=require('../deepface-service');
test('missing inference service is started once for concurrent readiness requests',async()=>{
 const s=new DeepfaceService('.');let probes=0,starts=0;
 s.health=async()=>{if(++probes===1)throw TypeError('fetch failed');return {ok:true,state:{ready:true}};};s.spawn=()=>{starts++;s.process={};};
 const states=await Promise.all([s.ready(),s.ready()]);assert.equal(starts,1);assert.ok(states.every(x=>x.ready));
});
test('transport failure recovers once and resends exact pixels',async t=>{
 const s=new DeepfaceService('.'),image=Buffer.from('same frame');let requests=0,recoveries=0;
 s.ready=async()=>{recoveries++;};t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(options.body,image);if(++requests===1)throw TypeError('fetch failed');return new Response(image,{headers:{'X-DeepFace-Result':'{}'}});});
 assert.deepEqual((await s.swap(image)).data,image);assert.equal(recoveries,1);assert.equal(requests,2);
});
test('model HTTP failures are surfaced without retry and repeated transport failures are bounded',async t=>{
 const s=new DeepfaceService('.');let recovered=0;s.ready=async()=>{recovered++;};t.mock.method(globalThis,'fetch',async()=>new Response('{"error":"model failed"}',{status:500}));
 assert.equal((await s.swap(Buffer.alloc(1))).status,500);assert.equal(recovered,0);
 t.mock.method(globalThis,'fetch',async()=>{throw TypeError('fetch failed');});await assert.rejects(s.swap(Buffer.alloc(1)),/重啟後仍未恢復/);assert.equal(recovered,1);
});
