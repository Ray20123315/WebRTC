const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server');

test('server can be created without starting a listener', () => {
  const server = createServer();
  assert.equal(server.listening, false);
  server.close();
});

test('HTTP serves the UI with query strings and rejects malformed JSON', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${base}/?test=1`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /WebRTC/);
  const invalid = await fetch(`${base}/api/signal`, { method: 'POST', body: '{' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, 'Invalid JSON');
  const legacy=await fetch(`${base}/api/verify`,{method:'POST',body:'{}'});
  assert.equal(legacy.status,405);
  const unsafe=await fetch(`${base}/api/deepface/start`,{method:'POST'});
  assert.equal(unsafe.status,403);
  const crossOrigin=await fetch(`${base}/api/deepface/swap`,{method:'POST',headers:{'X-Watermark-Lab':'1',Origin:'https://example.invalid'}});
  assert.equal(crossOrigin.status,403);
  const invalidRoom=await fetch(`${base}/api/events?room=../bad&role=sender`);
  assert.equal(invalidRoom.status,400);
  const sourceNoOrigin=await fetch(`${base}/api/source/start`,{method:'POST',headers:{'X-Watermark-Lab':'1'},body:'{}'});
  assert.equal(sourceNoOrigin.status,403);
  const sourceForeign=await fetch(`${base}/api/source/start`,{method:'POST',headers:{'X-Watermark-Lab':'1',Origin:'https://example.invalid'},body:'{}'});
  assert.equal(sourceForeign.status,403);
  const sourceRebind=await new Promise((resolve,reject)=>require('node:http').get(`${base}/api/source/session?id=x`,{headers:{Host:'attacker.invalid'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
  assert.equal(sourceRebind,403);
});
