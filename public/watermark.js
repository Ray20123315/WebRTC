(function(root){
 const W=640,H=480;
 const basis=(u,v,x,y)=>.25*Math.cos((2*x+1)*u*Math.PI/16)*Math.cos((2*y+1)*v*Math.PI/16);
 function sign(seed,i){let x=(seed^Math.imul(i+1,0x9e3779b9))>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;return x&1?1:-1;}
 function coefficients(data,width,bx,by){let a=0,b=0;for(let y=0;y<8;y++)for(let x=0;x<8;x++){const p=4*((by*8+y)*width+bx*8+x),l=.299*data[p]+.587*data[p+1]+.114*data[p+2];a+=l*basis(2,1,x,y);b+=l*basis(1,2,x,y);}return[a,b];}
 function embed(data,width,height,seed,strength=36){const out=new Uint8ClampedArray(data);for(let by=0;by<height/8;by++)for(let bx=0;bx<width/8;bx++){const[a,b]=coefficients(data,width,bx,by),s=sign(seed,by*(width/8)+bx),delta=Math.max(0,strength-s*(a-b))*s/2;for(let y=0;y<8;y++)for(let x=0;x<8;x++){const p=4*((by*8+y)*width+bx*8+x),d=delta*(basis(2,1,x,y)-basis(1,2,x,y));for(let c=0;c<3;c++)out[p+c]+=d;}}return out;}
 function extract(data,width,height,seed){const out=[];for(let by=0;by<height/8;by++)for(let bx=0;bx<width/8;bx++){const[a,b]=coefficients(data,width,bx,by);out.push(sign(seed,by*(width/8)+bx)*(a-b));}return out;}
 function summarize(values,width=W,height=H,roi={x:.3,y:.2,w:.4,h:.6}){let f=0,nf=0,b=0,nb=0;values.forEach((v,i)=>{const x=(i%(width/8)+.5)*8/width,y=(Math.floor(i/(width/8))+.5)*8/height;if(x>=roi.x&&x<roi.x+roi.w&&y>=roi.y&&y<roi.y+roi.h){f+=v>0;nf++;}else{b+=v>0;nb++;}});return{face:nf?f/nf:null,background:nb?b/nb:null,faceBlocks:nf,backgroundBlocks:nb};}
 function decide(s,b){if(!b||b.face<.8||b.background<.8)return'uncalibrated';if(s.face===null||s.background===null)return'unavailable';if(s.background<Math.max(.75,b.background-.12))return'channel_degraded';if(s.face<Math.max(.70,b.face-.18))return'suspected_tamper';return'watermark_intact';}
 const api={W,H,basis,sign,embed,extract,summarize,decide};if(typeof module!=='undefined')module.exports=api;else root.Watermark=api;
})(globalThis);
