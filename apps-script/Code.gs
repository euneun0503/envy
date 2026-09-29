/**
 * ENVY 견적 문의 백엔드 (Google Apps Script)
 *
 * 하는 일
 *  1) 사이트 견적 폼 → 이 스프레드시트에 한 줄씩 기록
 *  2) 알림 메일을 NOTIFY_EMAILS 로 발송 (답장하면 문의 고객에게 감)
 *  3) 관리자 페이지(/admin/inquiries.html)에서 목록 조회, 상태 변경, 메모 저장
 *
 * 설치 방법은 저장소의 README.md "견적 문의 기록" 항목을 보세요.
 * 관리자 비밀번호는 이 코드에 쓰지 말고
 *   프로젝트 설정(톱니바퀴) → 스크립트 속성 → ADMIN_KEY
 * 에 넣어 주세요.
 */

const NOTIFY_EMAILS = ["envy2927@gmail.com", "naoky0503@gmail.com"];
const SHEET_NAME = "문의";
const TZ = "Asia/Seoul";
const STATUSES = ["신규", "처리중", "처리완료"];

const FIELDS = ["상호명", "담당자", "연락처", "이메일", "포장형태", "담을제품", "사이즈", "제작수량", "인쇄", "희망납기", "받으실지역", "요청사항"];
const HEADERS = ["접수번호", "접수일시", "상태"].concat(FIELDS, ["메모", "처리일시", "유입경로"]);

/* ───────── 진입점 ───────── */

function doGet() {
  return json_({ ok: true, service: "ENVY inquiry" });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || "{}"); }
  catch (err) { return json_({ ok: false, error: "잘못된 요청이에요." }); }

  try {
    switch (body.action) {
      case "submit": return json_(submit_(body.data || {}));
      case "hit":    return json_(hit_(body.data || {}));
      case "stats":  auth_(body.key); return json_(stats_(body.days));
      case "list":   auth_(body.key); return json_(list_());
      case "update": auth_(body.key); return json_(update_(body));
      case "check":  auth_(body.key); return json_({ ok: true });
      default:       return json_({ ok: false, error: "알 수 없는 요청이에요." });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/* ───────── 문의 접수 ───────── */

function submit_(d) {
  if (d._gotcha) return { ok: true };                       // 스팸봇이 채우는 숨은 칸
  const need = ["상호명", "담당자", "연락처", "이메일"].filter((k) => !String(d[k] || "").trim());
  if (need.length) throw new Error(need.join(", ") + " 을(를) 입력해 주세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d["이메일"])) throw new Error("이메일 주소 형식을 확인해 주세요.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let id, when;
  try {
    const sh = sheet_();
    const now = new Date();
    when = Utilities.formatDate(now, TZ, "yyyy-MM-dd HH:mm");
    id = "Q" + Utilities.formatDate(now, TZ, "yyMMdd") + "-" + String(sh.getLastRow()).padStart(4, "0");
    const row = [id, when, "신규"]
      .concat(FIELDS.map((k) => clip_(d[k], k === "요청사항" ? 2000 : 200)))
      .concat(["", "", clip_(d._source, 300)]);
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }

  try { notify_(id, when, d); } catch (err) { console.error("메일 발송 실패", err); }
  return { ok: true, id: id };
}

function notify_(id, when, d) {
  const rows = FIELDS.filter((k) => String(d[k] || "").trim())
    .map((k) => `<tr><th style="text-align:left;padding:6px 12px;background:#f4f6f5;border:1px solid #e5e5e5;white-space:nowrap">${esc_(k)}</th><td style="padding:6px 12px;border:1px solid #e5e5e5">${esc_(d[k]).replace(/\n/g, "<br>")}</td></tr>`)
    .join("");
  const html = `<div style="font-family:sans-serif;font-size:14px;color:#222">
    <p style="margin:0 0 4px;color:#1a8f5c;font-weight:bold">ENVY 견적 문의가 접수됐어요</p>
    <p style="margin:0 0 12px;color:#777">접수번호 ${id} · ${when}</p>
    <table style="border-collapse:collapse">${rows}</table>
    <p style="margin-top:14px;color:#777">이 메일에 답장하면 문의 고객(${esc_(d["이메일"])})에게 바로 전달됩니다.</p></div>`;
  MailApp.sendEmail({
    to: NOTIFY_EMAILS.join(","),
    replyTo: d["이메일"],
    name: "ENVY 견적문의",
    subject: `[견적문의] ${d["상호명"]} · ${d["포장형태"] || "형태 미정"} (${id})`,
    htmlBody: html
  });
}

/* ───────── 방문 기록 ───────── */

const VISIT_SHEET = "방문";
const VISIT_HEADERS = ["일시", "날짜", "방문자", "페이지", "유입", "utm_source", "utm_medium", "utm_campaign", "기기"];

function hit_(d) {
  const vid = String(d.vid || "").slice(0, 40);
  if (!vid) return { ok: true };
  const now = new Date();
  const sh = visitSheet_();
  sh.appendRow([
    Utilities.formatDate(now, TZ, "yyyy-MM-dd HH:mm:ss"),
    Utilities.formatDate(now, TZ, "yyyy-MM-dd"),
    clip_(vid, 40), clip_(d.path, 200), clip_(d.ref, 120),
    clip_(d.us, 80), clip_(d.um, 80), clip_(d.uc, 120),
    d.dev === "mobile" ? "모바일" : "PC"
  ]);
  return { ok: true };
}

function visitSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(VISIT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(VISIT_SHEET);
    sh.appendRow(VISIT_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, VISIT_HEADERS.length).setFontWeight("bold").setBackground("#e8f5ee");
    sh.getRange("A:B").setNumberFormat("@");
  }
  return sh;
}

function stats_(days) {
  days = Math.min(Math.max(Number(days) || 30, 7), 90);
  const today = new Date();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(Utilities.formatDate(new Date(today.getTime() - i * 864e5), TZ, "yyyy-MM-dd"));
  const from = keys[0];
  const byDay = Object.fromEntries(keys.map((k) => [k, { date: k, pv: 0, uv: 0, inq: 0, _v: {} }]));
  const refs = {}, srcs = {}, dev = { "PC": 0, "모바일": 0 }, allV = {};

  const vs = visitSheet_(), n = vs.getLastRow();
  if (n > 1) {
    vs.getRange(2, 2, n - 1, 8).getDisplayValues().forEach((r) => {
      const [date, vid, , ref, us, , , device] = r;
      if (date < from || !byDay[date]) return;
      const b = byDay[date];
      b.pv++;
      if (!b._v[vid]) { b._v[vid] = 1; b.uv++; }
      if (!allV[vid]) {
        allV[vid] = 1;
        dev[device === "모바일" ? "모바일" : "PC"]++;
        const r2 = ref || "직접 방문";
        refs[r2] = (refs[r2] || 0) + 1;
        if (us) srcs[us] = (srcs[us] || 0) + 1;
      }
    });
  }
  const qs = sheet_(), m = qs.getLastRow();
  if (m > 1) {
    qs.getRange(2, 2, m - 1, 1).getDisplayValues().forEach((r) => {
      const d = String(r[0]).slice(0, 10);
      if (byDay[d]) byDay[d].inq++;
    });
  }
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  return {
    ok: true,
    days: keys.map((k) => { const b = byDay[k]; return { date: b.date, pv: b.pv, uv: b.uv, inq: b.inq }; }),
    visitors: Object.keys(allV).length,
    devices: dev,
    referrers: top(refs),
    sources: top(srcs)
  };
}

/* ───────── 관리자 ───────── */

function list_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  const items = last < 2 ? [] : sh.getRange(2, 1, last - 1, HEADERS.length).getDisplayValues()
    .map((r) => Object.fromEntries(HEADERS.map((h, i) => [h, r[i]])))
    .reverse();
  return { ok: true, items: items, sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() };
}

function update_(b) {
  const sh = sheet_();
  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getDisplayValues().map((r) => r[0]);
  const idx = ids.indexOf(String(b.id));
  if (idx < 0) throw new Error("해당 문의를 찾지 못했어요.");
  const row = idx + 2;
  const col = (h) => HEADERS.indexOf(h) + 1;

  if (b.status !== undefined) {
    if (STATUSES.indexOf(b.status) < 0) throw new Error("상태 값이 올바르지 않아요.");
    sh.getRange(row, col("상태")).setValue(b.status);
    sh.getRange(row, col("처리일시")).setValue(b.status === "처리완료" ? Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm") : "");
  }
  if (b.memo !== undefined) sh.getRange(row, col("메모")).setValue(clip_(b.memo, 5000));
  const r = sh.getRange(row, 1, 1, HEADERS.length).getDisplayValues()[0];
  return { ok: true, item: Object.fromEntries(HEADERS.map((h, i) => [h, r[i]])) };
}

function auth_(key) {
  const real = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  if (!real) throw new Error("관리자 비밀번호(ADMIN_KEY)가 아직 설정되지 않았어요.");
  if (String(key || "") !== real) {
    Utilities.sleep(800);
    throw new Error("비밀번호가 맞지 않아요.");
  }
}

/* ───────── 도우미 ───────── */

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#e8f5ee");
    sh.getRange("A:A").setNumberFormat("@");
  }
  return sh;
}

/** 설치할 때 한 번 실행: 시트를 만들고 메일 발송 권한을 승인받습니다. */
function setup() {
  sheet_();
  visitSheet_();
  MailApp.getRemainingDailyQuota();
  const hasKey = !!PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  console.log(hasKey ? "준비 완료" : "스크립트 속성에 ADMIN_KEY(관리자 비밀번호)를 추가해 주세요.");
}

function clip_(v, n) {
  let s = String(v == null ? "" : v).slice(0, n);
  if (/^[=+\-@]/.test(s)) s = "'" + s;                      // 시트 수식으로 해석되지 않게
  return s;
}
function esc_(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
