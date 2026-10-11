import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.codex/codex/tmp/watermark'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True,args=['--enable-unsafe-webgpu','--autoplay-policy=no-user-gesture-required'])
 page=browser.new_page();results=[]
 for codec,rate in [('VP8',2000),('H264',2000),('VP9',2000),('H264',300),('VP8',100)]:
  page.goto('http://localhost:8788');page.select_option('#source','synthetic');page.select_option('#codec',codec);page.fill('#bitrate',str(rate));page.click('#startButton');page.wait_for_function("document.querySelector('#remoteVideo').videoWidth===640",timeout=30000)
  time.sleep(3);page.click('#calibrate');page.wait_for_function('watermarkLab.experiment().baseline!==null',timeout=20000)
  data=page.evaluate('({config:watermarkLab.experiment(),metrics:watermarkLab.metrics,records:watermarkLab.records.slice(-5)})');data['rtp_stats']=page.evaluate('watermarkLab.rtpStats()');data['codec']=codec;data['bitrate']=rate;results.append(data);page.click('#stopButton')
 sender=browser.new_page();receiver=browser.new_page()
 receiver.goto('http://localhost:8788');receiver.select_option('#mode','receiver');receiver.click('#startButton');time.sleep(1)
 sender.goto('http://localhost:8788');sender.select_option('#mode','sender');sender.select_option('#source','synthetic');sender.click('#startButton')
 receiver.wait_for_function("document.querySelector('#remoteVideo').videoWidth===640",timeout=30000)
 receiver.click('#calibrate');receiver.wait_for_function("document.querySelector('#decision').textContent==='浮水印完整'",timeout=20000)
 room=receiver.evaluate('({config:watermarkLab.experiment(),records:watermarkLab.records.slice(-3)})')
 sender.click('#stopButton');receiver.wait_for_function("document.querySelector('#connectionState').textContent==='已停止'",timeout=10000)
 report={'codec_matrix':results,'cross_tab_room':room,'peer_disconnect':'passed'}
 (OUT/'codec-room-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps([{'codec':r['codec'],'bitrate':r['bitrate'],'metrics':r['metrics'],'last':r['records'][-1]} for r in results]))
 browser.close()
