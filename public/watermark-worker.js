importScripts('watermark.js','gpu.js');
let gpu,canvas,ctx;
self.onmessage=async({data:m})=>{try{
 if(m.type==='init'){gpu=new GPUWatermark();await gpu.init(m.width,m.height);canvas=new OffscreenCanvas(m.width,m.height);ctx=canvas.getContext('2d',{willReadFrequently:true});postMessage({id:m.id,ready:true});return;}
 const start=performance.now();ctx.drawImage(m.bitmap,0,0,canvas.width,canvas.height);m.bitmap.close();const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),result=await gpu.run(pixels.data,m.seed,m.strength,m.extract);
 if(m.extract)postMessage({id:m.id,scores:Watermark.summarize(result,canvas.width,canvas.height,m.roi),ms:performance.now()-start});
 else{ctx.putImageData(new ImageData(result,canvas.width,canvas.height),0,0);const bitmap=canvas.transferToImageBitmap();postMessage({id:m.id,bitmap,ms:performance.now()-start},[bitmap]);}
}catch(e){m.bitmap?.close();postMessage({id:m.id,error:e.message});}};
