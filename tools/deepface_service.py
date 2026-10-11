"""Local serialized DeepFaceLive inference; no saved camera frames."""
import json,threading,traceback
from http.server import HTTPServer,BaseHTTPRequestHandler
import cv2,numpy as np
from deepface_engine import Engine

engine=Engine()
last_error=None
fixture=cv2.imread(str(__import__('deepface_engine').SOURCE/'doc/celebs/Irina_Arty/Irina_Arty.png'))
probe=np.full((480,640,3),137,np.uint8)
probe[80:400,160:480]=cv2.resize(fixture,(320,320))
_,warmup=engine.swap(probe)
if not warmup.get('swapped'):raise RuntimeError('Official fixture warmup did not swap a face')
class Handler(BaseHTTPRequestHandler):
 def reply_json(self,status,value):
  body=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_GET(self):
  if self.path!='/health':self.send_error(404);return
  self.reply_json(200 if last_error is None else 503,{'ready':last_error is None,'device':str(engine.device) if engine else 'unavailable','error':last_error,'warmup_swapped':warmup['swapped']})
 def do_POST(self):
  global engine,last_error
  if self.path!='/swap':self.send_error(404);return
  size=int(self.headers.get('Content-Length','0'))
  if size<=0 or size>2000000:self.send_error(413);return
  try:
   frame=cv2.imdecode(np.frombuffer(self.rfile.read(size),np.uint8),cv2.IMREAD_COLOR)
   if frame is None or frame.shape!=(480,640,3):self.send_error(400);return
   try:output,meta=engine.swap(frame)
   except Exception:
    traceback.print_exc()
    print('Rebuilding failed inference sessions once',flush=True)
    engine=None
    __import__('gc').collect()
    engine=Engine()
    output,meta=engine.swap(frame)
    meta['recovered']=True
   last_error=None
   ok,data=cv2.imencode('.png',output)
   if not ok:raise RuntimeError('PNG encoding failed')
   self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(data)));self.send_header('X-DeepFace-Result',json.dumps(meta));self.end_headers();self.wfile.write(data.tobytes())
  except Exception as e:
   traceback.print_exc()
   last_error=type(e).__name__+': '+(str(e) or '模型推論工作階段失效；請查看服務紀錄')
   self.reply_json(500,{'ready':False,'error':last_error})
 def log_message(self,*args):pass
print('DeepFaceLive inference ready',str(engine.device),flush=True)
HTTPServer(('127.0.0.1',8790),Handler).serve_forever()
