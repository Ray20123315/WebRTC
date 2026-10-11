const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
class DeepfaceService{
 constructor(root){this.root=root;this.process=null;this.starting=null;}
 async health(){const r=await fetch('http://127.0.0.1:8790/health',{signal:AbortSignal.timeout(2000)});const state=await r.json();return {ok:r.ok&&state.ready,state};}
 spawn(){if(this.process)return;const log=fs.openSync(path.join(this.root,'.local/deepface-service.log'),'a');this.process=spawn(path.join(this.root,'.local/dfl-env/Scripts/python.exe'),[path.join(this.root,'tools/deepface_service.py')],{cwd:this.root,windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);this.process.once('exit',(code,signal)=>{fs.appendFileSync(path.join(this.root,'.local/deepface-service.log'),`\nInference process exited: code=${code} signal=${signal}\n`);this.process=null;});this.process.once('error',()=>{this.process=null;});}
 async ready(){
  if(this.starting)return this.starting;
  this.starting=this.waitReady();try{return await this.starting;}finally{this.starting=null;}
 }
 async waitReady(){
  let initial;
  try{initial=await this.health();}catch(e){if(e.name!=='TypeError'&&e.name!=='TimeoutError')throw e;}
  if(initial){if(initial.ok)return initial.state;throw Error(initial.state.error||'DeepFaceLive 模型回報未就緒');}
  this.spawn();
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){await new Promise(r=>setTimeout(r,300));let h;try{h=await this.health();}catch(e){if(e.name!=='TypeError'&&e.name!=='TimeoutError')throw e;}if(h?.ok)return h.state;if(h?.state.error)throw Error(h.state.error);if(!this.process)throw Error('DeepFaceLive 推論程序已退出；請查看 .local/deepface-service.log');}
  throw Error('DeepFaceLive 8790 推論服務啟動逾時；請查看 .local/deepface-service.log');
 }
 async swap(image){
  const request=async()=>{const r=await fetch('http://127.0.0.1:8790/swap',{method:'POST',headers:{'Content-Type':'image/png'},body:image,signal:AbortSignal.timeout(30000)});return r.ok?{ok:true,headers:r.headers,data:Buffer.from(await r.arrayBuffer())}:r;};
  try{return await request();}catch(e){if(e.name==='TimeoutError')throw Error('DeepFaceLive 推論超過30秒，請查看服務紀錄');await this.ready();try{return await request();}catch{throw Error('DeepFaceLive 8790 推論服務連線失敗，重啟後仍未恢復');}}
 }
}
module.exports={DeepfaceService};
