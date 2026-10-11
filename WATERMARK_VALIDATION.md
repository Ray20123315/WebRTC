# WebRTC 浮水印驗收報告

日期：2026-10-03（Asia/Taipei）。Canonical 架構為 [README.md](README.md)。以下是本機實驗結果，不能推廣為任意人臉、網路或攻擊的防偽準確率。

## 已完成

- Node 五項測試通過：HTTP、退役 API、同 origin 防護、異常 signaling、DCT rounding、錯誤 seed、局部篡改、缺校準與通道劣化。
- 真正 Chrome WebRTC 編解碼，getStats 確認 RTP codec 與 640×480；雙分頁房間、peer 離線停止通過。
- GPU WGSL 與 CPU reference 比對；停止／重新開始、DeepFaceLive 開關、相機權限未完成時停止的資源釋放有瀏覽器測試。
- DeepFaceLive 官方 commit `fc7b787bda2b8c186e142c52857458eea3a935ed` 已安裝到隔離環境；Python3.10、DirectML、實際 detector/FaceMesh/DFM/FaceMerger 執行通過。
- 官方 `Rob_Doe.dfm`：SHA-256 `b924d96ec5ce15ea984cb7466dbcfd2da71d80d234621422f54de2fd482385fa`。DeepFaceLive 桌面 GUI 已開啟，使用 computer-use 視覺確認控制面板；最後啟動沒有 stderr 錯誤。
- Python3.10/3.12 兩個環境的 pip check 通過；JavaScript 語法與 tools Python 編譯通過。

## 真正 DeepFaceLive 換臉 → WebRTC

來源：官方合成角色 Irina Arty 測試圖，置於 640×480 畫面。模型換成 Rob Doe。ROI `x=.375,y=.25,w=.25,h=.5`，VP8 上限2 Mbps、強度36。

|測試|臉部 bit agreement|背景 bit agreement|結果|
|---|---|---|---|
|正常來源、未換臉|100.00%|100.00%|watermark_intact|
|嵌入後，由真正 DeepFaceLive 換臉|67.33%|99.98%|suspected_tamper|
|先換臉，才嵌入浮水印|100.00%|100.00%|watermark_intact（已知信任邊界）|

以上區域分數為各次驗收最後一張可用樣本，不是長時間準確率。基準採30樣本；正式 JSON 保存暖機及通道劣化樣本，沒有刪除失敗數據。after/before 各實際處理15張換臉影格；接收端低頻取樣，最後一張可能對應第13或14張。

正常浮水印來源約 29.99 FPS；換臉後整條回路約 11.45 FPS。換臉推論及合併 p95 54.2 ms，浮水印嵌入／提取 p95 11.5/8.5 ms。這些不包含攝影機→螢幕的總端到端延遲；沒有宣稱攻擊回路達到30FPS。

實測視覺：

![正常來源](validation/screenshots/deepface-normal.png)
![浮水印後換臉，接收端偵測區域篡改](validation/screenshots/deepface-swapped.png)
![浮水印前換臉，完整性仍通過](validation/screenshots/deepface-before-watermark.png)

## Codec / 壓縮與效能

固定640×480、目標30FPS、強度36，來源為有動態區塊的合成畫面。bitrate 是 sender 上限，不是網路頻寬塑形；本機網路，未加入封包遺失或 jitter。

|實際 Codec|上限 kbps|最後臉部分數|最後背景分數|發送 FPS|嵌入/提取 p95 ms|狀態|
|---|---:|---:|---:|---:|---:|---|
|VP8|2000|100.00%|100.00%|29.98|8.5 / 8.1|watermark_intact|
|H264|2000|100.00%|100.00%|29.92|8.3 / 7.4|watermark_intact|
|VP9|2000|100.00%|100.00%|29.92|10.5 / 10.9|watermark_intact|
|H264|300|69.97%|68.70%|29.92|8.6 / 7.4|uncalibrated|
|VP8|100|100.00%|99.95%|30.00|8.4 / 8.0|watermark_intact|

H264 300kbps 正常通道無法通過校準，屬本次實測限制；不以降低防禦門檻換取通過。正常2Mbps三種codec約30FPS且GPU p95小於11ms，符合浮水印單階段<30ms目標。浮水印不保證在任意強壓縮、縮放或裁切下成立。

## 證據與重現

- [DeepFaceLive 結果 JSON](validation/results/deepface-browser-validation.json)：基準、每樣本分數、實際換臉計數與暖機。
- [Codec / 房間 JSON](validation/results/codec-room-validation.json)：RTP mimeType、尺寸、framesEncoded、bytesSent 與 peer 離線驗收。
- [瀏覽器回歸 JSON](validation/results/browser-validation.json)：GPU/CPU reference、合成破壞、重新啟動、開關與延遲相機釋放。
- [安裝追溯](validation/results/installation.json)：官方 commit、下載檔 Hash、模型大小與已驗證狀態。Hash 是本次下載追溯，不是官方簽章。
- [程式／產物 Hash](validation/results/artifact-hashes.json)：以 SHA-256 對照交付內容。
- 失敗及早期測試 log 留在 `.codex/codex/tmp/watermark/`，未包含於交接包。主要測試命令見 README。

## 未完成與適用範圍

- 未驗收真實攝影機連續換臉、GUI→OBS→Virtual Camera 完整橋接、跨NAT/TURN、弱網、長時間負載及多使用者。
- 目前是單一官方合成角色與DFM模型；沒有代表性資料、ROC、誤報／漏報率或其他Deepfake模型的泛化驗證。
- 沒有可信攝影機認證、cryptographic PRF、簽章、時序challenge、防重播、移動人臉ROI自動追蹤、縮放同步、FEC或WASM fallback。
- 本機 Node 與推論服務沒有帳號認證，預設只綁loopback。現版可重現架構可行性；正式安全系統仍須完成 README 的信任來源與生產驗收。

下一個正式驗收應先建立可信採集邊界，再對實際攝影機／網路／不同人臉與模型做量測，不能只由本次受控測試宣稱所有AI換臉皆可排除。
# 啟動故障修復驗證（2026-10-03）

新增來源簽章：`validation/results/source-signing.json` 實測Integrated Camera、Windows TPM、原生DCT及Chrome WebRTC。正常完整性100%，約6.8FPS，原生嵌入p95約16.7ms；停止使session失效，before-watermark被拒絕。Node9/9涵蓋修改影像／簽章／金鑰、重播、錯誤挑戰、期限與鏈結，以及原生CPU/JS誤差≤1byte；HTTP原點／Host拒絕與原瀏覽器及DeepFaceLive流程回歸通過。最新DeepFaceLive回歸重新產生啟動修復結果；原始三codec與首次模型驗收保留。完整信任限制Canonical：`SOURCE_SIGNING.md`，其中FIDO、硬體來源認證、受保護程式隔離及解碼影格密碼學綁定仍未實作。

新增證據 `validation/results/deepface-start-fix.json`：8788 第一張影像推論回傳 500 並停止，health 卻誤報 ready。原例外內容空白，底層原因未知；重啟後恢復。

修正版 Chrome／DirectML 實際官方圖正常校準、after-watermark 疑似區域篡改、before-watermark 浮水印完整均通過。注入503驗證錯誤持續顯示且可重新操作；health確認模型暖機成功。Node5/5與JS/Python語法通過。使用者攝影機及真實GPU故障自動復原仍待驗證。原 hash／效能證據僅對應原驗收版本。
