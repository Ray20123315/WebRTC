"""Real Chrome WebRTC/GPU regression with synthetic media, not a face-swap claim."""
import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.codex/codex/tmp/watermark'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--enable-unsafe-webgpu','--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(viewport={'width':1280,'height':1100})
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.goto('http://localhost:8788')
    reference=page.evaluate("""async()=>{
      const w=160,h=120,pixels=new Uint8ClampedArray(w*h*4);
      for(let i=0;i<pixels.length;i+=4){pixels[i]=100+(i%80);pixels[i+1]=120+(i%60);pixels[i+2]=130;pixels[i+3]=255;}
      const rpc=createWorker();await rpc({type:'init',width:w,height:h});
      const image=new OffscreenCanvas(w,h),c=image.getContext('2d');c.putImageData(new ImageData(pixels,w,h),0,0);
      const bitmap=await createImageBitmap(image),r=await rpc({bitmap,seed:42,strength:36},[bitmap]);
      c.drawImage(r.bitmap,0,0);r.bitmap.close();const actual=c.getImageData(0,0,w,h).data,expected=Watermark.embed(pixels,w,h,42);
      let maxError=0;for(let i=0;i<actual.length;i++)maxError=Math.max(maxError,Math.abs(actual[i]-expected[i]));
      return{maxByteError:maxError,passed:maxError<=1};
    }""")
    assert reference['passed'],reference
    page.select_option('#source','synthetic')
    page.click('#startButton')
    page.wait_for_function("document.querySelector('#remoteVideo').videoWidth===640",timeout=30000)
    page.click('#calibrate')
    page.wait_for_function("document.querySelector('#decision').textContent==='浮水印完整'",timeout=20000)
    normal=page.evaluate('({config:watermarkLab.experiment(),metrics:watermarkLab.metrics,records:watermarkLab.records.slice(-5)})')
    page.screenshot(path=str(OUT/'normal.png'),full_page=True)
    page.click('#simulate')
    page.wait_for_function("document.querySelector('#decision').textContent==='疑似區域篡改'",timeout=15000)
    tamper=page.evaluate('watermarkLab.records.slice(-5)')
    page.screenshot(path=str(OUT/'tamper.png'),full_page=True)
    page.click('#stopButton')
    page.click('#simulate')
    page.click('#deepfaceToggle')
    assert page.locator('#deepfaceToggle').is_checked()
    assert page.locator('#connectionState').inner_text()=='已停止'
    page.click('#deepfaceToggle')
    page.click('#startButton')
    page.wait_for_function("document.querySelector('#remoteVideo').videoWidth===640",timeout=30000)
    page.wait_for_function("document.querySelector('#decision').textContent==='浮水印完整'",timeout=20000)
    page.click('#stopButton')
    page.select_option('#source','camera')
    page.evaluate("navigator.mediaDevices.getUserMedia=()=>new Promise(r=>{globalThis.resolveCamera=r;globalThis.pendingCamera=true;});globalThis.releasedTracks=0;void watermarkLab.start();")
    page.wait_for_function('globalThis.pendingCamera===true')
    page.click('#stopButton')
    page.evaluate('resolveCamera({getTracks:()=>[{stop:()=>releasedTracks++}]})')
    page.wait_for_function('releasedTracks===1')
    assert page.locator('#connectionState').inner_text()=='已停止'
    report={'normal':normal,'synthetic_tamper':tamper,'restart':'passed','deepface_toggle':'passed','gpu_cpu_reference':reference,'page_errors':errors}
    report['late_camera_release']='passed'
    (OUT/'browser-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False))
    browser.close()
