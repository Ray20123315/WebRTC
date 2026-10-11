"""Use official DeepFaceLive detection, landmark, DFM, and CPU merge code."""
import collections,collections.abc,sys,time
from pathlib import Path
from types import SimpleNamespace
import numpy as np
import cv2
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'.local/DeepFaceLive'
collections.Iterable=collections.abc.Iterable
sys.path.insert(0,str(SOURCE))
from modelhub.onnx import YoloV5Face,FaceMesh
from modelhub.DFLive.DFMModel import DFMModel
from xlib.onnxruntime import get_available_devices_info
from xlib.face import FRect,FLandmarks2D,ELandmarks2D
from apps.DeepFaceLive.backend.FaceMerger import FaceMergerWorker

class Engine:
 def __init__(self,cpu=False):
  devices=get_available_devices_info();self.device=next((d for d in devices if 'NVIDIA' in str(d)),devices[-1]) if not cpu else devices[-1]
  self.detector=YoloV5Face(self.device);self.marker=FaceMesh(self.device)
  self.model=DFMModel(ROOT/'.local/dfl-userdata/dfm_models/Rob_Doe.dfm',self.device)
  self.resolution=self.model.get_input_res()[0]
  self.state=SimpleNamespace(interpolation='bilinear',face_mask_source=True,face_mask_celeb=True,face_mask_lmrks=False,face_mask_erode=5,face_mask_blur=15,color_transfer='rct',face_opacity=1.0,color_compression=0)
  self.merger=object.__new__(FaceMergerWorker);self.merger.get_state=lambda:self.state
 def swap(self,frame):
  start=time.perf_counter();h,w=frame.shape[:2]
  faces=self.detector.extract(frame,threshold=.5,fixed_window=640)[0]
  if not faces:return frame,{'swapped':False,'reason':'no_face','ms':(time.perf_counter()-start)*1000}
  l,t,r,b=max(faces,key=lambda r:(r[2]-r[0])*(r[3]-r[1]))
  rect=FRect.from_ltrb([l/w,t/h,r/w,b/h]);cut,mat=rect.cut(frame,1.4,192)
  points=self.marker.extract(cut)[0,:,:2]/[192,192]
  landmarks=FLandmarks2D.create(ELandmarks2D.L468,points).transform(mat,invert=True)
  aligned,alignment=landmarks.cut(frame,2.2,self.resolution,exclude_moving_parts=True,y_offset=-.08)
  swapped,mask,source_mask=self.model.convert(aligned)
  transform=alignment.invert().to_exact_mat(self.resolution,self.resolution,w,h)
  merged=self.merger._merge_on_cpu(frame,self.resolution,aligned,source_mask[0],None,swapped[0],mask[0],transform,w,h,False)
  output=np.uint8(np.clip(np.round(merged*255),0,255))
  return output,{'swapped':True,'face_rect':[float(l),float(t),float(r),float(b)],'ms':(time.perf_counter()-start)*1000,'device':str(self.device)}
