import { useState, useEffect } from 'react';
import {
  makeCaseId,
  submitPatientResponse,
  listenPatientByCaseId,
  getPatientByCaseId,
  saveManagerAssessment,
  getManagerAssessment,
} from './firebaseClient';

/* ─────────────────────────────────────────────────────────────
   長效針劑共同決策輔助工具（SDM）
   個案端（溫和語氣・互動比較）× 個管師端（臨床精準・送審）
   風險與療效數字依 ATLAS / FLAIR / ATLAS-2M 試驗
   ───────────────────────────────────────────────────────────── */

/* 衛教影片：內嵌 YouTube；若該影片被設為不允許嵌入，下方備援連結會在新分頁開啟。 */
const VIDEO_ID = "fNOU5JoaFjA";
const PLAYLIST_ID = "PL-ZI3-lFRjhCZ1m-_YMJ_ZxXJ3zMsCbXz";
const VIDEO_WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}&list=${PLAYLIST_ID}`;
const VIDEO_EMBED_URL = `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?list=${PLAYLIST_ID}&rel=0&modestbranding=1`;

/* ── 對照表 ─────────────────────────────────────────────── */
const FREQ = { "0": "無漏服紀錄", "1-3": "每月約 1–3 次漏服", "4-7": "每月約 4–7 次漏服", "8+": "每月 8 次以上漏服" };
const FREQ_OPTS = [
  { key: "0", label: "幾乎沒漏" }, { key: "1-3", label: "1–3 次／月" },
  { key: "4-7", label: "4–7 次／月" }, { key: "8+", label: "8 次以上／月" },
];
const REASONS = {
  busy: "太忙、太累或分心而忘記", travel: "出差、旅遊或臨時外出", shift: "輪班或作息不固定",
  sefx: "藥物副作用不適", mood: "情緒低落、缺乏動力", seen: "不想被他人看到服藥",
  away: "藥不在身邊、忘記帶",
};
const LIFE = { travel: "旅遊與外出", intimacy: "親密關係", routine: "日常作息", work: "工作排班" };
const PREF_DIMS = [
  { key: "p1", label: "不必每天記得吃藥", low: "不重要", high: "非常重要" },
  { key: "p2", label: "在意隱私(家裡不放藥、不被看到)", low: "不在意", high: "非常在意" },
  { key: "p3", label: "想擺脫每天服藥的束縛", low: "不重要", high: "非常重要" },
  { key: "p4", label: "願意每 2 個月回診注射", low: "不太願意", high: "非常願意" },
  { key: "p5", label: "行程／旅行的彈性", low: "不重要", high: "非常重要" },
  { key: "p6", label: "對副作用（打針處痠痛、腫脹、發燒等）的容忍度", low: "完全不能忍", high: "完全能接受" },
  { key: "p7", label: "想減少「每天提醒自己生病」的感受", low: "不重要", high: "非常重要" },
];
const PREF_NAME = {
  p1: "不需每天服藥", p2: "隱私維護", p3: "想擺脫每天服藥的束縛", p4: "配合每 2 個月回診",
  p5: "行程與旅行彈性", p6: "對副作用（含痠痛）的容忍", p7: "減少疾病身分的心理提醒",
};
/* 偏好高分（≥4）→ 送審摘要中具體臨床敘述 */
const PREF_JUSTIFY = {
  p1: "免除每日記憶服藥之心理負擔",
  p2: "移除家中藥物存放與服藥動作以維護隱私",
  p3: "擺脫每日服藥對生活節奏之束縛感",
  p4: "願意配合每 2 個月回診之針劑療程規律",
  p5: "重視日常行程與旅行之彈性",
  p6: "願意承受針劑相關不適以換取每日服藥自由",
  p7: "降低每日面對疾病身分之心理提醒",
};
/* 漏服頻率 → 順從性臨床分級 */
const FREQ_SEV_TEXT = {
  "0": "，遵從性良好",
  "1-3": "，屬遵從性偶發不佳",
  "4-7": "，屬遵從性中度不佳",
  "8+": "，屬遵從性明顯不佳",
};
/* 偏好方向：+1 偏向針劑、-1 偏向口服 */
const PREF_DIR = { p1: 1, p2: 1, p3: 1, p4: 1, p5: -1, p6: 1, p7: 1 };

const CDC_ITEMS = [
  { key: "ck_adult", label: "18 歲以上成人" },
  { key: "ck_vl", label: "近 6 個月內 HIV 病毒量 < 50 copies/mL" },
  { key: "ck_oral", label: "每日口服藥物有困難（已說明理由）" },
  { key: "ck_q2m", label: "同意配合每 2 個月回診注射" },
  { key: "ck_hbv", label: "未感染 B 型肝炎病毒" },
  { key: "ck_resist", label: "過去無病毒抑制失敗、未對 CAB 或 RPV 具有已知或疑似抗藥性" },
  { key: "ck_drug", label: "未使用與 CAB／RPV 有明顯交互作用之藥物" },
  { key: "ck_preg", label: "女性未懷孕、無備孕計畫" },
  { key: "ck_ltbi", label: "潛伏結核感染（LTBI）檢驗為陰性，或已完成 TB/LTBI 治療" },
];

/* ── 檢驗值 → 適用條件自動判定（避免勾選與檢驗數據互相衝突） ──── */
const monthsSince = (d) => {
  const t = Date.parse(d);
  return isFinite(t) ? (Date.now() - t) / 2629746000 : null;
};
/* 回傳 { ck_key: { pass, why } }；有回傳者代表可由檢驗值直接判定，UI 應鎖定該勾選 */
function deriveChecks(m) {
  const r = {};
  if (m.vl === "否") {
    r.ck_vl = { pass: false, why: "HIV 病毒量未達 < 50 copies/mL" };
  } else if (m.vl === "是") {
    const mo = monthsSince(m.vlDate);
    r.ck_vl = mo !== null && mo > 6
      ? { pass: false, why: "採檢日已逾 6 個月，需重新檢驗" }
      : { pass: true, why: "病毒量 < 50 copies/mL" };
  }
  if (m.hbsag === "陽性") r.ck_hbv = { pass: false, why: "HBsAg 陽性，屬 B 型肝炎共同感染，不適用長效針劑" };
  else if (m.hbsag === "陰性") r.ck_hbv = { pass: true, why: "HBsAg 陰性" };

  if (m.resistance === "有" || m.resistance === "疑似") r.ck_resist = { pass: false, why: "CAB／RPV 抗藥性為「" + m.resistance + "」" };
  else if (m.resistance === "無") r.ck_resist = { pass: true, why: "無 CAB／RPV 抗藥性" };

  if (m.ltbi) r.ck_ltbi = { pass: true, why: m.ltbi };
  return r;
}
/* 有效勾選狀態：檢驗值可判定者以檢驗值為準，其餘沿用人工勾選 */
function effectiveChecks(m) {
  const derived = deriveChecks(m);
  const checks = {};
  CDC_ITEMS.forEach((it) => { checks[it.key] = derived[it.key] ? derived[it.key].pass : !!m[it.key]; });
  const blockers = CDC_ITEMS.filter((it) => derived[it.key] && !derived[it.key].pass).map((it) => derived[it.key].why);
  return { derived, checks, blockers };
}
/* 不影響申請資格、但需提醒的檢驗發現 */
function labWarnings(m) {
  const w = [];
  if (m.hbsag === "陰性" && m.antiHbc === "陽性" && m.antiHbs === "陰性")
    w.push("Anti-HBc 單獨陽性（HBsAg 與 Anti-HBs 皆陰性）：需排除隱匿型 B 型肝炎感染，建議加驗 HBV DNA 後再評估。");
  if (m.hbsag === "陰性" && m.antiHbs === "陰性" && m.antiHbc === "陰性" && m.hbvVaccinated === "否")
    w.push("對 B 型肝炎無免疫力且未接種疫苗：建議先安排 B 肝疫苗接種。");
  if (m.ltbi === "已完成 TB/LTBI 治療" && !m.ltbiDate) w.push("LTBI 已完成治療，但未填治療完成日。");
  if (m.hbsag === "陽性") w.push("HBsAg 陽性個案若停用含 TDF／TAF 之口服處方，有 B 型肝炎再活化風險，請維持抗 HBV 治療。");
  return w;
}

/* 互動比較資料（口服 vs 針劑，兩側對等＋中立的「對你來說」） */
const COMPARE = [
  { dim: "怎麼用藥", oral: "每天吞一次藥錠", inj: "每 2 個月回診打針，臀部左右各一針", note: "一種靠每天的小習慣，一種靠固定回來一趟。" },
  { dim: "回診與領藥次數", oral: "一年約 4 次回診 + 8 次領藥（依共病調整）", inj: "一年約 6 次回診，不用再另外領藥", note: "口服藥若家裡還有庫存，臨時無法回診時比較不會中斷治療。" },
  { dim: "控制病毒的效果", oral: "穩定有效", inj: "穩定有效（不適用初始治療）", note: "兩種把病毒壓住的效果是相當的，這點可以放心。" },
  { dim: "不小心錯過時", oral: "想起來就盡快補吃", inj: "前後有 7 天彈性；真的超過要先吃口服藥銜接", note: "口服較有彈性；針劑需要多留意回診時間。" },
  { dim: "最常見的不舒服", oral: "口乾、頭暈、噁心、脹氣等，多半會慢慢適應", inj: "打針處會痠、腫或疼痛，多半 3 天內退，前幾次比較明顯", note: "兩種都可能有不適，只是形式不一樣。" },
  { dim: "隱私感受", oral: "家裡會放藥，但看診時間可以自己安排", inj: "不用放藥，但要固定請假回診", note: "兩種都有各自的隱私挑戰——一個怕家人看到藥，一個怕同事問為什麼常請假。" },
  { dim: "時間自主性", oral: "吃藥時間可以自訂，漏藥可以補", inj: "必須配合院所排程，遲到要重新約", note: "想自己掌控時間的人，口服彈性大；想「不用想」的人，針劑反而輕鬆。" },
  { dim: "看診地點", oral: "指定醫院都可以，搬家、出差都好處理", inj: "需確認該指定醫院有無長效針劑，回診地點要固定", note: "生活地點常變動的人，口服比較不受限。" },
  { dim: "旅行與行程", oral: "帶著藥就能走，較自由", inj: "要配合每 2 個月的回診安排", note: "常出遠門的話，這點值得一起想想。" },
  { dim: "怕不怕打針", oral: "不需面對針", inj: "每 2 個月臀部左右各一針", note: "對針真的很怕的人，這是真實的考量。" },
  { dim: "如果之後想停", oral: "藥很快代謝掉，需盡快補藥或與醫療人員討論換藥", inj: "雖成分停留在體內約 12 個月，確認停用會接著吃口服藥", note: "停針劑不能就這樣停，需要醫療團隊幫你安排銜接。" },
];

const initPatient = {
  missedFreq: "", reasons: [], fearSeen: 0, hidingStress: 0, dailyReminder: 0, missWorry: 0,
  lifeImpact: [], difficultyNote: "", knowledge: 0, concern: "",
  p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, p6: 0, p7: 0, consent: false, submitted: false,
};
const initManager = {
  vl: "", vlDate: "", cd4: "", height: "", weight: "",
  hbsag: "", hbsagDate: "", antiHbs: "", antiHbsDate: "", antiHbc: "", antiHbcDate: "", hbvVaccinated: "", hbvDoses: [],
  resistance: "", resistDate: "", ltbi: "", ltbiDate: "",
  ck_adult: false, ck_vl: false, ck_oral: false, ck_q2m: false, ck_hbv: false,
  ck_resist: false, ck_drug: false, ck_preg: false, ck_ltbi: false, impression: "",
};

/* ── 判斷／計算 ─────────────────────────────────────────── */
const freqSev = (f) => (f === "0" ? "green" : f === "1-3" ? "amber" : f ? "red" : "none");
const scoreSev = (v) => (!v ? "none" : v <= 2 ? "green" : v === 3 ? "amber" : "red");
const worst = (a) => (a.includes("red") ? "red" : a.includes("amber") ? "amber" : a.some((x) => x === "green") ? "green" : "none");
function prefLean(p) {
  let sum = 0, max = 0;
  Object.keys(PREF_DIR).forEach((k) => { if (p[k]) { sum += PREF_DIR[k] * (p[k] - 3); max += 2; } });
  return max ? Math.round((sum / max) * 100) : 0; // -100(口服) .. +100(針劑)
}

/* ── 送審摘要（臨床精準・證據對應） ───────────────────────── */
function buildSummary(p, m) {
  const psy = [];
  if (p.fearSeen >= 4) psy.push("擔心被家人、同事或伴侶看到服藥");
  if (p.hidingStress >= 4) psy.push("需藏匿藥物所造成之心理壓力");
  if (p.dailyReminder >= 4) psy.push("每日服藥反覆提醒感染者身分之心理負擔");
  if (p.missWorry >= 4) psy.push("對漏藥或服藥不確定性的持續焦慮");

  let s1 = "個案近一個月自述" + (FREQ[p.missedFreq] || "漏服情形未填寫");
  if (p.missedFreq && FREQ_SEV_TEXT[p.missedFreq]) s1 += FREQ_SEV_TEXT[p.missedFreq];
  if (p.reasons.length) s1 += "，主要原因為" + p.reasons.map((r) => REASONS[r]).join("、");
  s1 += "。";
  if (psy.length) s1 += "心理社會層面，個案表達" + psy.join("、") + "。";
  if (p.lifeImpact.length) s1 += "每日口服方案並影響其" + p.lifeImpact.map((l) => LIFE[l]).join("、") + "等層面。";
  if (p.difficultyNote.trim()) s1 += "個案補充：「" + p.difficultyNote.trim() + "」。";
  s1 += "綜合評估，每日口服方案對個案之服藥遵從性與生活品質造成明確負擔，具改用長效針劑之臨床適應症與需求。";

  const injHigh = PREF_DIMS.filter((d) => p[d.key] >= 4 && PREF_DIR[d.key] > 0).map((d) => PREF_JUSTIFY[d.key]);
  const oralHigh = PREF_DIMS.filter((d) => p[d.key] >= 4 && PREF_DIR[d.key] < 0).map((d) => PREF_JUSTIFY[d.key]);
  let prefText;
  if (injHigh.length && oralHigh.length) {
    prefText = "於偏好評估中主要期待「" + injHigh.join("、") + "」（可透過長效針劑獲改善），同時亦重視「" + oralHigh.join("、") + "」（屬口服治療優勢），此等權衡已納入 SDM 討論";
  } else if (injHigh.length) {
    prefText = "於偏好評估中主要期待「" + injHigh.join("、") + "」，此等層面可透過長效針劑獲改善";
  } else if (oralHigh.length) {
    prefText = "於偏好評估中主要重視「" + oralHigh.join("、") + "」，此屬口服治療之優勢層面";
  } else {
    prefText = "於各偏好層面重視程度尚屬平均";
  }
  const lv = prefLean(p);
  const leanText = lv > 15 ? "整體偏向改用長效針劑" : lv < -15 ? "整體偏向維持口服" : "於兩選項間尚無明顯偏向";

  const { derived, blockers } = effectiveChecks(m);
  const st = (k) => (derived[k]
    ? (derived[k].pass ? "符合 ✓（依檢驗值判定）" : "不符合 ✗（" + derived[k].why + "）")
    : (m[k] ? "符合 ✓" : "未確認 ▢"));
  const v = (x) => (x && String(x).trim() ? x : "—");

  const crit = [
    "1. 成人（≥18 歲）：" + st("ck_adult"),
    "2. 病毒抑制（近 6 個月 HIV RNA < 50 copies/mL）：" + st("ck_vl") + "；近 6 個月 HIV RNA < 50 copies/mL：" + v(m.vl) + "（採檢日 " + v(m.vlDate) + "）",
    "3. 每日口服困難並說明理由：" + st("ck_oral") + "（理由詳第一段）",
    "4. 同意每 2 個月回診接受注射：" + st("ck_q2m"),
    "5. 未感染 B 型肝炎：" + st("ck_hbv") + "；HBsAg " + v(m.hbsag) + "（採檢日 " + v(m.hbsagDate) + "）｜Anti-HBs " + v(m.antiHbs) + "（採檢日 " + v(m.antiHbsDate) + "）｜Anti-HBc " + v(m.antiHbc) + "（採檢日 " + v(m.antiHbcDate) + "）｜B 肝疫苗：" + (m.hbvVaccinated === "是" ? "已接種（" + ((m.hbvDoses || []).filter((d) => d && d.trim()).map((d, i) => "第" + (i + 1) + "劑 " + d).join("；") || "—") + "）" : v(m.hbvVaccinated)),
    "6. 過去無病毒抑制失敗、未對 CAB 或 RPV 具有已知或疑似抗藥性：" + st("ck_resist") + "；抗藥性報告 " + v(m.resistance) + "（報告日 " + v(m.resistDate) + "）",
    "7. 未使用顯著交互作用藥物：" + st("ck_drug"),
    "8. 女性未懷孕、無備孕計畫：" + st("ck_preg"),
    "9. 潛伏結核感染（LTBI）檢驗為陰性，或已完成 TB/LTBI 治療：" + st("ck_ltbi") + "；LTBI " + v(m.ltbi) + "（對應日期 " + v(m.ltbiDate) + "）",
  ].join("\n");

  const warns = labWarnings(m);
  const critNote = blockers.length
    ? "\n\n※ 依現有檢驗數據，本案目前不符合下列要件，暫不建議送審：" + blockers.join("；") + "。"
    : "";
  const warnNote = warns.length ? "\n※ 檢驗提醒：" + warns.join(" ") : "";

  const bmiCalc = (() => {
    const h = parseFloat(m.height), w = parseFloat(m.weight);
    if (!h || !w) return "";
    const b = w / Math.pow(h / 100, 2);
    return isFinite(b) ? b.toFixed(1) : "";
  })();
  const otherLabs = "身高：" + v(m.height) + " cm｜體重：" + v(m.weight) + " kg｜BMI：" + v(bmiCalc);

  let s5 = "已與個案說明口服與長效針劑於給藥途徑、回診頻率（每 2 個月一次）、病毒抑制療效相當、注射部位反應、給藥前後 ±7 天彈性時間，以及中斷後因針劑成分（約 12 個月）須立即接續口服藥銜接等層面之差異。";
  s5 += "個案偏好" + leanText + "，" + prefText + "。";
  if (m.impression.trim()) s5 += "個案管理師臨床評估：" + m.impression.trim() + "。";
  s5 += "經醫病共享決策討論，個案" + (p.consent ? "已知情並同意" : "尚未做出最終決定，") + "評估改用長效針劑。";
  if (blockers.length) s5 += "惟依現有檢驗結果尚有未符之適用要件（詳第二段），待條件釐清後再行送審。";

  return [
    "【長效注射劑（cabotegravir/rilpivirine LA）改用申請 — 個案困境與醫病共享決策（SDM）摘要】", "",
    "一、口服治療困境敘明", s1, "",
    "二、適用條件查核（依現行〈抗人類免疫缺乏病毒藥品處方使用規範〉長效針劑事前審查要件）", crit + critNote + warnNote, "",
    "三、其他檢驗依據", otherLabs, "",
    "四、共享決策摘要", s5, "",
    "（本摘要由 SDM 輔助工具自動彙整，不含可識別個資；送審內容、檢驗數值與處方方案請由個案管理師與處方醫師核對確認後定稿。）",
  ].join("\n");
}

/* ── 共用元件 ───────────────────────────────────────────── */
const card = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "22px 24px", boxShadow: "0 1px 2px rgba(35,33,28,.04)" };
const sub = { color: "var(--muted)", fontSize: 13, marginTop: -6, marginBottom: 16, lineHeight: 1.6 };

function SectionLabel({ n, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      {n != null && <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--primary)", border: "1px solid var(--primary)", borderRadius: 6, padding: "1px 7px" }}>{n}</span>}
      <span style={{ fontFamily: "var(--display)", fontSize: 19, fontWeight: 600, color: "var(--ink)" }}>{children}</span>
    </div>
  );
}
function Scale({ value, onChange, low = "完全不在意", high = "非常在意" }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return <button key={n} onClick={() => onChange(n)} className="sbtn" style={{ flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer", border: on ? "1px solid var(--primary)" : "1px solid var(--line)", background: on ? "var(--primary)" : "var(--surface)", color: on ? "#fff" : "var(--muted)", fontFamily: "var(--mono)", fontSize: 15, fontWeight: 600, transition: "all .15s" }}>{n}</button>;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "var(--muted)" }}><span>{low}</span><span>{high}</span></div>
    </div>
  );
}
function Pills({ options, values, onToggle, single }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = single ? values === o.key : values.includes(o.key);
        return <button key={o.key} onClick={() => onToggle(o.key)} className="sbtn" style={{ padding: "9px 14px", borderRadius: 999, cursor: "pointer", fontSize: 14, border: on ? "1px solid var(--primary)" : "1px solid var(--line)", background: on ? "var(--primary-soft)" : "var(--surface)", color: on ? "var(--primary)" : "var(--ink)", fontWeight: on ? 600 : 500, transition: "all .15s" }}>{o.label}</button>;
      })}
    </div>
  );
}
function Dot({ level }) {
  const c = { green: "var(--green)", amber: "var(--amber)", red: "var(--red)", none: "var(--line)" }[level];
  return <span style={{ width: 10, height: 10, borderRadius: 999, background: c, display: "inline-block", flexShrink: 0 }} />;
}
const IconCopy = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
const IconCheck = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>);
const IconArrow = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>);
const IconPill = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z" /><path d="m8.5 8.5 7 7" /></svg>);
const IconSyringe = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m18 2 4 4" /><path d="m17 7 3-3" /><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" /><path d="m9 11 4 4" /><path d="m5 19-3 3" /><path d="m14 4 6 6" /></svg>);

/* 自然頻率圖示（100 格） */
function FreqArray({ count, color = "var(--accent)", note }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(20, 1fr)", gap: 3, maxWidth: 340 }}>
        {Array.from({ length: 100 }).map((_, i) => <span key={i} style={{ aspectRatio: "1", borderRadius: 2, background: i < count ? color : "var(--line)" }} />)}
      </div>
      {note && <div style={{ fontSize: 13.5, color: "var(--ink)", marginTop: 10, lineHeight: 1.65 }}>{note}</div>}
    </div>
  );
}
/* 可展開「了解更多」 */
function Collapse({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
      <button onClick={() => setOpen(!open)} className="sbtn" style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--body)", fontSize: 14.5, fontWeight: 600, color: "var(--ink)", textAlign: "left" }}>
        <span>{title}</span>
        <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .2s", color: "var(--muted)", fontSize: 18 }}>›</span>
      </button>
      {open && <div style={{ padding: "0 16px 16px", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.75 }}>{children}</div>}
    </div>
  );
}
/* 偏好光譜（非指示性） */
function PrefSpectrum({ lean }) {
  const pos = (lean + 100) / 2;
  const label = lean > 15 ? "偏向長效針劑" : lean < -15 ? "偏向繼續口服" : "兩者之間，還沒有很明顯";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 7 }}><span>繼續口服</span><span>長效針劑</span></div>
      <div style={{ position: "relative", height: 10, borderRadius: 999, background: "linear-gradient(90deg,var(--primary-soft),var(--bg) 50%,#F0E0D6)" }}>
        <div style={{ position: "absolute", top: "50%", left: pos + "%", transform: "translate(-50%,-50%)", width: 18, height: 18, borderRadius: 999, background: "var(--accent)", border: "3px solid var(--surface)", boxShadow: "0 1px 5px rgba(0,0,0,.25)" }} />
      </div>
      <div style={{ textAlign: "center", marginTop: 11, fontFamily: "var(--display)", fontSize: 16, fontWeight: 600 }}>{label}</div>
    </div>
  );
}
/* 互動比較：點選面向 → 兩側對等卡片＋中立說明 */
function InteractiveCompare() {
  const [i, setI] = useState(0);
  const r = COMPARE[i];
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {COMPARE.map((c, idx) => (
          <button key={idx} onClick={() => setI(idx)} className="sbtn" style={{ whiteSpace: "nowrap", padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13.5, fontWeight: idx === i ? 700 : 500, border: idx === i ? "1px solid var(--primary)" : "1px solid var(--line)", background: idx === i ? "var(--primary)" : "var(--surface)", color: idx === i ? "#fff" : "var(--ink)", transition: "all .15s" }}>{c.dim}</button>
        ))}
      </div>
      <div key={i} className="fade">
        <div className="cmp" style={{ gap: 12 }}>
          <div style={{ flex: 1, padding: 16, borderRadius: 12, background: "var(--primary-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9, color: "var(--primary)" }}><IconPill /><b style={{ fontFamily: "var(--display)", fontSize: 15 }}>每日口服</b></div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink)" }}>{r.oral}</div>
          </div>
          <div style={{ flex: 1, padding: 16, borderRadius: 12, background: "#F3E3D9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9, color: "var(--accent)" }}><IconSyringe /><b style={{ fontFamily: "var(--display)", fontSize: 15 }}>長效針劑</b></div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink)" }}>{r.inj}</div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, border: "1px dashed var(--line)", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.65 }}>
          <b style={{ color: "var(--ink)" }}>對你來說：</b>{r.note}
        </div>
      </div>
    </div>
  );
}
function Inp({ label, value, onChange, placeholder, mono }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontFamily: mono ? "var(--mono)" : "var(--body)", fontSize: 14, color: "var(--ink)", background: "var(--surface)", boxSizing: "border-box" }} />
    </label>
  );
}
function Sel({ label, value, onChange, opts }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontFamily: "var(--body)", fontSize: 14, color: value ? "var(--ink)" : "var(--muted)", background: "var(--surface)", boxSizing: "border-box", cursor: "pointer" }}>
        <option value="">—</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/* ── 個案端 ─────────────────────────────────────────────── */
const ELIG = [
  ["穩定服藥半年以上，病毒量測不到（U=U）", "針劑是給「已經控制得很好」的人接手用的，有這個基礎換過去才安全又安心。申請時會看近 6 個月內的抽血報告，確認病毒量 < 50 copies/mL。"],
  ["目前的藥對你還有效、沒有抗藥性", "少數換藥後不順利的人，多半是換之前體內就帶有抗藥性，所以會先幫你確認。"],
  ["沒有 B 肝、沒有會互相影響的藥、潛伏結核已排除或治療過", "這些可能影響療效或安全，先看過比較放心。"],
  ["可以每 2 個月回來打針", "這點最重要——準時回診，針劑才能一直好好保護你。"],
  ["女性目前沒有懷孕，也沒有懷孕計畫", ""],
];

function PatientFlow({ p, set, onSubmit, caseId, setCaseId }) {
  const [step, setStep] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [resumeId, setResumeId] = useState("");
  const [resumeStatus, setResumeStatus] = useState(""); // "", "loading", "notfound", "error", "ok"
  const labels = ["先認識", "安心了解", "你的狀況", "你的想法", "你的偏好", "完成"];
  const upd = (k, v) => set({ ...p, [k]: v });
  const toggle = (k, key) => upd(k, p[k].includes(key) ? p[k].filter((x) => x !== key) : [...p[k], key]);

  const handleResume = async () => {
    const id = resumeId.trim().toUpperCase();
    if (!id) return;
    setResumeStatus("loading");
    try {
      const data = await getPatientByCaseId(id);
      if (!data) { setResumeStatus("notfound"); return; }
      set({ ...p, ...data, submitted: false });
      setCaseId && setCaseId(id);
      setResumeStatus("ok");
    } catch (e) {
      setResumeStatus("error");
    }
  };

  // 必填驗證：第 2、3、4 步的關鍵題目須填完才能下一步
  const canProceed = (() => {
    if (step === 2) {
      return !!p.missedFreq && p.fearSeen > 0 && p.hidingStress > 0 && p.dailyReminder > 0 && p.missWorry > 0;
    }
    if (step === 3) {
      return p.knowledge > 0;
    }
    if (step === 4) {
      return PREF_DIMS.every((d) => p[d.key] > 0);
    }
    return true;
  })();

  const goNext = () => {
    if (!canProceed) { setShowHint(true); return; }
    setShowHint(false);
    setStep(step + 1);
  };
  const goPrev = () => { setShowHint(false); setStep(step - 1); };

  const Req = () => <span style={{ color: "var(--red)", marginLeft: 4 }}>*</span>;

  if (p.submitted) {
    const lean = prefLean(p);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...card, textAlign: "center", padding: "34px 24px" }}>
          <div style={{ width: 52, height: 52, borderRadius: 999, background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><IconCheck /></div>
          <div style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 600, marginBottom: 8 }}>已經送出囉，謝謝你</div>
          <p style={{ color: "var(--muted)", maxWidth: 430, margin: "0 auto", lineHeight: 1.75 }}>謝謝你願意花時間把這些填完。你的狀況和想法已經傳給個管師，會在討論時一起參考。要不要換成長效針劑，最後會由你和醫療團隊一起決定，不用有壓力。</p>
          {caseId && (
            <div style={{ marginTop: 22, padding: "16px 20px", borderRadius: 12, background: "var(--primary-soft)", display: "inline-block" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>請把這個編號告訴個管師</div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color: "var(--primary)", letterSpacing: 2 }}>{caseId}</div>
            </div>
          )}
        </div>
        <div style={{ ...card, background: "var(--primary-soft)", borderColor: "transparent" }}>
          <SectionLabel>帶去診間（建議截圖起來）</SectionLabel>
          <div style={{ background: "var(--surface)", borderRadius: 12, padding: 16, marginBottom: 14 }}><PrefSpectrum lean={lean} /></div>
          {p.concern && <div style={{ background: "var(--surface)", borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 14, lineHeight: 1.6 }}>你最想問醫師的：「{p.concern}」</div>}
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>看診時可以這樣問醫師：</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {["我的檢驗，符合改用長效針劑的條件嗎？", "萬一哪次趕不上回診，我該怎麼辦？", "注射部位反應，對我可能會是什麼情況？"].map((q, i) => (
              <div key={i} style={{ display: "flex", gap: 9, fontSize: 13.5, lineHeight: 1.5 }}><span style={{ fontFamily: "var(--mono)", color: "var(--primary)" }}>{i + 1}.</span>{q}</div>
            ))}
          </div>
        </div>
        <button onClick={() => { set({ ...p, submitted: false }); setStep(0); }} className="sbtn" style={{ alignSelf: "center", padding: "10px 18px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", fontWeight: 600 }}>重新填寫</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
        {labels.map((s, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{ height: 4, borderRadius: 999, background: i <= step ? "var(--primary)" : "var(--line)", transition: "all .3s" }} />
            <div style={{ fontSize: 11, color: i === step ? "var(--primary)" : "var(--muted)", marginTop: 6, fontWeight: i === step ? 600 : 400, textAlign: "center" }}>{s}</div>
          </div>
        ))}
      </div>

      <div key={step} className="fade">
        {/* 0 先認識 */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ ...card, padding: "14px 18px", background: "var(--primary-soft)", borderColor: "transparent" }}>
              {!showResume ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.6 }}>之前填過嗎？輸入上次的編號可以把上次的答案帶回來繼續。</div>
                  <button onClick={() => setShowResume(true)} className="sbtn" style={{ padding: "7px 14px", borderRadius: 999, border: "1px solid var(--primary)", background: "var(--surface)", color: "var(--primary)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>輸入編號繼續</button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>輸入上次的編號（例：A3F-7KM），就會把上次的答案帶回來。</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={resumeId} onChange={(e) => { setResumeId(e.target.value); setResumeStatus(""); }} onKeyDown={(e) => e.key === "Enter" && handleResume()} placeholder="A3F-7KM" style={{ flex: "1 1 180px", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 15, color: "var(--ink)", background: "var(--surface)", boxSizing: "border-box", textTransform: "uppercase" }} />
                    <button onClick={handleResume} disabled={resumeStatus === "loading" || !resumeId.trim()} className="sbtn" style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>{resumeStatus === "loading" ? "讀取中…" : "帶入"}</button>
                    <button onClick={() => { setShowResume(false); setResumeId(""); setResumeStatus(""); }} className="sbtn" style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--muted)", cursor: "pointer", fontWeight: 500 }}>取消</button>
                  </div>
                  {resumeStatus === "notfound" && <div style={{ marginTop: 8, fontSize: 13, color: "var(--amber)" }}>查無此編號，請確認後再試。</div>}
                  {resumeStatus === "error" && <div style={{ marginTop: 8, fontSize: 13, color: "var(--red)" }}>讀取時發生問題，請稍後再試。</div>}
                  {resumeStatus === "ok" && <div style={{ marginTop: 8, fontSize: 13, color: "var(--green)" }}>● 已帶入上次的答案（編號 {caseId}），可以直接修改後送出。</div>}
                </div>
              )}
            </div>
            <div style={card}>
              <SectionLabel>先一起認識它</SectionLabel>
              <p style={{ color: "var(--muted)", lineHeight: 1.75, marginTop: -4 }}>能把病毒穩定控制到現在，其實很不容易，你已經很用心了。醫師提到，你或許可以考慮改用「長效針劑」——每 2 個月回診打一針，不用再天天吃藥。這裡沒有標準答案，也不用急著決定；先花幾分鐘認識它，我們慢慢一起看。</p>
              <div style={{ marginTop: 16, borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)", aspectRatio: "16 / 9", background: "#1b1b18" }}>
                <iframe
                  src={VIDEO_EMBED_URL}
                  title="衛教影片"
                  style={{ width: "100%", height: "100%", border: 0, display: "block" }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
              <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--muted)", textAlign: "right" }}>
                若影片無法播放，<a href={VIDEO_WATCH_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontWeight: 600 }}>於 YouTube 開啟 ↗</a>
              </div>
              <div style={{ marginTop: 16, padding: 15, borderRadius: 10, background: "var(--primary-soft)", fontSize: 14, lineHeight: 1.7 }}><b style={{ color: "var(--primary)" }}>你要一起想的是：</b>繼續每天吃藥，還是改成每 2 個月回診打一針？這兩種都能把病毒控制得很好，沒有哪一個比較「對」——差別只在哪一種更貼近你的生活。最後想怎麼選，你說了算。</div>
            </div>

            <div style={card}>
              <SectionLabel>兩種方式，慢慢比較看看</SectionLabel>
              <p style={sub}>點任一個項目，看看它們的差別。沒有哪個比較好，只有哪個比較適合你。</p>
              <InteractiveCompare />
              <div style={{ marginTop: 16 }}>
                <Collapse title="想一次看完整對照表">
                  <div style={{ marginTop: 4 }}>
                    <div className="cmp" style={{ paddingBottom: 8, borderBottom: "2px solid var(--primary)" }}>
                      <div style={{ flex: 1, fontWeight: 700, fontFamily: "var(--display)" }}>每日口服</div>
                      <div style={{ width: 12 }} />
                      <div style={{ flex: 1, fontWeight: 700, fontFamily: "var(--display)" }}>長效針劑</div>
                    </div>
                    {COMPARE.map((r, i) => (
                      <div key={i} style={{ borderTop: i ? "1px solid var(--line)" : "none", padding: "11px 0" }}>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>{r.dim}</div>
                        <div className="cmp">
                          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5, paddingRight: 14 }}>{r.oral}</div>
                          <div style={{ width: 1, background: "var(--line)", flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5, paddingLeft: 14 }}>{r.inj}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Collapse>
              </div>
            </div>

            <Collapse title="有哪些藥不能跟它一起用？">
              下面這些藥可能會跟長效針劑互相影響，需要先評估或避免：抗結核藥（rifampin、rifapentine、rifabutin）、部分抗癲癇藥（carbamazepine、oxcarbazepine、phenobarbital、phenytoin）、全身性類固醇 dexamethasone（單次使用除外），以及聖約翰草。如果你正在用其中任何一種，記得讓醫療團隊知道就好，他們會幫你看。
            </Collapse>
          </div>
        )}

        {/* 1 安心了解（風險＋適合） */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={card}>
              <SectionLabel>打完針，身體可能會有什麼感覺？</SectionLabel>
              <FreqArray count={76} note="打針的地方可能會痠、紅、腫，或摸到一點硬塊。研究中每 2 個月打一次的人，大約 76 / 100 曾遇到。" />
              <p style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.7, marginTop: 14, marginBottom: 0 }}>聽起來好像不少，但別太擔心——幾乎都是輕微的（約 98 / 100），通常 3 天左右就慢慢退了。而且打久了會越來越少：剛開始大約 7 成的人會有感覺，後來降到 2 成左右。</p>
            </div>
            <div style={card}>
              <SectionLabel>如果想停，或病毒跑回來呢？</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <FreqArray count={1} color="var(--red)" note="因為打針不舒服而決定停下來的人很少，大約 1 / 100。" />
                <FreqArray count={1} color="var(--red)" note="病毒重新出現也很少見，大約 1 / 100；而且大多和換藥前體內就帶有抗藥性有關——所以醫療團隊會先幫你檢查，盡量把風險降到最低。" />
              </div>
            </div>
            <div style={{ ...card, background: "var(--primary-soft)", borderColor: "transparent" }}>
              <SectionLabel>你適不適合？醫療團隊會陪你一起看</SectionLabel>
              <p style={{ marginTop: -4, lineHeight: 1.75, fontSize: 14 }}>下面這幾件事，醫療團隊會和你一起確認。不是每個人現在都剛好適合，這很正常——<b>就算這次還不適合，繼續吃口服藥一樣能把病毒顧得很好，這一點都不是退而求其次。</b></p>
              <div style={{ marginTop: 8 }}>
                {ELIG.map(([t, why], i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "11px 0", borderTop: i ? "1px solid rgba(30,77,69,.14)" : "none" }}>
                    <span style={{ color: "var(--primary)", marginTop: 2, flexShrink: 0 }}><IconCheck /></span>
                    <div><div style={{ fontWeight: 600, fontSize: 14 }}>{t}</div>{why && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, lineHeight: 1.55 }}>{why}</div>}</div>
                  </div>
                ))}
              </div>
            </div>
            <Collapse title="打針是什麼情況？之後要注意什麼？">
              <b>打針的時候：</b>打在臀部肌肉，左右各一針，打完會請你留下來觀察 10–15 分鐘。目前國內做法是<b>從原本的口服藥直接換成針劑</b>，不需要先吃一段口服導入期，確認條件符合後就可以安排第一次注射。<br /><br />
              <b>打完之後（這些都很正常）：</b>打針的地方痠、紅、腫或有硬塊都很常見，通常幾天就好；附近肌肉有點痠也別擔心。<br /><br />
              <b style={{ color: "var(--accent)" }}>有幾件事想特別提醒你（都是為了讓針劑一直保護你）：</b><br />
              ・每次打針最好在預定日「前後 7 天內」完成。<br />
              ・如果快趕不上回診（出國、生病、臨時有事都可能發生），<b>早點告訴個管師就好</b>，需要的話會先用口服藥幫你銜接。<br />
              ・如果之後決定不打了，記得<b>馬上接著吃口服藥</b>——針劑成分會在身體裡留存大約 12 個月，中間空著可能讓病毒有機會產生抗藥性。
            </Collapse>
          </div>
        )}

        {/* 2 你的狀況（服藥困擾） */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={card}>
              <SectionLabel n="1">過去這個月，你大概多常漏吃藥？<Req /></SectionLabel>
              <p style={sub}>再忙、再規律的人都會有忘記的時候。照實選就好，這裡不會評斷你。</p>
              <Pills single options={FREQ_OPTS} values={p.missedFreq} onToggle={(k) => upd("missedFreq", k)} />
            </div>
            <div style={card}>
              <SectionLabel n="2">通常是什麼原因呢？（可複選）</SectionLabel>
              <p style={sub}>勾選符合你的就好，沒有對錯。</p>
              <Pills options={Object.entries(REASONS).map(([key, label]) => ({ key, label }))} values={p.reasons} onToggle={(k) => toggle("reasons", k)} />
            </div>
            <div style={card}>
              <SectionLabel n="3">這些感受，你有多常出現？<Req /></SectionLabel>
              <p style={sub}>這些心情都很真實，也有很多人經歷過。四題都請選一個分數。</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div><div style={{ marginBottom: 8, fontSize: 14 }}>擔心被家人、同事或伴侶看到我在吃藥</div><Scale value={p.fearSeen} onChange={(v) => upd("fearSeen", v)} low="幾乎不會" high="很常這樣" /></div>
                <div><div style={{ marginBottom: 8, fontSize: 14 }}>要把藥藏起來、找地方放，讓我有壓力</div><Scale value={p.hidingStress} onChange={(v) => upd("hidingStress", v)} low="幾乎不會" high="很常這樣" /></div>
                <div><div style={{ marginBottom: 8, fontSize: 14 }}>每天吃藥，常讓我想起自己的狀況</div><Scale value={p.dailyReminder} onChange={(v) => upd("dailyReminder", v)} low="幾乎不會" high="很常這樣" /></div>
                <div><div style={{ marginBottom: 8, fontSize: 14 }}>擔心自己漏藥、或是不確定自己有沒有吃</div><Scale value={p.missWorry} onChange={(v) => upd("missWorry", v)} low="幾乎不會" high="很常這樣" /></div>
              </div>
            </div>
            <div style={card}>
              <SectionLabel n="4">每天吃藥，有影響到生活的哪些部分嗎？（可複選）</SectionLabel>
              <Pills options={Object.entries(LIFE).map(([key, label]) => ({ key, label }))} values={p.lifeImpact} onToggle={(k) => toggle("lifeImpact", k)} />
              <textarea value={p.difficultyNote} onChange={(e) => upd("difficultyNote", e.target.value)} placeholder="有想多說的，都可以寫在這裡（選填）" style={{ marginTop: 14, width: "100%", minHeight: 70, padding: 12, borderRadius: 10, border: "1px solid var(--line)", fontFamily: "var(--body)", fontSize: 14, resize: "vertical", color: "var(--ink)", background: "var(--surface)", boxSizing: "border-box" }} />
            </div>
          </div>
        )}

        {/* 3 你的想法 */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={card}><SectionLabel n="5">你對長效針劑了解多少呢？<Req /></SectionLabel><Scale value={p.knowledge} onChange={(v) => upd("knowledge", v)} low="幾乎不了解" high="很清楚" /></div>
            <div style={card}><SectionLabel n="6">關於長效針劑，有沒有什麼最想問、或最在意的？</SectionLabel><textarea value={p.concern} onChange={(e) => upd("concern", e.target.value)} placeholder="例如：會不會痛？要請假回診嗎？會不會有人發現？（選填）" style={{ width: "100%", minHeight: 70, padding: 12, borderRadius: 10, border: "1px solid var(--line)", fontFamily: "var(--body)", fontSize: 14, resize: "vertical", color: "var(--ink)", background: "var(--surface)", boxSizing: "border-box" }} /></div>
          </div>
        )}

        {/* 4 你的偏好 */}
        {step === 4 && (
          <div style={card}>
            <SectionLabel n="7">這些對你來說，感覺如何？<Req /></SectionLabel>
            <p style={sub}>沒有標準答案，這只是幫你和醫師更看清楚你心裡的想法。每一題都請選一個分數。</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {PREF_DIMS.map((d) => (
                <div key={d.key}>
                  <div style={{ marginBottom: 8, fontSize: 14 }}>{d.label}{!p[d.key] && <span style={{ color: "var(--red)", marginLeft: 4 }}>*</span>}</div>
                  <Scale value={p[d.key]} onChange={(v) => upd(d.key, v)} low={d.low} high={d.high} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>從你目前的回答看起來，你的心比較偏向：</div>
              <PrefSpectrum lean={prefLean(p)} />
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.6 }}>這只是反映你現在的想法，不是建議、也不是結論——要不要換，最後由你和醫療團隊一起決定。</div>
            </div>
          </div>
        )}

        {/* 5 完成 */}
        {step === 5 && (
          <div style={card}>
            <SectionLabel n="9">準備好了嗎？</SectionLabel>
            <p style={{ color: "var(--muted)", lineHeight: 1.75, marginTop: -4 }}>送出後，你填的內容會給個管師參考，幫忙一起討論。這份小工具<b style={{ color: "var(--ink)" }}>不會幫你決定</b>，也<b style={{ color: "var(--ink)" }}>不會記下你的姓名或任何身分資料</b>——最後怎麼選，永遠是你和醫療團隊一起決定。</p>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16, cursor: "pointer", padding: 14, borderRadius: 10, background: "var(--primary-soft)" }}>
              <input type="checkbox" checked={p.consent} onChange={(e) => upd("consent", e.target.checked)} style={{ marginTop: 3, width: 17, height: 17, accentColor: "var(--primary)" }} />
              <span style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.6 }}>我了解上面的說明，也願意把我的填答提供給個管師，作為一起討論之用。</span>
            </label>
          </div>
        )}
      </div>

      {showHint && !canProceed && (
        <div style={{ marginTop: 16, padding: "11px 14px", borderRadius: 10, background: "#FBE5DF", color: "var(--red)", fontSize: 13.5, fontWeight: 600 }}>
          有 <span style={{ textDecoration: "underline" }}>標示紅色 *</span> 的題目還沒填完，請補上後再進到下一步。
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, gap: 12 }}>
        <button disabled={step === 0} onClick={goPrev} className="sbtn" style={{ padding: "11px 18px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", color: step === 0 ? "var(--line)" : "var(--ink)", cursor: step === 0 ? "default" : "pointer", fontWeight: 600 }}>上一步</button>
        {step < 5 ? (
          <button onClick={goNext} className="sbtn" style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 10, border: "none", background: canProceed ? "var(--primary)" : "var(--line)", color: "#fff", cursor: canProceed ? "pointer" : "not-allowed", fontWeight: 600 }}>下一步 <IconArrow /></button>
        ) : (
          <button onClick={onSubmit} disabled={!p.consent} className="sbtn" style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 22px", borderRadius: 10, border: "none", background: p.consent ? "var(--accent)" : "var(--line)", color: "#fff", cursor: p.consent ? "pointer" : "default", fontWeight: 600 }}>送出給個管師 <IconArrow /></button>
        )}
      </div>
    </div>
  );
}

/* ── 個管師端 ───────────────────────────────────────────── */

function ManagerDashboard({ p, m, set, setP, caseId, setCaseId }) {
  const [copied, setCopied] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [inputCaseId, setInputCaseId] = useState(caseId || "");
  const [loadStatus, setLoadStatus] = useState(""); // "", "listening", "notfound", "error"
  const [saveStatus, setSaveStatus] = useState(""); // "", "saving", "saved", "error"
  const upd = (k, v) => set((prev) => ({ ...prev, [k]: v }));

  // 監聽個案問卷：caseId 變更時自動連線、即時同步
  useEffect(() => {
    if (!caseId) { setLoadStatus(""); return; }
    setLoadStatus("listening");
    const unsub = listenPatientByCaseId(
      caseId,
      (data) => {
        if (data) {
          setP({ ...data, submitted: true });
          setLoadStatus("ok");
        } else {
          setLoadStatus("notfound");
        }
      },
      () => setLoadStatus("error")
    );
    // 同時嘗試載入已存的個管師評估資料（可續填）
    getManagerAssessment(caseId).then((data) => {
      if (data) set({ ...m, ...data });
    }).catch(() => {});
    return () => unsub && unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const loadCase = () => {
    const id = inputCaseId.trim().toUpperCase();
    if (!id) return;
    setCaseId(id);
  };

  const saveAssessment = async () => {
    if (!caseId) return;
    setSaveStatus("saving");
    try {
      await saveManagerAssessment(caseId, m);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (e) {
      setSaveStatus("error");
    }
  };
  const filled = p.missedFreq || p.reasons.length || p.difficultyNote;
  const overall = worst([freqSev(p.missedFreq), scoreSev(p.fearSeen), scoreSev(p.hidingStress), scoreSev(p.dailyReminder), scoreSev(p.missWorry)]);
  const doc = buildSummary(p, m);
  const { derived, checks, blockers } = effectiveChecks(m);
  const warns = labWarnings(m);
  const doneCount = CDC_ITEMS.filter((it) => checks[it.key]).length;

  const copy = () => {
    try { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(doc).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); return; } } catch (e) {}
    const ta = document.createElement("textarea"); ta.value = doc; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) {}
    document.body.removeChild(ta);
  };
  const row = (label, value, sev) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line)", gap: 12 }}>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, textAlign: "right" }}>{sev && <Dot level={sev} />}{value}</span>
    </div>
  );

  return (
    <div>
      <div style={{ ...card, marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>輸入個案提供之編號（即時連線）</div>
          <input value={inputCaseId} onChange={(e) => setInputCaseId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadCase()} placeholder="例如 A3F-7KM" style={{ width: "100%", padding: "9px 11px", borderRadius: 9, border: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 15, color: "var(--ink)", background: "var(--surface)", boxSizing: "border-box", textTransform: "uppercase" }} />
        </div>
        <button onClick={loadCase} className="sbtn" style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontWeight: 600 }}>連線</button>
        {caseId && (
          <div style={{ fontSize: 13, color: loadStatus === "ok" ? "var(--green)" : loadStatus === "notfound" ? "var(--amber)" : loadStatus === "error" ? "var(--red)" : "var(--muted)", fontWeight: 600 }}>
            {loadStatus === "listening" && "連線中…"}
            {loadStatus === "ok" && `● 已連線 ${caseId}（即時同步中）`}
            {loadStatus === "notfound" && "查無此編號，請確認後再試"}
            {loadStatus === "error" && "連線錯誤"}
          </div>
        )}
      </div>
      {!filled && !caseId && <div style={{ ...card, background: "var(--amber-bg)", borderColor: "transparent", marginBottom: 16, fontSize: 14, color: "#7a5a1e" }}>請輸入個案提供之編號以即時讀取問卷；亦可直接在下方填寫示範資料。</div>}
      <div className="cols">
        <div className="col">
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <SectionLabel>個案自評儀表板</SectionLabel>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "var(--bg)", color: "var(--muted)" }}><Dot level={overall} />困擾整體</span>
            </div>
            {row("漏服頻率", FREQ[p.missedFreq] || "未填", freqSev(p.missedFreq))}
            {row("漏服原因", p.reasons.length ? p.reasons.map((r) => REASONS[r]).join("、") : "—")}
            {row("怕被看到", p.fearSeen ? p.fearSeen + " / 5" : "—", scoreSev(p.fearSeen))}
            {row("藏藥壓力", p.hidingStress ? p.hidingStress + " / 5" : "—", scoreSev(p.hidingStress))}
            {row("每日服藥心理提醒", p.dailyReminder ? p.dailyReminder + " / 5" : "—", scoreSev(p.dailyReminder))}
            {row("擔心漏藥", p.missWorry ? p.missWorry + " / 5" : "—", scoreSev(p.missWorry))}
            {row("生活影響", p.lifeImpact.length ? p.lifeImpact.map((l) => LIFE[l]).join("、") : "—")}
            {p.difficultyNote && <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "var(--bg)", fontSize: 13, lineHeight: 1.6 }}>個案補充：「{p.difficultyNote}」</div>}
            {p.concern && <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "var(--bg)", fontSize: 13, lineHeight: 1.6 }}>最在意：「{p.concern}」</div>}
          </div>
          <div style={card}>
            <SectionLabel>偏好分布</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {PREF_DIMS.map((d) => (
                <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12.5, color: "var(--muted)", width: 138, flexShrink: 0 }}>{PREF_NAME[d.key]}</span>
                  <div style={{ flex: 1, height: 7, borderRadius: 999, background: "var(--bg)", overflow: "hidden" }}><div style={{ width: (p[d.key] / 5) * 100 + "%", height: "100%", background: p[d.key] >= 4 ? "var(--accent)" : "var(--primary)", transition: "all .3s" }} /></div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)", width: 14 }}>{p[d.key] || 0}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}><PrefSpectrum lean={prefLean(p)} /></div>
          </div>
        </div>
        <div className="col">
          <div style={{ ...card, marginBottom: 16 }}>
            <SectionLabel>檢驗數據</SectionLabel>

            {/* 一、身體測量 */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", marginBottom: 8 }}>① 身體測量</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Inp label="身高 (cm)" value={m.height} onChange={(v) => upd("height", v)} mono />
              <Inp label="體重 (kg)" value={m.weight} onChange={(v) => upd("weight", v)} mono />
              <Inp label="BMI（自動計算）" value={(() => { const h = parseFloat(m.height), w = parseFloat(m.weight); if (!h || !w) return ""; const b = w / Math.pow(h / 100, 2); return isFinite(b) ? b.toFixed(1) : ""; })()} onChange={() => {}} mono />
            </div>

            {/* 二、HIV 病毒量 */}
            <div style={{ height: 1, background: "var(--line)", margin: "18px 0" }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", marginBottom: 8 }}>② HIV 病毒量</div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: "2 1 260px", minWidth: 200 }}>
                <Sel label="近 6 個月內 HIV 病毒量 < 50 copies/mL" value={m.vl} onChange={(v) => upd("vl", v)} opts={["是", "否"]} />
              </div>
              <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                <Inp label="採檢日" value={m.vlDate} onChange={(v) => upd("vlDate", v)} placeholder="YYYY-MM-DD" mono />
              </div>
            </div>

            {/* 三、B 型肝炎 */}
            <div style={{ height: 1, background: "var(--line)", margin: "18px 0" }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", marginBottom: 8 }}>③ B 型肝炎檢驗與疫苗</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Sel label="B 肝表面抗原 HBsAg" value={m.hbsag} onChange={(v) => upd("hbsag", v)} opts={["陰性", "陽性"]} />
              <Inp label="HBsAg 採檢日" value={m.hbsagDate} onChange={(v) => upd("hbsagDate", v)} placeholder="YYYY-MM-DD" mono />
              <Sel label="B 肝表面抗體 Anti-HBs" value={m.antiHbs} onChange={(v) => upd("antiHbs", v)} opts={["陰性", "陽性"]} />
              <Inp label="Anti-HBs 採檢日" value={m.antiHbsDate} onChange={(v) => upd("antiHbsDate", v)} placeholder="YYYY-MM-DD" mono />
              <Sel label="B 肝核心抗體 Anti-HBc" value={m.antiHbc} onChange={(v) => upd("antiHbc", v)} opts={["陰性", "陽性"]} />
              <Inp label="Anti-HBc 採檢日" value={m.antiHbcDate} onChange={(v) => upd("antiHbcDate", v)} placeholder="YYYY-MM-DD" mono />
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
                <Sel label="是否接種 B 肝疫苗" value={m.hbvVaccinated} onChange={(v) => { upd("hbvVaccinated", v); if (v !== "是") upd("hbvDoses", []); else if (!(m.hbvDoses || []).length) upd("hbvDoses", [""]); }} opts={["是", "否"]} />
              </div>
              {m.hbvVaccinated === "是" && (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "var(--bg)", border: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>接種劑次與日期（最多 3 劑）</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(m.hbvDoses && m.hbvDoses.length ? m.hbvDoses : [""]).map((d, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                          <Inp label={`第 ${i + 1} 劑接種日`} value={d || ""} onChange={(val) => { const arr = [...(m.hbvDoses || [])]; arr[i] = val; upd("hbvDoses", arr); }} placeholder="YYYY-MM-DD" mono />
                        </div>
                        {(m.hbvDoses || []).length > 1 && (
                          <button onClick={() => { const arr = (m.hbvDoses || []).filter((_, idx) => idx !== i); upd("hbvDoses", arr.length ? arr : [""]); }} className="sbtn" style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>移除</button>
                        )}
                      </div>
                    ))}
                  </div>
                  {(m.hbvDoses || []).length < 3 && (
                    <button onClick={() => upd("hbvDoses", [...(m.hbvDoses || []), ""])} className="sbtn" style={{ marginTop: 10, padding: "7px 14px", borderRadius: 999, border: "1px dashed var(--primary)", background: "var(--surface)", color: "var(--primary)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>+ 新增劑次</button>
                  )}
                </div>
              )}
            </div>

            {/* 四、其他 */}
            <div style={{ height: 1, background: "var(--line)", margin: "18px 0" }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", marginBottom: 8 }}>④ 其他臨床檢驗</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Sel label="CAB/RPV 抗藥性" value={m.resistance} onChange={(v) => upd("resistance", v)} opts={["無", "疑似", "有"]} />
              <Inp label="抗藥性報告日" value={m.resistDate} onChange={(v) => upd("resistDate", v)} placeholder="YYYY-MM-DD" mono />
              <Sel label="LTBI 狀態" value={m.ltbi} onChange={(v) => upd("ltbi", v)} opts={["IGRA 陰性", "已完成 TB/LTBI 治療"]} />
              <Inp label={m.ltbi === "已完成 TB/LTBI 治療" ? "治療完成日" : "IGRA 檢驗日"} value={m.ltbiDate} onChange={(v) => upd("ltbiDate", v)} placeholder="YYYY-MM-DD" mono />
            </div>
          </div>
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <SectionLabel>適用條件查核</SectionLabel>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: blockers.length ? "var(--red)" : doneCount === 9 ? "var(--green)" : "var(--muted)", fontWeight: 600 }}>{doneCount} / 9</span>
            </div>
            {blockers.length > 0 && (
              <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "var(--red-bg)", fontSize: 13, lineHeight: 1.6, color: "var(--red)" }}>
                <b>依檢驗數據，本案不符合申請條件：</b>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
              </div>
            )}
            {warns.length > 0 && (
              <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "var(--amber-bg)", fontSize: 13, lineHeight: 1.6, color: "#7a5a1e" }}>
                <b>檢驗提醒：</b>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{warns.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {CDC_ITEMS.map((it) => {
                const hint = it.key === "ck_oral" && filled;
                const d = derived[it.key];
                return (
                  <label key={it.key} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "9px 0", cursor: d ? "not-allowed" : "pointer", borderBottom: "1px solid var(--line)", opacity: d && !d.pass ? 0.85 : 1 }}>
                    <input type="checkbox" checked={checks[it.key]} disabled={!!d} onChange={(e) => upd(it.key, e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, accentColor: d && !d.pass ? "var(--red)" : "var(--primary)", flexShrink: 0 }} />
                    <span style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>
                      {it.label}
                      {hint && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>← 個案自評顯示有困難</span>}
                      {d && <span style={{ marginLeft: 8, fontSize: 11, color: d.pass ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{d.pass ? "✓ " : "✗ "}{d.why}（依檢驗值自動判定）</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            <textarea value={m.impression} onChange={(e) => upd("impression", e.target.value)} placeholder="個案管理師臨床印象 / 心理社會評估補充（選填）" style={{ marginTop: 14, width: "100%", minHeight: 64, padding: 12, borderRadius: 10, border: "1px solid var(--line)", fontFamily: "var(--body)", fontSize: 14, resize: "vertical", color: "var(--ink)", background: "var(--surface)", boxSizing: "border-box" }} />
          </div>
        </div>
      </div>

      <div style={{ ...card, marginTop: 16, background: "var(--primary)", borderColor: "transparent" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--display)", fontSize: 19, fontWeight: 600, color: "#fff" }}>送 CDC 審查文件</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", marginTop: 3 }}>整合困境敘明、條件查核（含檢驗值）、處方方案與 SDM 摘要</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {caseId && (
              <button onClick={saveAssessment} className="sbtn" style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.3)", background: saveStatus === "saved" ? "var(--green)" : "transparent", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                {saveStatus === "saving" ? "儲存中…" : saveStatus === "saved" ? "已儲存" : saveStatus === "error" ? "儲存失敗" : "儲存評估"}
              </button>
            )}
            <button onClick={() => setShowDoc(!showDoc)} className="sbtn" style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.3)", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 600 }}>{showDoc ? "收合" : "產生預覽"}</button>
            <button onClick={copy} className="sbtn" style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10, border: "none", background: "#fff", color: "var(--primary)", cursor: "pointer", fontWeight: 700 }}>{copied ? <IconCheck /> : <IconCopy />}{copied ? "已複製" : "複製全文"}</button>
          </div>
        </div>
        {showDoc && <pre style={{ marginTop: 16, marginBottom: 0, padding: 18, borderRadius: 12, background: "#fff", color: "var(--ink)", fontFamily: "var(--body)", fontSize: 13.5, lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 440, overflow: "auto" }}>{doc}</pre>}
      </div>
    </div>
  );
}

/* ── 主元件 ─────────────────────────────────────────────── */
export default function SDMTool() {
  const [mode, setMode] = useState("patient");
  const [patient, setPatient] = useState(initPatient);
  const [manager, setManager] = useState(initManager);
  const [caseId, setCaseId] = useState("");
  const [submitError, setSubmitError] = useState("");

  const handlePatientSubmit = async () => {
    setSubmitError("");
    const id = caseId || makeCaseId();
    try {
      await submitPatientResponse(id, { ...patient, prefLean: prefLean(patient) });
      setCaseId(id);
      setPatient({ ...patient, submitted: true });
    } catch (e) {
      setSubmitError(e.message || "送出失敗，請稍後再試");
    }
  };

  return (
    <div style={{ fontFamily: "var(--body)", color: "var(--ink)", background: "var(--bg)", minHeight: "100%", padding: "0 0 50px", zoom: 1.1 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        :root{
          --bg:#F4F1EA; --surface:#FBFAF6; --ink:#26241E; --muted:#6E695E;
          --line:#E5DECF; --primary:#1E4D45; --primary-soft:#E5EEEB; --accent:#C0613F;
          --green:#5C8A6B; --amber:#CE9A3C; --red:#BC5743;
          --amber-bg:#F6ECD5; --red-bg:#F7E2DD;
          --display:'Fraunces',Georgia,serif; --body:'Manrope',system-ui,sans-serif; --mono:'JetBrains Mono',monospace;
        }
        *{box-sizing:border-box}
        .sbtn:hover{filter:brightness(.97)} .sbtn:active{transform:translateY(1px)}
        .fade{animation:fade .35s ease}
        @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .cols{display:flex;flex-direction:column;gap:16px}
        .col{flex:1;min-width:0}
        .cmp{display:flex;gap:0;align-items:stretch}
        .noscroll::-webkit-scrollbar{height:0}
        @media(min-width:820px){.cols{flex-direction:row;align-items:flex-start}}
        textarea:focus,input:focus,select:focus{outline:none;border-color:var(--primary)}
        ::-webkit-scrollbar{width:8px;height:8px} ::-webkit-scrollbar-thumb{background:var(--line);border-radius:999px}
      `}</style>

      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(244,241,234,.88)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--display)", fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>長效針劑共同決策輔助</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>口服 → 長效針劑（CAB/RPV LA）｜ SDM</div>
          </div>
          <div style={{ display: "flex", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 999, padding: 3 }}>
            {[["patient", "個案端"], ["manager", "個管師端"]].map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)} className="sbtn" style={{ padding: "7px 18px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, background: mode === k ? "var(--primary)" : "transparent", color: mode === k ? "#fff" : "var(--muted)", transition: "all .2s" }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "26px 20px 0" }}>
        {mode === "patient" ? (
          <>
            <PatientFlow p={patient} set={setPatient} onSubmit={handlePatientSubmit} caseId={caseId} setCaseId={setCaseId} />
            {submitError && <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#FBE5DF", color: "var(--red)", fontSize: 13.5 }}>送出時發生問題：{submitError}</div>}
          </>
        ) : (
          <ManagerDashboard p={patient} m={manager} set={setManager} setP={setPatient} caseId={caseId} setCaseId={setCaseId} />
        )}
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px 0" }}>
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 18, fontSize: 12, color: "var(--muted)", lineHeight: 1.75 }}>
          <b style={{ color: "var(--ink)" }}>資料依據</b>：FDA 仿單與 ATLAS、FLAIR、ATLAS-2M 第三期臨床試驗；台灣現行〈抗人類免疫缺乏病毒藥品處方使用規範〉（113/4 版，長效針劑需經 CDC 事前審查、藥費由 CDC 支應）。數字來自臨床研究，實際情形可能因個人狀況與院所而異。<br />
          本工具與台灣愛滋病護理學會（TANA）臨床人員共同發展｜不收集可識別個資｜最後更新：2026 年。
        </div>
      </div>
    </div>
  );
}
