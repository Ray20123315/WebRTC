const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const Watermark=require('../public/watermark');
const root=path.resolve(__dirname,'..'),python=path.join(root,'.local/dfl-env/Scripts/python.exe');
test('native CPU watermark matches browser reference after byte rounding',{skip:!fs.existsSync(python)},()=>{
 const w=32,h=24,rgb=Buffer.alloc(w*h*3);for(let i=0;i<rgb.length;i++)rgb[i]=(i*19+73)%256;
 const script="import sys,json,base64,numpy as np;sys.path.insert(0,'tools');from source_watermark import embed;d=json.load(sys.stdin);rgb=np.frombuffer(base64.b64decode(d['rgb']),np.uint8).reshape(24,32,3);out=embed(rgb[:,:,::-1].copy(),42,36)[:,:,::-1];print(base64.b64encode(out.tobytes()).decode())";
 const run=spawnSync(python,['-c',script],{cwd:root,input:JSON.stringify({rgb:rgb.toString('base64')}),encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 const actual=Buffer.from(run.stdout.trim(),'base64'),rgba=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){rgba.set(rgb.subarray(i*3,i*3+3),i*4);rgba[i*4+3]=255;}
 const expected=Watermark.embed(rgba,w,h,42,36);let max=0;for(let i=0;i<w*h;i++)for(let c=0;c<3;c++)max=Math.max(max,Math.abs(actual[i*3+c]-expected[i*4+c]));assert.ok(max<=1,'max byte error='+max);
});
