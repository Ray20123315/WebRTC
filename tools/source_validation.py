"""Real native camera/TPM integration; save measurements, never images or signing tokens."""
import json,base64,hashlib,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--enable-unsafe-webgpu','--autoplay-policy=no-user-gesture-required'])
 page=browser.new_page(viewport={'width':1400,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://localhost:8788');page.click('#sourceSigning');page.click('#startButton')
 try:
  page.wait_for_function("document.querySelector('#remoteVideo').videoWidth===640",timeout=60000)
  page.click('#calibrate');page.wait_for_function("watermarkLab.records.at(-1)?.state==='watermark_intact'",timeout=30000)
  result=page.evaluate('({status:document.querySelector("#sourceStatus").textContent,metrics:watermarkLab.metrics,last:watermarkLab.records.at(-1),session:{id:SourceCapture.session.id,provider:SourceCapture.session.provider,expires:SourceCapture.session.expires}})')
  page.screenshot(path=str(ROOT/'.codex/codex/tmp/source-ui.png'),mask=[page.locator('#senderCanvas'),page.locator('#remoteVideo')],full_page=True)
  page.click('#stopButton')
  page.wait_for_function("document.querySelector('#connectionState').textContent==='已停止'")
  page.wait_for_timeout(500)
  sessionCheck=page.request.get('http://localhost:8788/api/source/session?id='+result['session']['id'])
  assert sessionCheck.status==404
  page.select_option('#attackPosition','before');page.click('#deepfaceToggle');page.click('#startButton')
  page.wait_for_function("document.querySelector('#decision').textContent.includes('不允許')",timeout=10000)
  result.update(stopped_session_invalidated=True,before_watermark_rejected=True,real_camera=True,passed=True,page_errors=errors)
 finally:
  page.evaluate('watermarkLab.stop()');browser.close()
 (ROOT/'validation/results/source-signing.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(result,ensure_ascii=True))
