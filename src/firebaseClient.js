// ─────────────────────────────────────────────────────────────
// Firebase 連線設定 + 病人 / 個管師資料存取輔助函式
// ─────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

// Firebase 設定從環境變數讀取（Vite 只會讀 VITE_ 開頭的變數）。
// 把 .env.example 複製成 .env.local，填入你自己 Firebase 專案的值；設定方式見 README。
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// 少了這三項就無法連到 Firestore；main.jsx 會改顯示設定說明。
const REQUIRED_KEYS = ["apiKey", "projectId", "appId"];
export const missingFirebaseKeys = REQUIRED_KEYS.filter((k) => !firebaseConfig[k]);
export const firebaseConfigured = missingFirebaseKeys.length === 0;

export const db = firebaseConfigured ? getFirestore(initializeApp(firebaseConfig)) : null;

/* ── caseId 產生器（6 碼，去掉容易混淆的 0/O/1/I/L） ───────── */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function makeCaseId() {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (i === 2) s += "-";
  }
  return s;
}

export async function submitPatientResponse(caseId, patientData) {
  const payload = { ...patientData, submittedAt: serverTimestamp() };
  await setDoc(doc(db, "patient_submissions", caseId), payload);
}

export async function getPatientByCaseId(caseId) {
  const snap = await getDoc(doc(db, "patient_submissions", caseId));
  return snap.exists() ? snap.data() : null;
}

export function listenPatientByCaseId(caseId, onData, onError) {
  return onSnapshot(
    doc(db, "patient_submissions", caseId),
    (snap) => onData(snap.exists() ? snap.data() : null),
    (err) => onError && onError(err)
  );
}

export async function saveManagerAssessment(caseId, managerData) {
  const payload = { ...managerData, updatedAt: serverTimestamp() };
  await setDoc(doc(db, "manager_assessments", caseId), payload, { merge: true });
}

export async function getManagerAssessment(caseId) {
  const snap = await getDoc(doc(db, "manager_assessments", caseId));
  return snap.exists() ? snap.data() : null;
}
