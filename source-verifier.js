const crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function verifyEnvelope(envelope,session,jwk,previous={sequence:0,hash:''},now=Date.now()){
 const bytes=Buffer.from(envelope.payload,'base64'),signature=Buffer.from(envelope.signature,'base64');
 if(!crypto.verify('sha256',bytes,crypto.createPublicKey({key:jwk,format:'jwk'}),signature))throw Error('來源簽章無效');
 const m=JSON.parse(bytes);
 if(m.schema!==1||m.session!==session.id||m.challenge!==session.challenge||m.seed!==session.seed||m.strength!==session.strength)throw Error('工作階段或挑戰不符');
 if(now>session.expires||Math.abs(now-m.timestamp)>10000)throw Error('來源證據過期');
 if(m.sequence!==previous.sequence+1||m.previous!==previous.hash)throw Error('來源序號／摘要鏈不符（可能重播或遺失）');
 if(m.width!==640||m.height!==480||m.cameraIndex!==0||m.capture!=='native-directshow'||m.watermark!=='native-dct-v1'||m.keyProvider!=='Microsoft Platform Crypto Provider')throw Error('來源設定不符');
 const image=Buffer.from(envelope.image,'base64');
 if(image.length>2000000||hash(image)!==m.imageSha256)throw Error('來源影像摘要不符');
 return {manifest:m,image,checkpoint:{sequence:m.sequence,hash:hash(bytes)}};
}
module.exports={verifyEnvelope,hash};
