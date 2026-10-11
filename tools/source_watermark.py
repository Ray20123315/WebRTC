"""Vectorized CPU reference matching public/watermark.js; BGR uint8 input/output."""
import numpy as np
def embed(frame,seed,strength):
 h,w=frame.shape[:2];rgb=frame[:,:,::-1].astype(np.float64)
 y,x=np.mgrid[:8,:8]
 a=.25*np.cos((2*x+1)*2*np.pi/16)*np.cos((2*y+1)*np.pi/16)
 b=.25*np.cos((2*x+1)*np.pi/16)*np.cos((2*y+1)*2*np.pi/16)
 basis=a-b
 blocks=rgb.reshape(h//8,8,w//8,8,3).transpose(0,2,1,3,4)
 luma=blocks@np.array([.299,.587,.114]);coeff=np.sum(luma*basis,axis=(-2,-1))
 i=np.arange(h//8*w//8,dtype=np.uint32)+np.uint32(1)
 with np.errstate(over='ignore'):
  k=np.uint32(seed)^(i*np.uint32(0x9e3779b9));k^=k>>16;k*=np.uint32(0x7feb352d);k^=k>>15
 signs=np.where(k&1,1.,-1.).reshape(h//8,w//8)
 delta=np.maximum(0,strength-signs*coeff)*signs/2
 result=np.rint(np.clip(blocks+delta[:,:,None,None,None]*basis[None,None,:,:,None],0,255)).astype(np.uint8)
 return result.transpose(0,2,1,3,4).reshape(h,w,3)[:,:,::-1].copy()
