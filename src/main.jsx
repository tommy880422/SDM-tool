import React from "react";
import ReactDOM from "react-dom/client";
import SDMTool from "./sdm_lai_tool.jsx";
import { firebaseConfigured, missingFirebaseKeys } from "./firebaseClient";

// 尚未設定 Firebase 時，顯示設定說明而不是壞掉的畫面。
function SetupNotice() {
  const box = { maxWidth: 640, margin: "48px auto", padding: "24px 28px", fontFamily: "system-ui, sans-serif", lineHeight: 1.7, color: "#2b2b2b", background: "#fbf3e4", borderRadius: 12 };
  const code = { fontFamily: "ui-monospace, monospace", background: "#fff", padding: "1px 6px", borderRadius: 4 };
  return (
    <div style={box}>
      <h2 style={{ marginTop: 0 }}>尚未設定 Firebase</h2>
      <p>這個工具需要連到你自己的 Firebase 專案才能儲存問卷。</p>
      <ol>
        <li>把 <span style={code}>.env.example</span> 複製成 <span style={code}>.env.local</span>。</li>
        <li>填入你 Firebase 專案的網頁應用程式設定（Firebase 主控台 → 專案設定 → 一般 → 你的應用程式）。</li>
        <li>重新執行 <span style={code}>npm run dev</span>。</li>
      </ol>
      <hr style={{ border: 0, borderTop: "1px solid #e6d9bf", margin: "20px 0" }} />
      <h2 lang="en">Firebase is not set up yet</h2>
      <p lang="en">This tool needs your own Firebase project to save responses.</p>
      <ol lang="en">
        <li>Copy <span style={code}>.env.example</span> to <span style={code}>.env.local</span>.</li>
        <li>Fill in your Firebase web app settings (Firebase console → Project settings → General → Your apps).</li>
        <li>Run <span style={code}>npm run dev</span> again.</li>
      </ol>
      <p>缺少的設定 / Missing settings：{missingFirebaseKeys.map((k) => <span key={k} style={{ ...code, marginRight: 6 }}>{k}</span>)}</p>
      <p>完整步驟見 README.md／Full steps: README.en.md</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {firebaseConfigured ? <SDMTool /> : <SetupNotice />}
  </React.StrictMode>
);
