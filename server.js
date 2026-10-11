const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { SourceService } = require('./source-service');
const { DeepfaceService } = require('./deepface-service');
let deepfaceProcess;
const dflDir = path.join(__dirname,'.local','DeepFaceLive');
const dflPython = path.join(__dirname,'.local','dfl-env','Scripts','pythonw.exe');

const publicDir = path.join(__dirname, 'public');
const rooms = new Map();

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}


function serveFile(request, response) {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(publicDir, path.normalize(requested).replace(/^([\\/])+/, ''));
  if (!filePath.startsWith(publicDir + path.sep)) return json(response, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (error, data) => {
    if (error) return json(response, 404, { error: 'Not found' });
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    response.end(data);
  });
}

function createServer() {
  const sourceService=new SourceService(__dirname);
  const inferenceService=new DeepfaceService(__dirname);
  return http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if(url.pathname.startsWith('/api/source/')){
    let hostname;try{hostname=new URL('http://'+request.headers.host).hostname;}catch{return json(response,403,{error:'Invalid source host'});}
    if(!['localhost','127.0.0.1'].includes(hostname))return json(response,403,{error:'Local source host required'});
  }
  if(url.pathname==='/api/source/session'&&request.method==='GET'){
    if(!sourceService.session||sourceService.session.id!==url.searchParams.get('id'))return json(response,404,{error:'來源工作階段不存在或已結束'});
    return json(response,200,{...sourceService.session,jwk:sourceService.identity.jwk});
  }
  if(url.pathname.startsWith('/api/source/')&&request.method==='POST'){
    if(request.headers['x-watermark-lab']!=='1'||request.headers.origin!==`http://${request.headers.host}`)return json(response,403,{error:'Same-origin source request required'});
    let chunks=[],bytes=0;request.on('data',c=>{bytes+=c.length;if(bytes<=4096)chunks.push(c);});request.on('end',async()=>{
      if(bytes>4096)return json(response,413,{error:'Request too large'});
      try{const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');let result;
        if(url.pathname==='/api/source/start')result=await sourceService.start(body);
        else if(url.pathname==='/api/source/frame')result=await sourceService.frame(body.session);
        else if(url.pathname==='/api/source/stop'){await sourceService.stop(body.session);result={stopped:true};}
        else return json(response,404,{error:'Unknown source endpoint'});
        if(response.destroyed&&url.pathname==='/api/source/start'){await sourceService.stop(result.id);return;}
        json(response,200,result);
      }catch(e){json(response,503,{error:e.message});}
    });return;
  }
  if(url.pathname==='/api/deepface/fixture'&&request.method==='GET'){
    const file=path.join(dflDir,'doc','celebs','Irina_Arty','Irina_Arty.png');
    fs.readFile(file,(e,data)=>{if(e)return json(response,404,{error:'Fixture unavailable'});response.writeHead(200,{'Content-Type':'image/png'});response.end(data);});return;
  }
  if(url.pathname==='/api/deepface/status'&&request.method==='GET')return json(response,200,{installed:fs.existsSync(dflPython)&&fs.existsSync(path.join(dflDir,'main.py')),running:!!deepfaceProcess});
  if(url.pathname==='/api/deepface/service'&&request.method==='POST'){
    if(request.headers['x-watermark-lab']!=='1'||(request.headers.origin&&request.headers.origin!==`http://${request.headers.host}`))return json(response,403,{error:'Local UI request required'});
    if(!fs.existsSync(dflPython))return json(response,503,{error:'DeepFaceLive 尚未安裝'});
    inferenceService.ready().then(state=>json(response,200,{...state,status:'ready'})).catch(e=>json(response,503,{error:e.message}));return;
  }
  if(url.pathname==='/api/deepface/health'&&request.method==='GET'){
    fetch('http://127.0.0.1:8790/health',{signal:AbortSignal.timeout(2000)}).then(async r=>json(response,r.status,await r.json())).catch(()=>json(response,503,{ready:false}));return;
  }
  if(url.pathname==='/api/deepface/swap'&&request.method==='POST'){
    if(request.headers['x-watermark-lab']!=='1'||(request.headers.origin&&request.headers.origin!==`http://${request.headers.host}`))return json(response,403,{error:'Local UI request required'});
    let bytes=0,chunks=[],large=false;request.on('data',c=>{bytes+=c.length;if(bytes>2000000)large=true;else chunks.push(c);});request.on('end',async()=>{if(large)return json(response,413,{error:'Frame too large'});try{
      const r=await inferenceService.swap(Buffer.concat(chunks));
      if(!r.ok){const detail=await r.json().catch(()=>({}));return json(response,503,{error:detail.error||'DeepFaceLive 推論服務失敗（HTTP '+r.status+'）'});}
      response.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-DeepFace-Result':r.headers.get('X-DeepFace-Result')||'{}'});response.end(r.data);
    }catch(e){json(response,503,{error:e.message});}});return;
  }
  if(url.pathname==='/api/deepface/start'&&request.method==='POST'){
    const origin=request.headers.origin;
    if(request.headers['x-watermark-lab']!=='1'||(origin&&origin!==`http://${request.headers.host}`))return json(response,403,{error:'Local UI request required'});
    if(!fs.existsSync(dflPython)||!fs.existsSync(path.join(dflDir,'main.py')))return json(response,503,{error:'DeepFaceLive 尚未安裝'});
    if(deepfaceProcess)return json(response,200,{status:'DeepFaceLive 已在執行'});
    fs.mkdirSync(path.join(__dirname,'.local','dfl-userdata'),{recursive:true});
    deepfaceProcess=spawn(dflPython,[path.join(__dirname,'tools','launch_deepface.py')],{cwd:dflDir,windowsHide:true,stdio:'ignore'});
    deepfaceProcess.once('error',()=>{deepfaceProcess=null;});deepfaceProcess.once('exit',()=>{deepfaceProcess=null;});return json(response,200,{status:'已送出 DeepFaceLive 啟動指令；請確認視窗'});
  }
  if (url.pathname === '/api/events' && request.method === 'GET') {
    const room = url.searchParams.get('room'), role = url.searchParams.get('role');
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(room || '') || !['sender','receiver'].includes(role)) return json(response,400,{error:'Invalid room or role'});
    let peers=rooms.get(room);if(!peers){if(rooms.size>=100)return json(response,503,{error:'Room limit'});rooms.set(room,peers=new Map());}
    if(peers.has(role))return json(response,409,{error:'Role already connected'});
    response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});
    response.write('event: ready\ndata: {}\n\n');peers.set(role,response);
    for(const peer of peers.values())peer.write('event: peers\ndata: '+JSON.stringify([...peers.keys()])+'\n\n');
    const heartbeat=setInterval(()=>response.write(': keepalive\n\n'),15000);
    request.on('close',()=>{clearInterval(heartbeat);peers.delete(role);for(const peer of peers.values())peer.write('event: left\ndata: {}\n\n');if(!peers.size)rooms.delete(room);});return;
  }
  if(url.pathname==='/api/signal'&&request.method==='POST'){
    let raw='',bytes=0,large=false;request.on('data',chunk=>{bytes+=chunk.length;if(bytes>65536){large=true;}else raw+=chunk;});
    request.on('end',()=>{if(large)return json(response,413,{error:'Signal too large'});try{
      const m=JSON.parse(raw);if(!['sender','receiver'].includes(m.role)||!['offer','answer','candidate','config'].includes(m.type))return json(response,400,{error:'Invalid signal'});
      const peer=rooms.get(m.room)?.get(m.role==='sender'?'receiver':'sender');if(!peer)return json(response,409,{error:'Peer not connected'});
      peer.write('event: signal\ndata: '+JSON.stringify({type:m.type,data:m.data})+'\n\n');json(response,200,{ok:true});
    }catch{return json(response,400,{error:'Invalid JSON'});}});return;
  }
  if (request.method === 'GET') return serveFile(request, response);
  json(response, 405, { error: 'Method not allowed' });
  });
}

if (require.main === module) {
  createServer().listen(process.env.PORT || 8788, process.env.HOST || '127.0.0.1', () => console.log('Watermark WebRTC: http://localhost:'+(process.env.PORT || 8788)));
}

module.exports = { createServer };
