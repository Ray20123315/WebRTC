"""Native DirectShow camera capture + TPM signing. No caller-supplied pixels or generic sign API."""
import argparse,base64,hashlib,json,os,secrets,subprocess,time,sys,threading
from pathlib import Path
from http.server import HTTPServer,BaseHTTPRequestHandler
import cv2
from source_watermark import embed

ROOT=Path(__file__).resolve().parents[1]
def digest(value):return hashlib.sha256(value).hexdigest()
class Agent:
 def __init__(self,camera):
  self.camera=camera;self.capture=None;self.session=None;self.sequence=0;self.previous='';self.last_frame=0
  self.signer=subprocess.Popen(['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(ROOT/'tools/source_signer.ps1')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',creationflags=subprocess.CREATE_NO_WINDOW)
  self.identity=json.loads(self.signer.stdout.readline())
  if not self.identity.get('ready'):raise RuntimeError('TPM unavailable: '+self.identity.get('error','unknown'))
  self.identity['camera_index']=camera
 def close(self):
  if self.capture:self.capture.release()
  self.capture=None;self.session=None
 def start(self,session):
  self.close()
  if session['expires']<=int(time.time()*1000):raise ValueError('Expired session')
  self.capture=cv2.VideoCapture(self.camera,cv2.CAP_DSHOW)
  self.capture.set(cv2.CAP_PROP_FRAME_WIDTH,640);self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT,480)
  if not self.capture.isOpened():self.close();raise RuntimeError('Native camera cannot open; stop other camera applications')
  self.session=session;self.sequence=0;self.previous='';self.last_frame=time.monotonic()
 def frame(self):
  if not self.session or self.session['expires']<int(time.time()*1000):self.close();raise ValueError('Session expired or not started')
  ok,frame=self.capture.read()
  self.last_frame=time.monotonic()
  if not ok:raise RuntimeError('Camera frame unavailable')
  frame=cv2.resize(frame,(640,480))
  embed_started=time.perf_counter()
  frame=embed(frame,self.session['seed'],self.session['strength'])
  embed_ms=(time.perf_counter()-embed_started)*1000
  ok,jpeg=cv2.imencode('.png',frame,[cv2.IMWRITE_PNG_COMPRESSION,1])
  if not ok:raise RuntimeError('JPEG encode failed')
  jpeg=jpeg.tobytes();self.sequence+=1
  manifest={'schema':1,'session':self.session['id'],'challenge':self.session['challenge'],'seed':self.session['seed'],'strength':self.session['strength'],'sequence':self.sequence,'timestamp':int(time.time()*1000),'previous':self.previous,'imageSha256':digest(jpeg),'width':640,'height':480,'cameraIndex':self.camera,'capture':'native-directshow','watermark':'native-dct-v1','keyProvider':self.identity['provider']}
  manifest['embedMs']=embed_ms
  payload=json.dumps(manifest,separators=(',',':'),ensure_ascii=True).encode()
  self.signer.stdin.write(base64.b64encode(payload).decode()+'\n');self.signer.stdin.flush()
  signature=self.signer.stdout.readline().strip()
  if not signature:raise RuntimeError('TPM signer stopped')
  self.previous=digest(payload)
  return {'payload':base64.b64encode(payload).decode(),'signature':signature,'image':base64.b64encode(jpeg).decode()}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--camera',type=int,default=0);args=parser.parse_args()
 token=os.environ['SOURCE_AGENT_TOKEN'];agent=Agent(args.camera)
 def parent_closed():
  sys.stdin.buffer.read()
  agent.signer.terminate()
  os._exit(0) # OS releases the camera even if a driver read is blocked.
 threading.Thread(target=parent_closed,daemon=True).start()
 class Handler(BaseHTTPRequestHandler):
  def do_POST(self):
   if self.headers.get('X-Agent-Token')!=token:return self.reply(403,{'error':'Forbidden'})
   try:
    size=int(self.headers.get('Content-Length','0'))
    if size>4096:raise ValueError('Request too large')
    body=json.loads(self.rfile.read(size) or b'{}')
    if self.path=='/identity':result=agent.identity
    elif self.path=='/start':agent.start(body);result={'ready':True}
    elif self.path=='/frame':result=agent.frame()
    elif self.path=='/stop':agent.close();result={'stopped':True}
    else:return self.reply(404,{'error':'Not found'})
    self.reply(200,result)
   except Exception as e:self.reply(503,{'error':type(e).__name__+': '+str(e)})
  def reply(self,status,value):
   data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
  def log_message(self,*args):pass
 print('Native source agent TPM ready',flush=True)
 server=HTTPServer(('127.0.0.1',8791),Handler);server.timeout=1
 try:
  while True:
   server.handle_request()
   if agent.capture and time.monotonic()-agent.last_frame>15:agent.close()
 finally:agent.close();agent.signer.terminate()
if __name__=='__main__':main()
