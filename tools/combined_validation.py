"""Native TPM source + actual official DeepFaceLive through WebRTC, no image saved."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--enable-unsafe-webgpu','--autoplay-policy=no-user-gesture-required'])
 page=b.new_page();page.goto('http://localhost:8788');page.click('#sourceSigning');page.click('#startButton')
 try:
  page.wait_for_function('watermarkLab.records.length>=3',timeout=60000);page.click('#calibrate');page.wait_for_function('watermarkLab.experiment().baseline!==null',timeout=30000)
  normal=page.evaluate('watermarkLab.experiment().baseline')
  page.click('#deepfaceToggle');page.click('#startButton')
  page.wait_for_function('watermarkLab.records.length>=15 && watermarkLab.metrics.swappedFrames>=10',timeout=90000)
  result=page.evaluate('({baseline:watermarkLab.experiment().baseline,metrics:watermarkLab.metrics,source:document.querySelector("#sourceStatus").textContent,deepface:document.querySelector("#deepfaceStatus").textContent,status:document.querySelector("#connectionState").textContent,records:watermarkLab.records.slice(-5)})')
  assert normal==result['baseline'];assert result['status']=='connected'
  result.update(passed=True,real_camera=True,baseline_preserved=True,expected_decision='Depends on manual ROI and camera scene; startup/actual swap tested, no guaranteed tamper decision')
  (ROOT/'validation/results/combined-start-fix.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps(result,ensure_ascii=True))
 finally:page.evaluate('watermarkLab.stop()');b.close()
