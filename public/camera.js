'use strict';
globalThis.CameraInput={
 message(error){const messages={NotReadableError:'攝影機無法啟動：可能被 DeepFaceLive GUI、相機、Teams 或 OBS 占用，或驅動無法開啟。請停止其他程式的攝影機輸入，再選擇實體攝影機重試。',NotAllowedError:'攝影機權限被拒絕：請允許此網站使用攝影機，並確認 Windows 隱私設定允許桌面應用程式存取。',NotFoundError:'找不到攝影機：請確認裝置已連接，並更新装置清單。',OverconstrainedError:'所選攝影機或影像條件不可用：請更新裝置並重新選擇。'};return messages[error.name]||error.message;},
 async open(media,deviceId,width,height,fps,isCurrent=()=>true){
  const selected=deviceId?{deviceId:{exact:deviceId}}:{};
  try{return await media.getUserMedia({video:{...selected,width:{ideal:width},height:{ideal:height},frameRate:{ideal:fps}},audio:false});}
  catch(error){
   if(!['NotReadableError','OverconstrainedError'].includes(error.name)||!isCurrent())throw error;
   await new Promise(resolve=>setTimeout(resolve,500));
   if(!isCurrent())throw Error('已停止');
   return media.getUserMedia({video:deviceId?selected:true,audio:false});
  }
 }
};
