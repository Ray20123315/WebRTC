🏗️ WebRTC 浮水印防禦的核心架構
整個機制分為兩個端點：
1. 發送端（Camera 採集）： 取得攝影機明文影格 \(\rightarrow \) 利用演算法修改像素值嵌入浮水印 \(\rightarrow \) WebRTC 編碼（H.264/H.265/VP9） \(\rightarrow \) 傳輸。
2. 接收端（解碼渲染）： 收到 RTP 封包 \(\rightarrow \) 解碼得到影格 \(\rightarrow \) 利用演算法提取並檢測浮水印完整性 \(\rightarrow \) 判定是否遭 Deepfake。

發送端：如何在 Camera 端嵌入隱形浮水印？
在瀏覽器或 App 中，最理想的嵌入點是在「影音採集後、編碼壓縮前」。目前網頁端最主流且符合標準的實作技術是利用 WebRTC Insertable Streams (WebRTC 插入式串流，又稱 Encoded Transform) 或傳統的 Canvas 處理。
實作路徑 A：使用 W3C 標準 Insertable Streams (推薦，效能最佳)
這個 API 允許我們在 WebRTC 的媒體軌道（MediaStreamTrack）上直接對未編碼的原始影格（VideoFrame）進行像素級操作。
1. 攔截 Camera 串流：
透過 MediaDevices.getUserMedia() 取得攝影機訊號後，利用 MediaStreamTrackProcessor 將其轉化為一個可讀流（ReadableStream）。
2. 空間域（Spatial Domain）或頻域（Frequency Domain）嵌入：
利用 WebWorker 異步處理每一個影格。最常應用的演算法是 LSB（最低有效位元法） 的進階變體，或是 DCT（離散餘弦變換）：
	• DCT 頻域法（抗壓縮，但防 Deepfake）： 將畫面切成 \(8 \times 8\) 的方塊，進行 DCT 轉換。將一個特定的密碼學金鑰（例如一組偽隨機序列）微幅加到中頻係數中，再進行 IDCT 逆轉換回像素。這個改變極其微小，肉眼完全無法察覺，且能抵抗 WebRTC 的 H.264 正常影像壓縮。
3. 封包發送：
將處理完、帶有浮水印的 VideoFrame 透過 MediaStreamTrackGenerator 餵回 WebRTC 控制器進行編碼發送。

💥 為什麼 DeepFaceLive 換臉會破壞浮水印？
這牽涉到生成式 AI 的運作原理。當駭客使用 DeepFaceLive 進行即時換臉時，軟體會經歷以下步驟：
1. 人臉偵測與裁切（Detection & Alignment）： 找出畫面的臉部並將其切成獨立小圖（例如 \(512 \times 512\)）。
2. 神經網路重建（Autoencoder/GAN Generation）： AI（例如 DFLE 權重模型）會將這張臉解構成高維度的數學特徵，然後重新生成、繪製一張假高層的臉。
3. 混合貼回（Blending）： 將 AI 生成的假臉，透過邊緣模糊（Feathering）與色彩平衡重新貼回原背景。
關鍵在於第 2 步與第 3 步：
AI 神經網路在「重新繪製」人臉像素時，它只關注巨觀的五官輪廓、膚色和陰影，它絕對無法理解、也無法複製原本隱藏在像素微觀頻域（或 LSB）中的高頻隨機浮水印訊號。
此外，在假臉與原背景貼合的邊界處，原本連續的浮水印特徵會因為像素被覆蓋而直接出現斷裂與邊緣扭曲。
🔍 接收端：如何檢測浮水印完整性？
當接收端（例如面試官的瀏覽器）收到 WebRTC 畫面時，採用完全對稱的逆向操作：
1. 解碼影格攔截： 同樣利用 Insertable Streams，在 WebRTC 解碼（Decode）出原始影格、準備渲染到螢幕前攔截它。
2. 浮水印提取與相關性比對（Correlation Test）：
將接收到的影格再次進行 DCT 轉換，提取出中頻區域的訊號，並與原本發送端約定好的「安全金鑰（Security Key）」序列進行互相關（Cross-correlation）計算。
3. 完整性判定：
	• 正常通訊（未被換臉）： 即使經過 H.264 壓縮，提取出來的訊號與原金鑰相關性依然極高（例如相似度 \(> 85\%\)），判定為真。
	• 遭到 Deepfake 攻擊： AI 重新繪製的人臉區域，提取出來的浮水印相似度會雪崩式下跌（甚至歸零）。系統偵測到畫面核心區域的浮水印不完整或消失，即可在毫秒內自動觸發警報，判定畫面已被篡改。
💡 落地實務的 2 個痛點與解決方案
如果您要在生產環境中寫這套系統，必須解決以下兩個實際技術挑戰：
1. WebRTC 編碼壓縮（Compression）的干擾：
WebRTC 為了省頻寬，會使用有損壓縮（Lossy Compression）。如果浮水印選用最簡單的 LSB（最低有效位元法），壓縮時這些微小雜訊會直接被 H.264 抹除，導致誤報。
	• 解法： 必須使用「具強健性的感知浮水印（Robust Perceptual Watermarking）」，將浮水印藏在人類肉眼不敏感、但壓縮演算法會保留的「低頻至中頻係數」中。
2. 效能與延遲考量：
用 JavaScript 逐影格做 DCT 矩陣運算會讓 CPU 爆炸，導致 WebRTC 嚴重延遲。
	• 解法： 嵌入與提取的演算法核心（如矩陣運算）必須用 C++/Rust 撰寫，並編譯成 WebAssembly (WASM) 讓瀏覽器調用，或直接利用 WebGPU 交由顯示卡平行加速，才能在 30 FPS 的即時通訊中維持小於 30ms 的處理延遲。
如果您想進一步評估或動手實作，我們可以聊聊：
• 您打算在 網頁瀏覽器（JavaScript） 還是 行動端 App（C++ / iOS / Android SDK） 上實作這個浮水印管線？
• 您需要更深入了解 DCT（離散餘弦變換） 浮水印演算法在影像矩陣中的具體寫入公式嗎？
