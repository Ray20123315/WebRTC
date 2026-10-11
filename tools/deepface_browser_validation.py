"""Actual DeepFaceLive DFM/landmark/merger output traverses real WebRTC."""
import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.codex/codex/tmp/watermark'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--enable-unsafe-webgpu','--autoplay-policy=no-user-gesture-required'])
 page=browser.new_page(viewport={'width':1280,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:8788');page.select_option('#source','fixture')
 for key,value in {'X':.375,'Y':.25,'W':.25,'H':.5}.items():page.fill('#roi'+key,str(value));page.locator('#roi'+key).dispatch_event('change')
 page.click('#startButton');page.wait_for_function("document.querySelector('#remoteVideo').videoWidth===640",timeout=30000);page.click('#calibrate')
 page.wait_for_function("document.querySelector('#decision').textContent==='浮水印完整'",timeout=20000)
 normal=page.evaluate('({config:watermarkLab.experiment(),metrics:watermarkLab.metrics,records:watermarkLab.records.slice(-5)})')
 page.screenshot(path=str(OUT/'deepface-normal.png'),full_page=True)
 page.click('#deepfaceToggle');page.click('#startButton')
 page.wait_for_function('watermarkLab.metrics.swappedFrames>=15 && watermarkLab.records.length>=5',timeout=90000)
 page.wait_for_function("watermarkLab.records.at(-1)?.state==='suspected_tamper'",timeout=15000)
 actual=page.evaluate('({config:watermarkLab.experiment(),metrics:watermarkLab.metrics,records:watermarkLab.records.slice(-15),decision:document.querySelector("#decision").textContent})')
 page.screenshot(path=str(OUT/'deepface-swapped.png'),full_page=True)
 page.click('#stopButton');page.select_option('#attackPosition','before');page.click('#startButton')
 page.wait_for_function('watermarkLab.metrics.swappedFrames>=15 && watermarkLab.records.length>=5',timeout=90000)
 page.wait_for_function("watermarkLab.records.at(-1)?.state==='watermark_intact'",timeout=15000)
 before=page.evaluate('({metrics:watermarkLab.metrics,records:watermarkLab.records.slice(-5),decision:document.querySelector("#decision").textContent})')
 page.screenshot(path=str(OUT/'deepface-before-watermark.png'),full_page=True)
 report={'kind':'actual DeepFaceLive official DFM + YoloV5Face + FaceMesh + FaceMerger through Chrome WebRTC','fixture':'official synthetic Irina_Arty image','normal':normal,'swapped':actual,'swap_before_watermark':before,'page_errors':errors}
 (OUT/'deepface-browser-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'normal':normal['records'][-1],'swap':actual,'errors':errors},ensure_ascii=False))
 page.click('#stopButton');browser.close()
