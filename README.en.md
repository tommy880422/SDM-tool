# Long-Acting Injectable Shared Decision-Making Tool (SDM-tool)

[中文](README.md) | **English**

A shared decision-making web tool for people living with HIV who are considering a switch from daily oral pills to long-acting injectable cabotegravir + rilpivirine (CAB/RPV LA). It has two views: a **patient** questionnaire and a **case manager** assessment dashboard, synced in real time by a case code.

The patient view is available in Traditional Chinese and English (use the switch in the header, or add `?lang=en` to the URL). The case manager view is in Traditional Chinese only.

> This is a template. Clinical content reflects practice in Taiwan; review it against your own guidelines before use.

## Run your own copy

A cloned copy **does not connect to the original author's database**. You need your own Firebase project.

### 1. Install

Requires [Node.js](https://nodejs.org/) 20.19 or 22.12 and later.

```bash
git clone https://github.com/tommy880422/SDM-tool.git
cd SDM-tool
npm install
```

### 2. Create a Firebase project

1. Create a new project in the [Firebase console](https://console.firebase.google.com/).
2. In the left menu, go to **Build → Firestore Database** and create a database.
3. Go to **Project settings → General → Your apps** and add a web app (the `</>` icon). You will see a `firebaseConfig` block.

### 3. Add your settings

```bash
cp .env.example .env.local
```

Copy each value from `firebaseConfig` into `.env.local` (`apiKey` → `VITE_FIREBASE_API_KEY`, and so on). `.env.local` is not tracked by git.

### 4. Run locally

```bash
npm run dev
```

Open the URL shown in the terminal (usually http://localhost:5173). If the page says the Firebase settings are missing, check `.env.local`.

### 5. Deploy the database rules and website (optional)

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # choose your own project
npm run build
firebase deploy
```

`firebase use --add` sets your project as the default. The project listed in `.firebaserc` belongs to the original author, and you cannot deploy to it.

## Data security

The current `firestore.rules` lets anyone who knows a case code read and write that case's data, with no login. This is suitable only for demos or teaching. Before collecting real patient data, add authentication (for example Firebase Authentication) and follow the data handling approved by your research ethics committee (IRB).

## License

[MIT License](LICENSE)
