# 長效針劑共同決策輔助工具 / Long-Acting Injectable SDM Tool (SDM-tool)

[中文](#中文) | [English](#english)

## 中文

協助 HIV 感染者從口服藥物考慮改用長效針劑（CAB/RPV LA）的共同決策輔助網頁，分為「個案端」問卷與「個管師端」評估儀表板，兩端透過個案編號即時同步。

個案端有中文與英文版（頁首切換，或在網址加 `?lang=en`）；個管師端只有中文版。

> 這是一份範本，臨床內容依台灣的做法撰寫，使用前請依你所在地的指引檢視修改。

### 自己架一份

clone 下來的程式**不會連到原作者的資料庫**，你需要建立自己的 Firebase 專案。

#### 1. 安裝

需要 [Node.js](https://nodejs.org/) 20.19 或 22.12 以上。

```bash
git clone https://github.com/tommy880422/SDM-tool.git
cd SDM-tool
npm install
```

#### 2. 建立 Firebase 專案

1. 到 [Firebase 主控台](https://console.firebase.google.com/) 建立新專案。
2. 左側「建構 → Firestore Database」→ 建立資料庫。
3. 「專案設定 → 一般 → 你的應用程式」→ 新增網頁應用程式（`</>` 圖示），會看到一段 `firebaseConfig`。

#### 3. 填入設定

```bash
cp .env.example .env.local
```

把 `firebaseConfig` 裡的值依序填進 `.env.local`（`apiKey` → `VITE_FIREBASE_API_KEY`，依此類推）。`.env.local` 不會被 git 追蹤。

#### 4. 部署資料庫規則（必要）

新建立的 Firestore 預設會擋掉所有讀寫，要先把本專案的 `firestore.rules` 部署上去，問卷才能儲存與讀取。

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # 選你自己的專案
firebase deploy --only firestore:rules
```

`firebase use --add` 會把你的專案設為預設；`.firebaserc` 裡原本的專案是原作者的，你沒有權限部署到那裡。

#### 5. 本機執行

```bash
npm run dev
```

打開終端機顯示的網址（通常是 http://localhost:5173）。若畫面顯示「尚未設定 Firebase」，代表 `.env.local` 沒有填好；若送出問卷時失敗，請確認第 4 步已完成。

#### 6. 部署網站（選用）

```bash
npm run build
firebase deploy --only hosting
```

### 資料安全注意事項

`firestore.rules` 目前的設計是「知道個案編號就能讀寫該筆資料」，不需要登入，只適合示範或課堂使用。若要收集真實個案資料，請先加上身分驗證（例如 Firebase Authentication），並依你的研究倫理審查（IRB）核准的資料處理方式設定。

## English

A shared decision-making web tool for people living with HIV who are considering a switch from daily oral pills to long-acting injectable cabotegravir + rilpivirine (CAB/RPV LA). It has two views: a **patient** questionnaire and a **case manager** assessment dashboard, synced in real time by a case code.

The patient view is available in Traditional Chinese and English (use the switch in the header, or add `?lang=en` to the URL). The case manager view is in Traditional Chinese only.

> This is a template. Clinical content reflects practice in Taiwan; review it against your own guidelines before use.

### Run your own copy

A cloned copy **does not connect to the original author's database**. You need your own Firebase project.

#### 1. Install

Requires [Node.js](https://nodejs.org/) 20.19 or 22.12 and later.

```bash
git clone https://github.com/tommy880422/SDM-tool.git
cd SDM-tool
npm install
```

#### 2. Create a Firebase project

1. Create a new project in the [Firebase console](https://console.firebase.google.com/).
2. In the left menu, go to **Build → Firestore Database** and create a database.
3. Go to **Project settings → General → Your apps** and add a web app (the `</>` icon). You will see a `firebaseConfig` block.

#### 3. Add your settings

```bash
cp .env.example .env.local
```

Copy each value from `firebaseConfig` into `.env.local` (`apiKey` → `VITE_FIREBASE_API_KEY`, and so on). `.env.local` is not tracked by git.

#### 4. Deploy the database rules (required)

A new Firestore database blocks all reads and writes by default. Deploy this project's `firestore.rules` so responses can be saved and loaded.

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # choose your own project
firebase deploy --only firestore:rules
```

`firebase use --add` sets your project as the default. The project listed in `.firebaserc` belongs to the original author, and you cannot deploy to it.

#### 5. Run locally

```bash
npm run dev
```

Open the URL shown in the terminal (usually http://localhost:5173). If the page says the Firebase settings are missing, check `.env.local`. If submitting fails, make sure step 4 is done.

#### 6. Deploy the website (optional)

```bash
npm run build
firebase deploy --only hosting
```

### Data security

The current `firestore.rules` lets anyone who knows a case code read and write that case's data, with no login. This is suitable only for demos or teaching. Before collecting real patient data, add authentication (for example Firebase Authentication) and follow the data handling approved by your research ethics committee (IRB).

## 授權 / License

[MIT License](LICENSE)
