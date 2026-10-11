const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {verifyEnvelope}=require('./source-verifier');
class SourceService{
 constructor(root){this.root=root;this.token=crypto.randomBytes(32).toString('hex');this.process=null;this.session=null;this.previous=null;this.busy=false;}
 async call(route,body={}){const r=await fetch('http://127.0.0.1:8791/'+route,{method:'POST',headers:{'X-Agent-Token':this.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok)throw Error(result.error);return result;}
 async boot(){
  if(!this.process){const logfile=fs.openSync(path.join(this.root,'.local','source-agent.log'),'a');this.process=spawn(path.join(this.root,'.local/dfl-env/Scripts/python.exe'),[path.join(this.root,'tools/source_agent.py')],{cwd:this.root,windowsHide:true,env:{...process.env,SOURCE_AGENT_TOKEN:this.token},stdio:['pipe',logfile,logfile]});fs.closeSync(logfile);this.process.on('exit',()=>{this.process=null;this.session=null;});this.process.on('error',()=>{this.process=null;});}
  let identity;
  for(let i=0;i<50;i++){try{identity=await this.call('identity');break;}catch(e){if(!this.process)throw Error('本機採集或TPM初始化失敗；請查看 .local/source-agent.log');await new Promise(r=>setTimeout(r,200));}}
  if(!identity?.ready||identity.provider!=='Microsoft Platform Crypto Provider'||!identity.privateExportBlocked)throw Error('TPM來源金鑰尚未就緒');
  const pin=path.join(this.root,'.local/source-public-key.json');
  if(!fs.existsSync(pin))fs.writeFileSync(pin,JSON.stringify({jwk:identity.jwk,provider:identity.provider,enrollment:'local-first-use'},null,2),{flag:'wx'});
  const saved=JSON.parse(fs.readFileSync(pin));
  if(saved.jwk.n!==identity.jwk.n||saved.jwk.e!==identity.jwk.e)throw Error('來源金鑰已改變，拒絕自動重新信任');
  this.identity=identity;return identity;
 }
 async start(settings){
  if(this.busy||this.session)throw Error('已有本機採集工作階段，請先停止');
  this.busy=true;
  try{await this.boot();if(!Number.isInteger(settings.seed)||settings.seed<0||settings.seed>0xffffffff||!Number.isFinite(settings.strength)||settings.strength<8||settings.strength>100)throw Error('浮水印設定無效');
   this.session={id:crypto.randomUUID(),challenge:crypto.randomBytes(32).toString('base64url'),seed:settings.seed,strength:settings.strength,expires:Date.now()+10*60*1000};this.previous={sequence:0,hash:''};await this.call('start',this.session);this.armLease();return {...this.session,jwk:this.identity.jwk,provider:this.identity.provider,assurance:'local-tpm-signature; camera hardware and executable NOT attested'};
  }catch(e){this.session=null;throw e;}finally{this.busy=false;}
 }
 armLease(){clearTimeout(this.lease);const id=this.session?.id;this.lease=setTimeout(()=>{if(this.session?.id!==id)return;if(this.busy){this.armLease();return;}this.stop(id).catch(()=>{});},15000);this.lease.unref();}
 async frame(id){if(!this.session||id!==this.session.id)throw Error('來源工作階段不符');if(this.busy)throw Error('來源採集忙碌');this.busy=true;try{const envelope=await this.call('frame');const result=verifyEnvelope(envelope,this.session,this.identity.jwk,this.previous);this.previous=result.checkpoint;this.armLease();return {...envelope,verified:true};}finally{this.busy=false;}}
 async stop(id){if(!this.session||id!==this.session.id)return;clearTimeout(this.lease);try{await this.call('stop');}finally{this.session=null;this.previous=null;}}
}
module.exports={SourceService};
