'use strict';
globalThis.SourceCapture=(()=>{
 let session=null,previous={sequence:0,hash:''};
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 const hex=a=>Array.from(new Uint8Array(a),x=>x.toString(16).padStart(2,'0')).join('');
 async function api(route,body,signal){const r=await fetch('/api/source/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Watermark-Lab':'1'},body:JSON.stringify(body),signal});const result=await r.json();if(!r.ok)throw Error(result.error);return result;}
 async function verify(envelope,s= session){
  if(!s)throw Error('沒有可信來源工作階段');
  const payload=bytes(envelope.payload),m=JSON.parse(new TextDecoder().decode(payload));
  const key=await crypto.subtle.importKey('jwk',s.jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(envelope.signature),payload))throw Error('來源簽章無效');
  if(m.session!==s.id||m.challenge!==s.challenge||m.seed!==s.seed||m.strength!==s.strength||Date.now()>s.expires||Math.abs(Date.now()-m.timestamp)>10000)throw Error('來源工作階段不符或已過期');
  if(m.sequence!==previous.sequence+1||m.previous!==previous.hash)throw Error('來源重播或摘要鏈不符');
  if(hex(await crypto.subtle.digest('SHA-256',bytes(envelope.image)))!==m.imageSha256)throw Error('來源影像摘要不符');
  previous={sequence:m.sequence,hash:hex(await crypto.subtle.digest('SHA-256',payload))};return m;
 }
 return {
  async start(seed,strength,signal){session=await api('start',{seed,strength},signal);previous={sequence:0,hash:''};return session;},
  async frame(signal){const e=await api('frame',{session:session.id},signal);const manifest=await verify(e);return {bitmap:await createImageBitmap(new Blob([bytes(e.image)],{type:'image/png'})),evidence:e,manifest};},
  stop(){const id=session?.id;session=null;previous={sequence:0,hash:''};if(id)fetch('/api/source/stop',{method:'POST',headers:{'Content-Type':'application/json','X-Watermark-Lab':'1'},body:JSON.stringify({session:id}),keepalive:true}).catch(()=>{});},
  get session(){return session;},verify
 };
})();
