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

const firebaseConfig = {
  apiKey: "AIzaSyD9IntcPfSGUFY7IVZQ1BsQ78Go885TdRE",
  authDomain: "sdm-tool-14dd1.firebaseapp.com",
  projectId: "sdm-tool-14dd1",
  storageBucket: "sdm-tool-14dd1.firebasestorage.app",
  messagingSenderId: "440292486617",
  appId: "1:440292486617:web:9dc49c24f72f86ab6abdc8",
  measurementId: "G-GKKBKH6BKR",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

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
