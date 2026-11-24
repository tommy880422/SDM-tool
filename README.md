# 長效針劑共同決策輔助工具（SDM-tool）

協助 HIV 感染者從口服藥物考慮改用長效針劑（CAB/RPV LA）的共同決策輔助網頁，分為「個案端」問卷與「個管師端」評估儀表板，兩端透過個案編號即時同步。

## 自己架一份

clone 下來的程式**不會連到原作者的資料庫**，你需要建立自己的 Firebase 專案。

### 1. 安裝

需要 [Node.js](https://nodejs.org/) 20.19 或 22.12 以上。

```bash
git clone https://github.com/tommy880422/SDM-tool.git
cd SDM-tool
npm install
```

### 2. 建立 Firebase 專案

1. 到 [Firebase 主控台](https://console.firebase.google.com/) 建立新專案。
2. 左側「建構 → Firestore Database」→ 建立資料庫。
3. 「專案設定 → 一般 → 你的應用程式」→ 新增網頁應用程式（`</>` 圖示），會看到一段 `firebaseConfig`。

### 3. 填入設定

```bash
cp .env.example .env.local
```

把 `firebaseConfig` 裡的值依序填進 `.env.local`（`apiKey` → `VITE_FIREBASE_API_KEY`，依此類推）。`.env.local` 不會被 git 追蹤。

### 4. 本機執行

```bash
npm run dev
```

打開終端機顯示的網址（通常是 http://localhost:5173）。若畫面顯示「尚未設定 Firebase」，代表 `.env.local` 沒有填好。

### 5. 部署資料庫規則與網站（選用）

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # 選你自己的專案
npm run build
firebase deploy
```

`firebase use --add` 會把你的專案設為預設；`.firebaserc` 裡原本的專案是原作者的，你沒有權限部署到那裡。

## 資料安全注意事項

`firestore.rules` 目前的設計是「知道個案編號就能讀寫該筆資料」，不需要登入，只適合示範或課堂使用。若要收集真實個案資料，請先加上身分驗證（例如 Firebase Authentication），並依你的研究倫理審查（IRB）核准的資料處理方式設定。

## 授權

[MIT License](LICENSE)
