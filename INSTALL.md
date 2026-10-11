# 安裝與執行

本專案為 Windows 本機實驗原型。建議 Node.js 20 以上，Chrome／Edge 支援 WebGPU。基本 WebRTC 不需 npm 執行期套件。

```powershell
npm start
```

開啟 http://localhost:8788/，先關閉 DeepFaceLive 與 TPM 開關，使用攝影機或合成來源。採集權限與 GPU 能力需在自己的電腦確認。

## 可選 DeepFaceLive 與 Windows TPM

準備既有 Python 3.10（例如 Conda 環境），在專案根目錄執行：

```powershell
python tools/install_deepface.py
```

安裝器下載鎖定版本的官方程式及 Rob Doe 模型，並建立 `.local/dfl-env`。需要網路與磁碟空間；依第三方授權使用。服務目前固定從這個相對目錄啟動，不能只安裝到全域 Python。

TPM 模式需要 Windows TPM 可用、Microsoft Platform Crypto Provider 及 DirectShow 攝影機 0。首次使用會在自己的 TPM 建立金鑰，並在 `.local` 登錄公鑰；沒有附上原開發機金鑰。詳細流程見 SOURCE_SIGNING.md。這是採集影像簽章模擬，尚無攝影機硬體認證、採集程式隔離或遠端 TPM 證明，亦未綁定 WebRTC 解碼像素。

## 驗證

```powershell
npm test
```

原生浮水印比較測試在尚未建立 Python 環境時會跳過。其他 GPU／攝影機／DeepFaceLive 整合測試需啟動服務、安裝 Python Playwright 並具備 Chrome；工具目前使用 Windows 標準 Chrome 安裝位置。測試工具會將部分結果寫入 `.codex/codex/tmp`，此目錄不應提交。
