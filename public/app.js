'use strict';
const $=s=>document.querySelector(s), W=640,H=480, canvas=$('#senderCanvas'),ctx=canvas.getContext('2d');
let epoch=0,active=false,inputStream,outputStream,pcs=[],workers=[],events,recorder,fileURL,seed=crypto.getRandomValues(new Uint32Array(1))[0];
let baseline=null,calibration=[],collecting=false,records=[],embedTimes=[],extractTimes=[],simulated=false,configSent=false,mode='loop',sendFrames=0,startedAt=0;
let fixture,swapAbort,swapTimes=[],swapFrames=0,deepfaceEnabled=false,attackPosition='after';
const labels={uncalibrated:'尚未校準',unavailable:'無法檢測',channel_degraded:'通道劣化／失去同步',suspected_tamper:'疑似區域篡改',watermark_intact:'浮水印完整'};
const log=m=>{$('#log').textContent=(new Date().toLocaleTimeString()+' '+m+'\n'+$('#log').textContent).slice(0,6000);};
function fail(error){error=Error(CameraInput.message(error));log(error.message);stop();$('#connectionState').textContent='啟動／串流失敗';$('#decision').textContent=error.message;$('#decision').style.color='#bd3333';$('#deepfaceStatus').textContent=error.message;}
async function apiError(response,fallback){const body=await response.json().catch(()=>({}));return Error(body.error||fallback+'（HTTP '+response.status+'）');}
function lockSetup(locked){for(const id of ['mode','source','camera','room','codec','bitrate','fps','strength','file','roiX','roiY','roiW','roiH','import','attackPosition','sourceSigning'])$('#'+id).disabled=locked;}
for(const id of ['source','camera','codec','bitrate','fps','strength'])$('#'+id).addEventListener('change',()=>{baseline=null;$('#decision').textContent='設定已變更，請重新校準';});
function roi(){const r={x:+$('#roiX').value,y:+$('#roiY').value,w:+$('#roiW').value,h:+$('#roiH').value};if(Object.values(r).some(n=>!Number.isFinite(n))||r.x<0||r.y<0||r.w<.1||r.h<.1||r.x+r.w>1||r.y+r.h>1)throw Error('ROI 必須位於畫面內。');return r;}
function p95(a){return a.length?a.slice().sort((a,b)=>a-b)[Math.floor((a.length-1)*.95)]:null;}
function updateROI(){try{const r=roi();Object.assign($('#roiBox').style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});}catch(e){log(e.message);}}
for(const id of ['roiX','roiY','roiW','roiH'])$('#'+id).addEventListener('change',()=>{baseline=null;updateROI();});
function createWorker(){const worker=new Worker('watermark-worker.js'),pending=new Map();let id=0;workers.push(worker);worker.onmessage=({data})=>{const p=pending.get(data.id);if(p){pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(Error(data.error)):p.resolve(data);}};worker.onerror=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(e.message));}pending.clear();};worker.cancel=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('已停止'));}pending.clear();worker.terminate();};return(m,transfer=[])=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('GPU worker timeout'));},15000);pending.set(key,{resolve,reject,timer});worker.postMessage({...m,id:key},transfer);});}
async function iceComplete(pc){if(pc.iceGatheringState==='complete')return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(Error('ICE gathering timeout'));},10000);function check(){if(pc.iceGatheringState==='complete'){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();}}pc.addEventListener('icegatheringstatechange',check);});}
function peer(){const pc=new RTCPeerConnection({iceServers:[]});pcs.push(pc);pc.onconnectionstatechange=()=>{$('#connectionState').textContent=pc.connectionState;};return pc;}
async function addOutput(pc){const track=outputStream.getVideoTracks()[0];track.contentHint='detail';const sender=pc.addTrack(track,outputStream);const transceiver=pc.getTransceivers()[0],codec=$('#codec').value;const supported=RTCRtpSender.getCapabilities('video').codecs.filter(c=>c.mimeType.toUpperCase()==='VIDEO/'+codec.toUpperCase());if(!supported.length)throw Error('不支援 '+codec);transceiver.setCodecPreferences(supported);const p=sender.getParameters();p.degradationPreference='maintain-resolution';p.encodings=[{maxBitrate:+$('#bitrate').value*1000,maxFramerate:+$('#fps').value,scaleResolutionDownBy:1}];await sender.setParameters(p);}
function received(pc){pc.ontrack=e=>{$('#remoteVideo').srcObject=e.streams[0]||new MediaStream([e.track]);$('#remoteVideo').play().catch(e=>log(e.message));};}
async function signal(type,data){const r=await fetch('/api/signal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:$('#room').value,role:mode,type,data})});if(!r.ok)throw Error((await r.json()).error);}
function experiment(){return{schema:1,sourceSigning:$('#sourceSigning').checked,sourceAssurance:$('#sourceStatus').textContent,seed,strength:+$('#strength').value,width:W,height:H,roi:roi(),baseline,codec:$('#codec').value,bitrateKbps:+$('#bitrate').value,targetFps:+$('#fps').value,deepfaceEnabled:$('#deepfaceToggle').checked,attackPosition:$('#attackPosition').value};}
async function start(){
 if(active)return;active=true;const token=++epoch;mode=$('#mode').value;lockSetup(true);$('#connectionState').textContent='啟動中';$('#startButton').disabled=true;$('#stopButton').disabled=false;baseline=baseline||null;records=[];embedTimes=[];extractTimes=[];sendFrames=0;startedAt=performance.now();configSent=false;
 try{
  roi();if($('#sourceSigning').checked){if(mode!=='loop'||$('#source').value!=='camera')throw Error('來源簽章目前限本機回路與攝影機來源');if($('#deepfaceToggle').checked&&$('#attackPosition').value==='before')throw Error('本機採集模式不允許在浮水印之前換臉');}
deepfaceEnabled=$('#deepfaceToggle').checked;attackPosition=$('#attackPosition').value;swapTimes=[];swapFrames=0;swapAbort=new AbortController();
  if(deepfaceEnabled){if(['external','file'].includes($('#source').value))throw Error('直接換臉測試請選擇攝影機或官方人臉測試圖');const r=await fetch('/api/deepface/service',{method:'POST',headers:{'X-Watermark-Lab':'1'}});if(!r.ok)throw await apiError(r,'DeepFaceLive 服務啟動失敗');let ready=false;for(let i=0;i<60&&token===epoch;i++){const h=await fetch('/api/deepface/health',{signal:swapAbort.signal});if(h.ok&&(await h.json()).ready){ready=true;break;}await new Promise(r=>setTimeout(r,500));}if(token!==epoch)return;if(!ready)throw Error('DeepFaceLive 模型尚未就緒');}
  const extractRPC=createWorker();await extractRPC({type:'init',width:W,height:H});if(token!==epoch)return;
  if(mode!=='receiver'){
   const source=$('#source').value,local=$('#localVideo');
   if(source==='file'){const file=$('#file').files[0];if(!file)throw Error('請選擇已處理影片。');fileURL=URL.createObjectURL(file);local.src=fileURL;local.loop=true;await local.play();}
   else if(source==='fixture'){fixture=new Image();fixture.src='/api/deepface/fixture';await fixture.decode();}
   else if(source!=='synthetic'&&!$('#sourceSigning').checked){const acquired=await CameraInput.open(navigator.mediaDevices,$('#camera').value,W,H,+$('#fps').value,()=>token===epoch);if(token!==epoch){acquired.getTracks().forEach(t=>t.stop());return;}inputStream=acquired;local.srcObject=inputStream;await local.play();}
   if($('#sourceSigning').checked){await SourceCapture.start(seed,+$('#strength').value,swapAbort.signal);if(token!==epoch){SourceCapture.stop();return;}}
   let embedRPC;if(!$('#sourceSigning').checked){embedRPC=createWorker();await embedRPC({type:'init',width:W,height:H});}if(token!==epoch)return;
   outputStream=canvas.captureStream(0);sendLoop(token,source,embedRPC);
  }
  if(mode==='loop'){
   const a=peer(),b=peer();received(b);await addOutput(a);await a.setLocalDescription(await a.createOffer());await iceComplete(a);await b.setRemoteDescription(a.localDescription);await b.setLocalDescription(await b.createAnswer());await iceComplete(b);await a.setRemoteDescription(b.localDescription);
  }else{
   const pc=peer();if(mode==='receiver')received(pc);else await addOutput(pc);
   events=new EventSource('/api/events?room='+encodeURIComponent($('#room').value)+'&role='+mode);
   events.addEventListener('peers',async e=>{try{if(JSON.parse(e.data).length===2&&mode==='sender'&&!configSent){configSent=true;await signal('config',experiment());await pc.setLocalDescription(await pc.createOffer());await iceComplete(pc);if(token===epoch)await signal('offer',pc.localDescription);}}catch(e){log(e.message);stop();}});
   events.addEventListener('signal',async e=>{try{const m=JSON.parse(e.data);if(m.type==='config'){applyConfig(m.data);return;}if(m.type==='offer'){await pc.setRemoteDescription(m.data);await pc.setLocalDescription(await pc.createAnswer());await iceComplete(pc);if(token===epoch)await signal('answer',pc.localDescription);}else if(m.type==='answer')await pc.setRemoteDescription(m.data);}catch(e){log(e.message);stop();}});
   events.addEventListener('left',()=>{log('另一端已離線');stop();});events.onerror=()=>{log('房間訊號連線中斷或角色已占用');stop();};
  }
  receiveLoop(token,extractRPC);log('已啟動：'+mode+' / '+$('#source').value);
 }catch(e){if(token===epoch){fail(e);}}
}
async function sendLoop(token,source,rpc){
 const staging=new OffscreenCanvas(W,H),sc=staging.getContext('2d'),fps=+$('#fps').value;
 while(token===epoch){const begin=performance.now();try{
  if(source==='synthetic'){sc.fillStyle='#809aaa';sc.fillRect(0,0,W,H);for(let i=0;i<20;i++){sc.fillStyle=`hsl(${i*17} 30% 50%)`;sc.fillRect((i*31+Math.sin(begin/900)*4)%W,i*23,70,50);}sc.fillStyle='#dfb79a';sc.beginPath();sc.ellipse(320,235,100,145,0,0,Math.PI*2);sc.fill();sc.fillStyle='#283746';sc.fillRect(275,195,20,12);sc.fillRect(345,195,20,12);sc.fillRect(290,300,60,8);}
  else if(source==='fixture'){sc.fillStyle='#89949e';sc.fillRect(0,0,W,H);sc.drawImage(fixture,160,80,320,320);}
  else if($('#sourceSigning').checked){const native=await SourceCapture.frame(swapAbort.signal);if(token!==epoch){native.bitmap.close();break;}sc.drawImage(native.bitmap,0,0);native.bitmap.close();embedTimes.push(native.manifest.embedMs);if(embedTimes.length>600)embedTimes.shift();$('#sourceStatus').textContent='TPM 來源影像簽章已驗證；解碼視訊尚未密碼學綁定';}
  else sc.drawImage($('#localVideo'),0,0,W,H);
  if(deepfaceEnabled&&attackPosition==='before')await swapImage(staging,sc,token);
  const bitmap=await createImageBitmap(staging);if(token!==epoch){bitmap.close();break;}
  if(source==='external'||source==='file'||$('#sourceSigning').checked){ctx.drawImage(bitmap,0,0);bitmap.close();}
  else{const r=await rpc({bitmap,seed,strength:+$('#strength').value},[bitmap]);if(token!==epoch){r.bitmap.close();break;}ctx.drawImage(r.bitmap,0,0);r.bitmap.close();embedTimes.push(r.ms);if(embedTimes.length>600)embedTimes.shift();}
  if(deepfaceEnabled&&attackPosition==='after')await swapImage(canvas,ctx,token);
  if(token!==epoch)break;
  if(simulated){const r=roi();ctx.fillStyle='#bcaa99';ctx.fillRect(r.x*W,r.y*H,r.w*W,r.h*H);}
  outputStream.getVideoTracks()[0].requestFrame();if(!sendFrames)startedAt=performance.now();sendFrames++;
 }catch(e){if(token===epoch){fail(e);}break;}
 await new Promise(r=>setTimeout(r,Math.max(0,1000/fps-(performance.now()-begin))));}
}
async function swapImage(target,context,token){
 const blob=target.convertToBlob?await target.convertToBlob({type:'image/png'}):await new Promise(r=>target.toBlob(r,'image/png'));
 const response=await fetch('/api/deepface/swap',{method:'POST',headers:{'X-Watermark-Lab':'1'},body:blob,signal:swapAbort.signal});if(!response.ok)throw await apiError(response,'DeepFaceLive 處理失敗');
 const meta=JSON.parse(response.headers.get('X-DeepFace-Result')||'{}'),swapped=await createImageBitmap(await response.blob());if(token!==epoch){swapped.close();return;}context.drawImage(swapped,0,0);swapped.close();if(meta.swapped){swapFrames++;swapTimes.push(meta.ms);}$('#deepfaceStatus').textContent=meta.swapped?'已換臉 '+meta.ms.toFixed(1)+' ms':'未偵測到人臉（無換臉）';
}
async function receiveLoop(token,rpc){
 while(token===epoch){try{const v=$('#remoteVideo');if(v.readyState>=2){
  if(v.videoWidth!==W||v.videoHeight!==H){$('#decision').textContent='尺寸不符／失去同步';await new Promise(r=>setTimeout(r,250));continue;}
  const bitmap=await createImageBitmap(v);if(token!==epoch){bitmap.close();break;}const r=await rpc({bitmap,seed,extract:true,roi:roi()},[bitmap]);if(token!==epoch)break;
  extractTimes.push(r.ms);if(extractTimes.length>600)extractTimes.shift();const s=r.scores;
  if(collecting){calibration.push(s);if(calibration.length===30){collecting=false;baseline={face:calibration.reduce((a,s)=>a+s.face,0)/30,background:calibration.reduce((a,s)=>a+s.background,0)/30};log('校準完成 '+JSON.stringify(baseline));if(mode==='receiver')log('請匯出設定，保存此基準。');}}
  const state=Watermark.decide(s,baseline);records.push({t:Date.now(),...s,state,extractMs:r.ms,syntheticTamper:simulated,deepfaceEnabled,attackPosition,swappedFrames:swapFrames});if(records.length>10000)records.shift();
  $('#face').textContent=(s.face*100).toFixed(1)+'%';$('#background').textContent=(s.background*100).toFixed(1)+'%';$('#decision').textContent=collecting?'校準 '+calibration.length+'/30':labels[state];$('#decision').style.color=state==='suspected_tamper'?'#bd3333':state==='watermark_intact'?'#127877':'#665e50';
  $('#latency').textContent=(p95(embedTimes)?.toFixed(1)||'—')+' / '+p95(extractTimes).toFixed(1)+' ms';$('#performance').textContent='發送 '+(sendFrames*1000/(performance.now()-startedAt)).toFixed(1)+' FPS；提取 5 Hz';
 }}catch(e){if(token===epoch){fail(e);}break;}await new Promise(r=>setTimeout(r,200));}
}
function stop(){SourceCapture.stop();$('#sourceStatus').textContent='來源未啟用';active=false;++epoch;lockSetup(false);swapAbort?.abort();events?.close();events=null;recorder?.state==='recording'&&recorder.stop();for(const p of pcs)p.close();pcs=[];for(const w of workers)w.cancel();workers=[];inputStream?.getTracks().forEach(t=>t.stop());outputStream?.getTracks().forEach(t=>t.stop());inputStream=outputStream=null;for(const id of ['localVideo','remoteVideo']){const v=$('#'+id);v.pause();v.srcObject=null;v.removeAttribute('src');v.load();}if(fileURL)URL.revokeObjectURL(fileURL);fileURL=null;ctx.clearRect(0,0,W,H);collecting=false;$('#connectionState').textContent='已停止';$('#decision').textContent='未啟動';$('#face').textContent=$('#background').textContent='—';$('#startButton').disabled=false;$('#stopButton').disabled=true;$('#record').textContent='錄製浮水印輸入影片';}
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function applyConfig(c){if(c.schema!==1||c.width!==W||c.height!==H||!Number.isInteger(c.seed)||c.seed<0||c.seed>0xffffffff||!c.roi||!Number.isFinite(c.strength)||c.strength<8||c.strength>100||!['VP8','H264','VP9'].includes(c.codec)||!Number.isFinite(c.bitrateKbps)||c.bitrateKbps<100||c.bitrateKbps>10000||!Number.isFinite(c.targetFps)||c.targetFps<5||c.targetFps>30)throw Error('實驗設定格式不符');if(c.baseline&&(!Number.isFinite(c.baseline.face)||!Number.isFinite(c.baseline.background)||c.baseline.face<0||c.baseline.face>1||c.baseline.background<0||c.baseline.background>1))throw Error('基準格式不符');seed=c.seed;baseline=c.baseline;$('#strength').value=c.strength;$('#codec').value=c.codec;$('#bitrate').value=c.bitrateKbps;$('#fps').value=c.targetFps;for(const k of ['x','y','w','h'])$('#roi'+k.toUpperCase()).value=c.roi[k];roi();updateROI();log('已載入原浮水印 seed、codec 參數與正常基準');}
$('#startButton').onclick=start;$('#stopButton').onclick=stop;window.addEventListener('beforeunload',stop);
$('#calibrate').onclick=()=>{if(!active||simulated||deepfaceEnabled||['external','file'].includes($('#source').value)){log('請先關閉換臉，以正常原始來源建立基準；外部影片請匯入原基準。');return;}calibration=[];collecting=true;baseline=null;};
$('#simulate').onclick=()=>{simulated=!simulated;$('#simulate').textContent='局部破壞：'+(simulated?'開':'關');};
$('#devices').onclick=async()=>{try{const previous=$('#camera').value;const devices=await navigator.mediaDevices.enumerateDevices();const cameras=devices.filter(d=>d.kind==='videoinput');$('#camera').replaceChildren(new Option('預設',''),...cameras.map((d,i)=>new Option(d.label||'Camera '+i,d.deviceId)));if(cameras.some(d=>d.deviceId===previous))$('#camera').value=previous;log('已更新 '+cameras.length+' 個攝影機；請選擇實體攝影機。');}catch(e){log(CameraInput.message(e));}};
$('#export').onclick=()=>download(new Blob([JSON.stringify({...experiment(),createdAt:new Date().toISOString(),source:$('#source').value,embedP95:p95(embedTimes),extractP95:p95(extractTimes),deepfaceP95:p95(swapTimes),swappedFrames:swapFrames,achievedFps:sendFrames*1000/(performance.now()-startedAt),records},null,2)],{type:'application/json'}),'watermark-experiment.json');
$('#import').onchange=async e=>{try{if(active)throw Error('請先停止再匯入設定');applyConfig(JSON.parse(await e.target.files[0].text()));}catch(e){log(e.message);}};
$('#record').onclick=()=>{if(!outputStream){log('請先啟動發送端');return;}if(recorder?.state==='recording'){recorder.stop();return;}const chunks=[];recorder=new MediaRecorder(outputStream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:6000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{download(new Blob(chunks,{type:'video/webm'}),'watermarked-input.webm');$('#record').textContent='錄製浮水印輸入影片';};recorder.start(1000);$('#record').textContent='停止錄製並下載';};
globalThis.watermarkLab={start,stop,experiment,get records(){return records;},get metrics(){return{embedP95:p95(embedTimes),extractP95:p95(extractTimes),achievedFps:sendFrames*1000/(performance.now()-startedAt),deepfaceP95:p95(swapTimes),swappedFrames:swapFrames};}};
globalThis.watermarkLab.rtpStats=async()=>{const stats=[];for(const pc of pcs){const report=await pc.getStats();for(const r of report.values())if(r.type==='outbound-rtp'&&r.kind==='video'){stats.push({codec:report.get(r.codecId)?.mimeType,width:r.frameWidth,height:r.frameHeight,framesEncoded:r.framesEncoded,framesPerSecond:r.framesPerSecond,bytesSent:r.bytesSent});}}return stats;};
$('#deepfaceToggle').onchange=()=>{stop();const enabled=$('#deepfaceToggle').checked;$('#deepfaceStatus').textContent=enabled?'測試開：浮水印 → 真正 DeepFaceLive 換臉':'測試關：正常攝影機嵌入';log(enabled?'DeepFaceLive 開：啟動後以官方換臉模型處理浮水印畫面；保留原校準基準。':'DeepFaceLive 關：正常浮水印管線');};
$('#launchDeepface').onclick=async()=>{try{const r=await fetch('/api/deepface/start',{method:'POST',headers:{'X-Watermark-Lab':'1'}}),result=await r.json();if(!r.ok)throw Error(result.error);$('#deepfaceStatus').textContent=result.status;log(result.status);}catch(e){log(e.message);}};
fetch('/api/deepface/status').then(r=>r.json()).then(s=>{$('#deepfaceStatus').textContent=s.installed?'DeepFaceLive 已安裝':'DeepFaceLive 尚未安裝';}).catch(()=>{});

$('#sourceSigning').onchange=()=>{stop();baseline=null;$('#sourceStatus').textContent='本機 DirectShow 攝影機 0；TPM 簽章，尚無攝影機硬體認證';$('#camera').disabled=$('#sourceSigning').checked;};
