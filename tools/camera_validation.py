"""Camera acquisition regression; fake media is explicit and no camera image is saved."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--enable-unsafe-webgpu','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
 page=b.new_page();page.goto('http://localhost:8788')
 checks=page.evaluate('''async()=>{
 const calls=[];const mock={getUserMedia:async c=>{calls.push(c);if(calls.length===1)throw new DOMException('busy','NotReadableError');return 'stream';}};
 const result=await CameraInput.open(mock,'chosen',640,480,30);
 if(result!=='stream'||calls.length!==2||calls[1].video.deviceId.exact!=='chosen'||calls[1].video.width)throw Error('retry regression');
 let denied=0;try{await CameraInput.open({getUserMedia:async()=>{denied++;throw new DOMException('denied','NotAllowedError');}},'',640,480,30);}catch(e){}
 if(denied!==1)throw Error('permission retried');
 return {same_device_retry:true,permission_not_retried:true};}''')
 page.click('#startButton');page.wait_for_function("document.querySelector('#remoteVideo').videoWidth===640",timeout=30000)
 page.click('#calibrate');page.wait_for_function("watermarkLab.records.at(-1)?.state==='watermark_intact'",timeout=20000)
 checks['fake_camera_webrtc_watermark']=True
 page.click('#stopButton');b.close()
 checks['real_camera_probe']='NotReadableError; user confirmed another program using camera; no real camera pass claimed'
 Path('validation/results/camera-fix.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
 print(checks)
