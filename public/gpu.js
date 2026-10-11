const shader=`
struct Params { width:u32, height:u32, seed:u32, mode:u32, strength:f32 }
@group(0) @binding(0) var<storage,read> input:array<u32>;
@group(0) @binding(1) var<storage,read_write> output:array<u32>;
@group(0) @binding(2) var<storage,read_write> scores:array<f32>;
@group(0) @binding(3) var<uniform> p:Params;
var<workgroup> ca:array<f32,64>;
var<workgroup> cb:array<f32,64>;
var<workgroup> adjustment:f32;
fn basis(u:f32,v:f32,x:f32,y:f32)->f32 {return .25*cos((2*x+1)*u*3.14159265359/16)*cos((2*y+1)*v*3.14159265359/16);}
fn key(i:u32)->f32 {var x=p.seed^((i+1u)*0x9e3779b9u);x=x^(x>>16u);x=x*0x7feb352du;x=x^(x>>15u);return select(-1.0,1.0,(x&1u)==1u);}
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) g:vec3<u32>,@builtin(local_invocation_index) j:u32){
 let x=j%8u;let y=j/8u;let idx=(g.y*8u+y)*p.width+g.x*8u+x;let packed=input[idx];
 let rgb=vec3<f32>(f32(packed&255u),f32((packed>>8u)&255u),f32((packed>>16u)&255u));
 let a=basis(2,1,f32(x),f32(y));let b=basis(1,2,f32(x),f32(y));let l=dot(rgb,vec3<f32>(.299,.587,.114));ca[j]=l*a;cb[j]=l*b;
 workgroupBarrier();
 if(j==0u){var da=0.0;var db=0.0;for(var k=0u;k<64u;k++){da+=ca[k];db+=cb[k];}let block=g.y*(p.width/8u)+g.x;let s=key(block);scores[block]=s*(da-db);adjustment=max(0.0,p.strength-s*(da-db))*s*.5;}
 workgroupBarrier();
 if(p.mode==0u){let c=vec3<u32>(round(clamp(rgb+vec3<f32>(adjustment*(a-b)),vec3<f32>(0),vec3<f32>(255))));output[idx]=c.x|(c.y<<8u)|(c.z<<16u)|0xff000000u;}
}`;
class GPUWatermark{
 async init(width,height){
  if(!navigator.gpu)throw Error('此瀏覽器沒有 WebGPU，請使用新版 Chrome/Edge。');
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('無法取得 GPU adapter。');
  this.device=await adapter.requestDevice();this.width=width;this.height=height;this.device.lost.then(info=>{this.lost=info.message||'GPU lost';});
  const d=this.device,bytes=width*height*4,scores=width*height/64*4,make=(size,usage)=>d.createBuffer({size,usage});
  this.input=make(bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);this.output=make(bytes,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);this.scores=make(scores,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC);this.params=make(32,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);this.readPixels=make(bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);this.readScores=make(scores,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
  const module=d.createShaderModule({code:shader}),info=await module.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw Error(info.messages.map(m=>m.message).join('\n'));
  this.pipeline=await d.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});this.group=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[this.input,this.output,this.scores,this.params].map((buffer,binding)=>({binding,resource:{buffer}}))});
 }
 async run(rgba,seed,strength=36,extract=false){
  if(this.lost)throw Error(this.lost);const d=this.device,p=new ArrayBuffer(32),u=new Uint32Array(p),f=new Float32Array(p);u.set([this.width,this.height,seed,extract?1:0]);f[4]=strength;d.queue.writeBuffer(this.input,0,rgba);d.queue.writeBuffer(this.params,0,p);
  const e=d.createCommandEncoder(),pass=e.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.group);pass.dispatchWorkgroups(this.width/8,this.height/8);pass.end();const target=extract?this.readScores:this.readPixels,source=extract?this.scores:this.output;e.copyBufferToBuffer(source,0,target,0,target.size);d.queue.submit([e.finish()]);await target.mapAsync(GPUMapMode.READ);const result=extract?new Float32Array(target.getMappedRange().slice(0)):new Uint8ClampedArray(target.getMappedRange().slice(0));target.unmap();return result;
 }
 destroy(){this.device?.destroy();}
}
globalThis.GPUWatermark=GPUWatermark;
