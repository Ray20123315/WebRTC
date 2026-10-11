"""Real end-to-end regression plus visible-error regression; never overwrites old acceptance."""
import json,runpy,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.codex/codex/tmp/deepface-start-fix'
runpy.run_path(str(ROOT/'tools/deepface_browser_validation.py'))
report=json.loads((ROOT/'.codex/codex/tmp/watermark/deepface-browser-validation.json').read_text(encoding='utf-8'))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--enable-unsafe-webgpu'])
 page=browser.new_page()
 page.goto('http://localhost:8788')
 page.select_option('#source','fixture')
 page.route('**/api/deepface/swap',lambda route:route.fulfill(status=503,content_type='application/json',body=json.dumps({'error':'Regression inference failure'})))
 page.click('#deepfaceToggle');page.click('#startButton')
 page.wait_for_function("document.querySelector('#decision').textContent==='Regression inference failure'",timeout=30000)
 assert page.locator('#startButton').is_enabled()
 assert page.evaluate('watermarkLab.metrics.swappedFrames')==0
 report['persistent_error_verified']=True
 report['health']=page.request.get('http://localhost:8788/api/deepface/health').json()
 assert report['health']['ready'] and report['health']['warmup_swapped']
 page.screenshot(path=str(OUT/'visible-error.png'))
 browser.close()
target=ROOT/os.environ.get('DFL_VALIDATION_OUTPUT','validation/results/deepface-start-fix.json')
target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS: after/before real swap, baseline retention, visible inference error, actual warmup')
