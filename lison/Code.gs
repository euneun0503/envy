/**
 * 리손패키지 거래처 관리 — 구글 시트 서버 (Apps Script)
 *
 *  - 총정리 탭(리손총정리 또는 총정리): 3행 열 제목(발주일·업체명·품목·내용 및 Spec·수량·단가·금액·출고일·마진금액·마진율·
 *    매입처·규격·수량·단가·금액·비고)과 수식은 그대로 둡니다. 오른쪽 끝에 앱이 쓰는 열만 자동으로 붙습니다.
 *  - 그 밖의 탭(입금내역, 거래처정보, 카드경비, 세금설정, 앱설정, 생산일정, 후가공, 일정변경이력, 공장, 전송기록, 작업사양)은
 *    setup 때 자동으로 만들어집니다. 시트에서 직접 고쳐도 앱이 다시 불러옵니다.
 *  - 도안 이미지와 보낸 작업의뢰서·원장 PDF는 구글 드라이브 폴더에 보관됩니다.
 *
 * 설치: 시트 [확장 프로그램 > Apps Script] → 이 코드 전체 붙여넣기 → 저장 → 함수 setup 실행(권한 허용)
 *       → [배포 > 새 배포 > 웹 앱] 실행: 나, 액세스: 모든 사용자 → 웹 앱 주소를 앱 설정에 입력
 *       → 실행 로그에 나온 비밀번호(API_KEY)를 앱 설정에 입력
 */

const CONFIG = {
  MAIN_SHEETS: ['리손총정리', '총정리'],   // 앞에서부터 찾은 탭을 총정리로 씀
  HEADER_ROW: 3,                         // 열 제목이 있는 행
  DOC_FOLDER: '리손 생산파일',            // 공장에 보낸 작업의뢰서
  CLIENT_FOLDER: '리손 거래처 문서',      // 거래처에 보낸 원장·명세서
  IMG_FOLDER: '리손 작업사양 도안',       // 작업 사양 도안 이미지
  TZ: 'Asia/Seoul'
};

/* 총정리 열: [앱 이름, 시트 열 제목, 같은 제목 중 몇 번째] */
const MAIN_COLS = [
  ['발주일', '발주일', 1], ['업체명', '업체명', 1], ['품목', '품목', 1], ['스펙', '내용 및 Spec', 1],
  ['수량', '수량', 1], ['단가', '단가', 1], ['금액', '금액', 1], ['출고일', '출고일', 1],
  ['마진금액', '마진금액', 1], ['마진율', '마진율', 1],
  ['매입처', '매입처', 1], ['규격', '규격', 1], ['매입수량', '수량', 2], ['매입단가', '단가', 2], ['매입금액', '금액', 2],
  ['비고', '비고', 1],
  // 없으면 오른쪽 끝에 자동으로 붙는 앱용 열
  ['출고수량', '출고수량', 1], ['출고금액', '출고금액', 1], ['납기일', '납기일', 1], ['생산단계', '생산단계', 1], ['생산메모', '생산메모', 1],
  ['세금계산서', '세금계산서', 1], ['발행일', '발행일', 1], ['입금확인', '입금확인', 1], ['입금일', '입금일', 1], ['입금액', '입금액', 1], ['지급확인', '지급확인', 1], ['지급일', '지급일', 1], ['지급액', '지급액', 1], ['단가상태', '단가상태', 1], ['영업담당', '영업담당', 1], ['ID', 'ID', 1]
];
const ADDED_COLS = ['출고수량', '출고금액', '납기일', '생산단계', '생산메모', '세금계산서', '발행일', '입금확인', '입금일', '입금액', '지급확인', '지급일', '지급액', '단가상태', '영업담당', 'ID'];
const DATE_KEYS = ['발주일', '출고일', '발행일', '입금일', '납기일', '지급일'];
const BOOL_KEYS = ['세금계산서', '입금확인', '지급확인'];
const READONLY_KEYS = ['마진금액', '마진율'];

/* 앱용 탭 */
const TABLES = {
  payments: { name: '입금내역', headers: ['ID', '입금일', '업체명', '입금액', '비고', '등록일시'] },
  clients: { name: '거래처정보', headers: ['업체명', '정식상호', '사업자번호', '대표자', '업태', '종목', '주소', '담당자', '연락처', '이메일', '거래조건', '마감일', '이월잔액', '입금자명', '카톡링크', '메모', '영업담당'] },
  expenses: { name: '카드경비', headers: ['ID', '사용일', '사용처', '금액', '분류', '카드', '결제수단', '부가세공제', '불공제사유', '개인용도', '비고', '등록일시'] },
  sched: { name: '생산일정', headers: ['업체명', '발주일', '품목', '현재단계', '납기일', '출고예정', '동판 예정', '동판 완료', '원단입고 예정', '원단입고 완료', '인쇄 예정', '인쇄 완료', '후가공 예정', '후가공 완료', '원단 발주처', '인쇄 공장', '메모', '변경횟수', '변경기록', '수정일시'] },
  posts: { name: '후가공', headers: ['업체명', '발주일', '품목', '순서', '공정', '외주처', '예정일', '완료일', '메모'] },
  history: { name: '일정변경이력', headers: ['일시', '업체명', '발주일', '품목', '구분', '항목', '이전', '변경', '차이(일)', '사유'] },
  factories: { name: '공장', headers: ['공장명', '담당 공정', '담당자', '전화', '팩스', '이메일', '카톡링크', '전송방법', '메모', '정식상호', '사업자번호', '대표자', '주소', '은행', '계좌번호', '예금주'] },
  sends: { name: '전송기록', headers: ['일시', '업체명', '발주일', '품목', '공장', '방법', '받는곳', '문서', 'Rev', '결과', '파일'] },
  buylog: { name: '매입수정기록', headers: ['일시', '줄ID', '매입처', '업체명', '발주일', '품목', '내역', '항목', '이전', '변경', '구분', '사유'] },
  specs: { name: '작업사양', headers: ['업체명', '발주일', '품목', '제품명', '제품규격', '사양', '도안', '수정일시'] },
  claims: { name: '클레임', headers: ['ID', '접수일', '상태', '업체명', '원발주일', '품목', '원줄ID', '불량내용', '불량수량', '책임처', '재납품', '재납품수량', '재납품일', '재생산처', '재생산비', '매출조정', '매출조정액', '수정계산서', '매입조치', '청구액', '메모', '연결줄', '완료일', '등록일시', '수정일시', '원인분석', '재발방지', '작성자', '검토자', '회신일', '회신링크'] }
};
const KV = {
  taxSettings: { name: '세금설정', headers: ['연도', '값'], json: true },
  appSettings: { name: '앱설정', headers: ['이름', '값'], json: false }
};
const STAGES = ['발주', '동판', '원단 입고', '인쇄', '합지·가공', '출고'];
const STEP_KEYS = ['', '동판', '원단입고', '인쇄', '후가공'];

/* ================= 최초 1회 실행 ================= */
function setup() {
  const ss = ss_();
  try { ss.setSpreadsheetTimeZone(CONFIG.TZ); } catch (e) { Logger.log('시간대 설정 건너뜀: ' + e.message); }
  const step = function (label, fn) { try { fn(); } catch (e) { throw new Error(label + ' — ' + e.message); } };
  step('「' + mainSheet_().getName() + '」 탭 3행 오른쪽에 앱용 열 제목 추가', function () { ensureMainCols_(mainSheet_()); });
  Object.keys(TABLES).forEach(function (k) { step('「' + TABLES[k].name + '」 탭 만들기·열 제목 맞추기', function () { ensureTable_(TABLES[k]); }); });
  Object.keys(KV).forEach(function (k) { step('「' + KV[k].name + '」 탭 만들기', function () { ensureTable_(KV[k]); }); });
  step('「' + mainSheet_().getName() + '」 탭 ID 열 채우기', function () { fillMissingIds_(); });
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('API_KEY');
  if (!key) { key = Utilities.getUuid().replace(/-/g, '').slice(0, 12); props.setProperty('API_KEY', key); }
  // 메일·드라이브·트리거 권한을 미리 받아 둠
  try { DriveApp.getRootFolder(); MailApp.getRemainingDailyQuota(); ScriptApp.getProjectTriggers(); } catch (e) { Logger.log('권한 확인: ' + e.message); }
  Logger.log('설정 완료. 마스터 로그인 → 아이디: admin / 비밀번호(API_KEY): ' + key);
  Logger.log('마스터 비밀번호 변경: [프로젝트 설정 > 스크립트 속성]에서 API_KEY 값을 수정하세요. 직원 계정(최대 10개)은 앱의 계정 관리에서 만들어요.');
  return key;
}

/* ================= 시트 메뉴: 코드를 몰라도 설정·비밀번호 확인 ================= */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('리손 앱')
      .addItem('① 처음 설정 (마스터 비밀번호 만들기)', 'setupFromMenu')
      .addItem('마스터 아이디·비밀번호 보기', 'showMasterFromMenu')
      .addItem('보호(잠금) 확인', 'checkProtectionFromMenu')
      .addItem('총정리 탭 고르기 (앱이 읽을 탭)', 'pickMainFromMenu')
      .addToUi();
  } catch (e) {}
}
function setupFromMenu() {
  const ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties();
  const cur = props.getProperty('DATA_SHEET_ID');
  const r = ui.prompt('① 데이터 시트 연결',
    '앱이 읽고 저장할 구글 시트 주소를 붙여넣으세요.\n(예: 리손 테스트 1006 시트 주소 https://docs.google.com/spreadsheets/d/…)\n\n지금 이 시트를 그대로 쓰려면 비워 두고 확인을 누르세요.' + (cur ? '\n\n지금 연결: ' + cur : ''),
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const url = String(r.getResponseText() || '').trim();
  if (url) {
    const id = sheetIdOf_(url);
    if (!id) { ui.alert('시트 주소가 아니에요', '구글 시트 주소(https://docs.google.com/spreadsheets/d/…)를 그대로 붙여넣어 주세요.', ui.ButtonSet.OK); return; }
    let ss; try { ss = SpreadsheetApp.openById(id); } catch (e) { ui.alert('시트를 열 수 없어요', '지금 계정(' + Session.getEffectiveUser().getEmail() + ')이 그 시트의 편집자인지 확인하세요.', ui.ButtonSet.OK); return; }
    props.setProperty('DATA_SHEET_ID', id); SS_CACHE_ = ss;
  }
  let key;
  try { key = setup(); } catch (e) {
    const blocked = protectionReport_();
    ui.alert('설정하지 못했어요', '막힌 단계: ' + e.message +
      (blocked.length ? '\n\n지금 계정(' + Session.getEffectiveUser().getEmail() + ')이 고칠 수 없는 보호:\n· ' + blocked.slice(0, 12).join('\n· ') +
        '\n\n시트 주인 계정에서 [데이터] → [시트 및 범위 보호] → 위 항목마다 [권한 변경]에 이 계정을 추가하거나 보호를 지워 주세요.' : ''), ui.ButtonSet.OK);
    return;
  }
  const m = masterGet_() || {};
  ui.alert('설정 완료',
    '데이터 시트: ' + ss_().getName() + ' (총정리 탭: ' + mainSheet_().getName() + ')\n\n마스터 로그인\n아이디: ' + (m.id || 'admin') + '\n비밀번호: ' + (m.hash ? '(앱에서 바꾼 비밀번호)' : key) +
    '\n\n다음: Apps Script 화면 오른쪽 위 [배포] → [새 배포] → 유형 [웹 앱], 실행: 나, 액세스: 모든 사용자 → 배포 후 나온 웹 앱 주소를 앱 첫 화면에 넣으세요.', ui.ButtonSet.OK);
}
/** 지금 계정이 고칠 수 없는 보호 목록 */
function protectionReport_() {
  const out = [];
  try {
    ss_().getSheets().forEach(function (sh) {
      sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { if (!p.canEdit()) out.push('「' + sh.getName() + '」 탭 전체' + (p.getDescription() ? ' (' + p.getDescription() + ')' : '')); });
      sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { if (!p.canEdit()) { let a1 = ''; try { a1 = p.getRange().getA1Notation(); } catch (e) {} out.push('「' + sh.getName() + '」 ' + a1 + ' 범위' + (p.getDescription() ? ' (' + p.getDescription() + ')' : '')); } });
    });
  } catch (e) { out.push('(보호 목록을 읽지 못했어요: ' + e.message + ')'); }
  return out;
}
function checkProtectionFromMenu() {
  const ui = SpreadsheetApp.getUi(), b = protectionReport_();
  ui.alert('보호 확인', b.length ? '지금 계정(' + Session.getEffectiveUser().getEmail() + ')이 고칠 수 없는 곳:\n· ' + b.join('\n· ') : '막힌 곳이 없어요. [① 처음 설정]을 다시 눌러 보세요.', ui.ButtonSet.OK);
}
function pickMainFromMenu() {
  const ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties();
  let cands = []; try { cands = mainCandidates_().map(function (sh) { return sh.getName(); }); } catch (e) { ui.alert('시트를 열 수 없어요', e.message, ui.ButtonSet.OK); return; }
  let cur = ''; try { cur = mainSheet_().getName(); } catch (e) {}
  const r = ui.prompt('총정리 탭 고르기', '앱이 발주·매출을 읽고 저장할 탭 이름을 그대로 적어 주세요.\n\n지금 쓰는 탭: ' + (cur || '없음') + '\n고를 수 있는 탭: ' + (cands.join(', ') || '없음') + '\n\n비워 두면 자동(올해 연도가 든 탭)으로 돌아가요.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const name = String(r.getResponseText() || '').trim();
  if (name && cands.indexOf(name) < 0) { ui.alert('그런 탭이 없어요', '고를 수 있는 탭: ' + cands.join(', '), ui.ButtonSet.OK); return; }
  if (name) props.setProperty('MAIN_SHEET_NAME', name); else props.deleteProperty('MAIN_SHEET_NAME');
  SS_CACHE_ = null;
  try { ensureMainCols_(mainSheet_()); fillMissingIds_(); } catch (e) { ui.alert('탭은 바꿨지만 열을 맞추지 못했어요', e.message, ui.ButtonSet.OK); return; }
  ui.alert('바꿨어요', '이제 앱은 「' + mainSheet_().getName() + '」 탭을 읽어요. 앱에서 새로고침을 누르세요.', ui.ButtonSet.OK);
}
function showMasterFromMenu() {
  const m = masterGet_() || {}, key = PropertiesService.getScriptProperties().getProperty('API_KEY');
  SpreadsheetApp.getUi().alert('마스터 로그인', key ? '아이디: ' + (m.id || 'admin') + '\n비밀번호: ' + (m.hash ? '앱에서 바꾼 비밀번호를 쓰세요 (잊었으면 로그인 화면의 [비밀번호 재설정])' : key) : '아직 처음 설정을 안 했어요. [리손 앱] → [① 처음 설정]을 먼저 누르세요.', SpreadsheetApp.getUi().ButtonSet.OK);
}

/* ================= 웹 앱 ================= */
function doGet(e) {
  const out = { ok: true, message: '리손패키지 거래처 관리 API 동작 중', ver: 'v4' };
  if (e && e.parameter && e.parameter.check) {
    // 연결 점검: 데이터 내용은 보내지 않고 시트·탭 이름과 줄 수만
    try {
      const ss = ss_(), sh = mainSheet_(), cols = mainCols_(sh), first = CONFIG.HEADER_ROW + 1, last = sh.getLastRow();
      let n = 0, lastDate = '';
      if (last >= first && cols['발주일']) {
        const v = sh.getRange(first, cols['발주일'], last - first + 1, 1).getValues();
        v.forEach(function (r) { const d = r[0]; if (d === '' || d == null) return; n++; const s = d instanceof Date ? Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd') : String(d); if (s > lastDate) lastDate = s; });
      }
      out.sheet = ss.getName(); out.tab = sh.getName(); out.rows = n; out.lastOrder = lastDate.slice(0, 10);
      out.candidates = mainCandidates_().map(function (x) { return x.getName(); });
      out.picked = PropertiesService.getScriptProperties().getProperty('MAIN_SHEET_NAME') || '';
      out.connected = !!PropertiesService.getScriptProperties().getProperty('DATA_SHEET_ID');
      out.colsFound = Object.keys(cols).length;
    } catch (err) { out.ok = false; out.error = String(err.message || err); }
  }
  return json_(out);
}

let reqForLog = null, whoForLog = null;
function doPost(e) {
  reqForLog = null; whoForLog = null; SS_CACHE_ = null;
  const lock = LockService.getScriptLock();
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    reqForLog = req;
    if (req.action === 'login') { const lo = login_(req); logAct_(lo.me, 'login', req, ''); return json_(Object.assign({ ok: true }, lo)); }
    if (req.action === 'resetRequest') { const rr = resetRequest_(req); logAct_({ id: String(req.who || ''), name: '(로그인 전)' }, 'resetRequest', req, ''); return json_(Object.assign({ ok: true }, rr)); }
    if (req.action === 'resetConfirm') { const rc = resetConfirm_(req); logAct_({ id: rc.id, name: '마스터' }, 'resetConfirm', {}, ''); return json_(Object.assign({ ok: true }, rc)); }
    const who = auth_(req); whoForLog = who;
    if (!allowed_(who, req.action)) throw new Error('이 기능은 권한이 없어요. 관리자(마스터)에게 권한을 요청하세요.');
    if (USER_ACTIONS_[req.action]) { const ur = USER_ACTIONS_[req.action](req, who); if (!/^(listUsers|getMaster|listLog)$/.test(req.action)) logAct_(who, req.action, req, ''); return json_(Object.assign({ ok: true }, ur)); }
    if (req.action === 'getImage') return json_(Object.assign({ ok: true }, getImage_(req)));
    lock.waitLock(25000);
    ensureAll_();
    const snap = loadRaw_(req.action === 'load');
    const D = JSON.parse(JSON.stringify(snap.data));
    const A = actions_(D);
    if (!A[req.action]) throw new Error('알 수 없는 요청: ' + req.action);
    if (req.action === 'importMisu') Object.assign(req, misuRows_());
    const result = A[req.action](req) || {};
    if (req.action !== 'restoreOrder') D.orders.forEach(function (o) { if (o.ID && !snap.data.orders.some(function (b) { return b.ID === o.ID; })) delete o._row; });
    if (req.action !== 'load') persist_(snap, D);
    if (req.action !== 'load' && req.action !== 'getImage') logAct_(who, req.action, req, '', function (id) { return D.orders.filter(function (o) { return o.ID === id; })[0] || snap.data.orders.filter(function (o) { return o.ID === id; })[0]; });
    SpreadsheetApp.flush();
    return json_(Object.assign({ ok: true }, result, { data: viewFor_(who, publicData_(loadRaw_(false))), me: meOf_(who) }));
  } catch (err) {
    const out = { ok: false, error: err.message || String(err) };
    try { if (reqForLog && (reqForLog.action === 'login' || (whoForLog && reqForLog.action !== 'load'))) logAct_(whoForLog || { id: String(reqForLog.uid || ''), name: '(로그인 전)' }, reqForLog.action, reqForLog, '실패: ' + out.error); } catch (e2) {}
    if (err.conflict) out.conflict = err.conflict;
    return json_(out);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ================= 공통 계산 (앱과 같은 규칙) ================= */
function pad(x) { return ('0' + x).slice(-2); }
function today() { return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd'); }
function n(v) { var x = Number(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(x) ? 0 : x; }
function isYmd(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || ''); }
function md(d) { if (!isYmd(d)) return d || ''; var p = d.split('-'); return (+p[1]) + '/' + (+p[2]); }
function daysBetween(a, b) { var p = a.split('-'), q = b.split('-'); return Math.round((Date.UTC(+q[0], +q[1] - 1, +q[2]) - Date.UTC(+p[0], +p[1] - 1, +p[2])) / 864e5); }
function sameVal(a, b) { if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b; return String(a == null ? '' : a) === String(b == null ? '' : b); }
function hasShipQty(o) { return o['출고수량'] !== '' && o['출고수량'] != null; }
function supply(o) {
  if (hasShipQty(o) && o['단가'] !== '' && o['단가'] != null) return Math.round(n(o['출고수량']) * n(o['단가']));
  if (o['출고금액'] !== '' && o['출고금액'] != null) return n(o['출고금액']);
  return n(o['금액']);
}
function isSale(o) { return supply(o) !== 0; }
function pkOf(o) { return String(o['품목'] || '').trim(); }
/** 생산일정·후가공·사양·이력 줄이 이 주문 묶음(거래처·발주일·품목)의 것인지 */
function gm(x, co, order, pk) { if (x['업체명'] !== co || x['발주일'] !== order) return false; var xp = String(x['품목'] || '').trim(); return !pk || !xp || xp === pk || xp.indexOf(pk + ' 외') === 0; }
function nowStr_() { return Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'); }

/* ================= 앱과 같은 처리 규칙 (앱의 체험판 엔진을 그대로 씀) ================= */
function actions_(D) {
  var A = engine_(D);
  A.load = function () {};
  A.saveSpec = function (r) { return saveSpec_(D, r); };
  A.saveDoc = function (r) { return saveDoc_(D, r); };
  A.sendDoc = function (r) { return sendDoc_(D, r); };
  A.setDigest = function (r) { return setDigest_(D, r); };
  A.sendDigest = function (r) { return sendDigest_(D, r); };
  A.writeBook = function (r) { return writeBook_(r); };
  return A;
}

/* ---- 아래는 앱(index.html)의 처리 엔진을 그대로 옮긴 것: 앱 화면과 시트 저장이 같은 규칙으로 움직임 ---- */
function engine_(D) {
  var seq = 1;
  function id(p) { var x, used = function (v) { return [D.orders, D.payments, D.expenses].some(function (a) { return (a || []).some(function (o) { return o.ID === v; }); }); }; do { x = (p || 'E') + Date.now().toString(36) + (seq++); } while (used(x)); return x; }
  function calc(o) {
    if (o['단가'] !== '' && o['단가'] != null && o['수량'] !== '' && o['수량'] != null) o['금액'] = Math.round(n(o['수량']) * n(o['단가']));
    if (o['매입단가'] !== '' && o['매입단가'] != null && o['매입수량'] !== '' && o['매입수량'] != null) o['매입금액'] = Math.round(n(o['매입수량']) * n(o['매입단가']));
    o['출고금액'] = (o['출고수량'] !== '' && o['출고수량'] != null && o['단가'] !== '' && o['단가'] != null) ? Math.round(n(o['출고수량']) * n(o['단가'])) : '';
    return o;
  }
  var BUY_LOG_KEYS = ['매입처', '규격', '매입수량', '매입단가', '매입금액'], BUY_LOG_NAME = { '매입처': '매입처', '규격': '품목(내역)', '매입수량': '수량', '매입단가': '단가', '매입금액': '금액' };
  /* 작업사양(JSON) 안의 공장 이름 바꾸기 */
  function specVendorRename(oldV, newV, filter) {
    (D.specs || []).forEach(function (s) {
      if (filter && !filter(s)) return;
      var j; try { j = JSON.parse(s['사양'] || '{}'); } catch (e) { return; }
      var hit = 0;
      (function walk(v) { if (!v || typeof v !== 'object') return; Object.keys(v).forEach(function (k) { if (typeof v[k] === 'string') { if (/^(업체|발주처|외주처)$/.test(k) && v[k] === oldV) { v[k] = newV; hit++; } } else walk(v[k]); }); })(j);
      if (hit) s['사양'] = JSON.stringify(j);
    });
  }
  /* 주문 묶음 키(업체명·발주일·품목)가 바뀌면 생산 일정·후가공·작업사양·전송기록도 따라감 */
  function relinkKey(a, b) {
    [D.sched, D.posts, D.specs || [], D.sends || []].forEach(function (arr) {
      arr.forEach(function (x) { if (x['업체명'] === a.co && x['발주일'] === a.order && String(x['품목'] || '').trim() === a.item) { x['업체명'] = b.co; x['발주일'] = b.order; x['품목'] = b.item; } });
    });
  }
  function blog(o, field, ov, nv, kind, reason) { D.buylog = D.buylog || []; D.buylog.push({ '일시': nowStr(), '줄ID': o.ID, '매입처': o['매입처'] || '', '업체명': o['업체명'], '발주일': o['발주일'], '품목': o['품목'], '내역': o['규격'] || '', '항목': field, '이전': ov == null ? '' : ov, '변경': nv == null ? '' : nv, '구분': kind, '사유': reason || '' }); }
  function find(arr, k, v) { for (var i = 0; i < arr.length; i++) if (arr[i][k] === v) return arr[i]; return null; }
  function nowStr() { return nowStr_(); }
  function hrow(co, order, item, kind, field, ov, nv, reason) {
    var diff = isYmd(ov) && isYmd(nv) ? daysBetween(ov, nv) : '';
    return { '일시': nowStr(), '업체명': co, '발주일': order, '품목': item, '구분': kind, '항목': field, '이전': ov || '', '변경': nv || '', '차이(일)': diff, '사유': reason || '' };
  }
  function mirror(co, order, pk) {
    var sc = D.sched.filter(function (x) { return gm(x, co, order, pk); })[0] || {}, t = today();
    var rows = D.orders.filter(function (o) { return o['업체명'] === co && o['발주일'] === order && (!pk || pkOf(o) === pk); });
    var shipped = rows.some(function (o) { return o['출고일'] && o['출고일'] <= t; }), stage = '출고 대기';
    if (shipped) stage = '출고 완료'; else for (var i = 1; i <= 4; i++) if (!sc[STEP_KEYS[i] + ' 완료']) { stage = STAGES[i]; break; }
    sc['현재단계'] = stage;
    rows.forEach(function (o) { o['생산단계'] = stage; if (sc['납기일'] !== undefined) o['납기일'] = sc['납기일']; });
  }
  var A = {
    load: function () {},
    saveOrder: function (r) {
      var o = r.order;
      if (o.ID ? ('업체명' in o && !o['업체명']) : !o['업체명']) throw new Error('업체명을 입력하세요.');
      if (o.ID ? ('품목' in o && !o['품목']) : !o['품목']) throw new Error('품목을 입력하세요.');
      if (o.ID) {
      var x = find(D.orders, 'ID', o.ID); if (!x) throw new Error('수정할 줄을 찾지 못했습니다.');
      if (r.base && !r.force) {
        var cf = Object.keys(r.base).filter(function (k) { return !sameVal(x[k], r.base[k]) && !sameVal(x[k], o[k]); }).map(function (k) { return { k: k, base: r.base[k], cur: x[k], mine: o[k] }; });
        if (cf.length) { var er = new Error('다른 곳에서 먼저 바뀐 칸이 있습니다.'); er.conflict = cf; throw er; }
      }
      var bb = {}; BUY_LOG_KEYS.forEach(function (k) { bb[k] = x[k]; });
      var oldK = { co: x['업체명'], order: x['발주일'], item: String(x['품목'] || '').trim() };
      Object.assign(x, o); calc(x);
      var newK = { co: x['업체명'], order: x['발주일'], item: String(x['품목'] || '').trim() };
      if (oldK.co !== newK.co || oldK.order !== newK.order || oldK.item !== newK.item) {
        var same = function (y) { return y !== x && y['업체명'] === oldK.co && y['발주일'] === oldK.order && String(y['품목'] || '').trim() === oldK.item; };
        var moved = 0;
        D.orders.forEach(function (y) { if (same(y)) { if (oldK.co !== newK.co) y['업체명'] = newK.co; if (oldK.order !== newK.order) y['발주일'] = newK.order; if (oldK.item !== newK.item) y['품목'] = x['품목']; moved++; } });
        if (!D.orders.some(same)) relinkKey(oldK, newK);
        [['업체명', oldK.co, newK.co], ['발주일', oldK.order, newK.order], ['품목', oldK.item, newK.item]].forEach(function (c) { if (c[1] !== c[2]) D.history.push(hrow(newK.co, newK.order, newK.item, '주문 정보 변경', c[0], c[1], c[2], moved ? '같은 주문 줄 ' + moved + '개도 함께 변경' : '발주 수정')); });
      }
      BUY_LOG_KEYS.forEach(function (k) { if (!sameVal(bb[k], x[k]) && (bb[k] !== '' || x[k] !== '')) blog(x, BUY_LOG_NAME[k], bb[k], x[k], '발주 수정', ''); });
      return { id: o.ID };
    }
      o.ID = id(); o._row = D.orders.length + 4; D.orders.push(calc(o)); return { id: o.ID };
    },
    saveOrders: function (r) {
      var ids = [];
      (r.orders || []).forEach(function (o) { if (!o['업체명'] || !o['품목']) throw new Error('업체명과 품목을 입력하세요.'); o.ID = id(); o._row = D.orders.length + 4; D.orders.push(calc(o)); ids.push(o.ID); });
      return { ids: ids };
    },
    deleteOrder: function (r) { D.orders = D.orders.filter(function (o) { return o.ID !== r.id; }); },
    bulkPayOut: function (r) {
      var before = r.before || '', t = today(), cnt = 0, sum = 0;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) throw new Error('기준일을 넣어주세요.');
      var endNext = function (d) { var p = d.split('-'), x = new Date(+p[0], +p[1] + 1, 0); var s = x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); return s > t ? t : s; };
      D.orders.forEach(function (o) {
        var d = String(o['발주일'] || ''); if (!d || d >= before || o['지급확인'] || !n(o['매입금액']) || !String(o['매입처'] || '').trim()) return;
        o['지급확인'] = true; o['지급일'] = r.rule === 'same' ? d : endNext(d); o['지급액'] = Math.round(n(o['매입금액']) * 1.1); o['단가상태'] = '확정'; cnt++; sum += o['지급액'];
      });
      D.history.push(hrow('-', t, '', '데이터 이전', '지급 상태', '', before + ' 이전 매입 ' + cnt + '줄 지급 완료 (' + sum.toLocaleString('ko-KR') + '원)', r.rule === 'same' ? '발주일 지급' : '다음 달 말일 지급'));
      return { count: cnt, sum: sum };
    },
    importMisu: function (r) {
      var nm = function (s) { return String(s || '').replace(/\(주\)|㈜|주식회사|\s/g, '').replace(/앤/g, '엔'); };
      var items = (r.items || []).map(function (x) { return { d: x.date, co: nm(x.co), it: String(x.item || '').replace(/\s/g, ''), amt: n(x.amt), used: false }; });
      var lump = {}; (r.lumps || []).forEach(function (l) { lump[nm(l.co)] = n(l.amt); });
      var paidN = 0, unpaidN = 0, invN = 0, iso = function (v) { v = String(v == null ? '' : v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; };
      var own = function (o) { var v = o['출고일']; if (iso(v)) return iso(v); return /^\d{2}\/\d{1,2}$|^\d{4}(\.0)?$/.test(String(v == null ? '' : v).trim()) ? o['발주일'] : ''; };
      var gship = {}; D.orders.forEach(function (o) { var s = own(o), k = o['업체명'] + '|' + o['발주일']; if (s && (!gship[k] || s > gship[k])) gship[k] = s; });
      D.orders.forEach(function (o) {
        if (!(supply(o) > 0)) return;
        var ship = own(o) || gship[o['업체명'] + '|' + o['발주일']] || '';
        if (r.invoiceBefore && ship && ship < r.invoiceBefore && !o['세금계산서']) { o['세금계산서'] = true; o['발행일'] = ship; invN++; }
        if (!ship || o['입금확인']) return;
        var c = nm(o['업체명']), it = String(o['품목'] || '').replace(/\s/g, '');
        var hit = !lump[c] && items.filter(function (x) { return !x.used && x.co === c && x.d === o['발주일'] && (x.it === it || x.amt === n(o['금액'])); })[0];
        if (!hit && !lump[c]) hit = items.filter(function (x) { return !x.used && x.co === c && x.amt === n(o['금액']) && x.it === it; })[0];
        if (hit) { hit.used = true; unpaidN++; return; }
        o['입금확인'] = true; o['입금일'] = ship; o['입금액'] = Math.round(supply(o) * 1.1); paidN++;
      });
      Object.keys(r.lumpNames || {}).forEach(function (raw) {
        var amt = lump[nm(raw)]; var c = find(D.clients, '업체명', raw);
        if (!c) { c = { '업체명': raw }; D.clients.push(c); }
        c['이월잔액'] = amt; c['메모'] = ((c['메모'] || '') + ' 미수 총액으로 이전(' + today() + ')').trim();
      });
      D.history.push(hrow('-', today(), '', '데이터 이전', '입금 상태', '', '입금 ' + paidN + '줄 · 미수 ' + unpaidN + '줄 · 계산서 ' + invN + '줄 · 미수 총액 ' + Object.keys(r.lumpNames || {}).length + '곳', '미수관련 탭 기준'));
      return { paid: paidN, unpaid: unpaidN, invoiced: invN, lumps: Object.keys(r.lumpNames || {}).length, unmatched: items.filter(function (x) { return !x.used; }).length };
    },
    saveClaim: function (r) {
      D.claims = D.claims || [];
      var c = r.claim || {}, x = c.ID ? find(D.claims, 'ID', c.ID) : null, isNew = !x;
      if (!c['업체명']) throw new Error('매출거래처를 고르세요.');
      if (!c['품목']) throw new Error('품목을 넣어주세요.');
      if (!x) { x = { ID: id('Q'), '등록일시': nowStr() }; D.claims.push(x); }
      var links = {}; try { links = JSON.parse(x['연결줄'] || '{}'); } catch (e) {}
      var before = x['상태'] || '';
      Object.keys(c).forEach(function (k) { if (k !== 'ID' && k !== '연결줄') x[k] = c[k] == null ? '' : c[k]; });
      var d = x['접수일'] || today(), tag = '클레임 ' + x.ID, item = x['품목'];
      var tv = function (v) { return v === true || v === 'TRUE' || v === 'true'; };
      function up(kind, want, f) {
        var o = links[kind] ? find(D.orders, 'ID', links[kind]) : null;
        if (!want) { if (o && !o['입금확인'] && !o['지급확인']) D.orders = D.orders.filter(function (y) { return y !== o; }); if (!o || (!o['입금확인'] && !o['지급확인'])) delete links[kind]; return; }
        if (!o) { o = { ID: id(), _row: D.orders.length + 4, '입금확인': false, '지급확인': false, '세금계산서': false }; D.orders.push(o); }
        Object.assign(o, { '발주일': d, '업체명': x['업체명'], '스펙': x['불량내용'] || '', '비고': tag, '수량': '', '단가': '', '금액': '', '출고수량': '', '매입처': '', '규격': '', '매입수량': '', '매입단가': '', '매입금액': '' }, f); calc(o); links[kind] = o.ID;
      }
      var sAmt = n(x['매출조정액']), cAmt = n(x['청구액']), rc = n(x['재생산비']);
      up('sale', !!x['매출조정'] && sAmt > 0, { '품목': '[클레임 ' + (x['매출조정'] === '반품' ? '반품' : '차감') + '] ' + item, '수량': 1, '단가': -sAmt, '금액': -sAmt, '출고일': d, '세금계산서': tv(x['수정계산서']), '발행일': tv(x['수정계산서']) ? d : '' });
      up('redo', tv(x['재납품']), { '품목': '[재납품] ' + item, '수량': x['재납품수량'] === '' ? '' : n(x['재납품수량']), '단가': 0, '금액': 0, '출고일': x['재납품일'] || '', '매입처': rc ? (x['재생산처'] || '') : '', '규격': rc ? '재생산 · ' + (x['불량내용'] || '') : '', '매입수량': rc ? 1 : '', '매입단가': rc || '', '매입금액': rc || '' });
      up('charge', x['매입조치'] === '청구' && cAmt > 0 && !!x['책임처'], { '품목': '[클레임 청구] ' + item, '매입처': x['책임처'], '규격': '불량 청구 · ' + (x['불량내용'] || ''), '매입수량': 1, '매입단가': -cAmt, '매입금액': -cAmt, '출고일': d });
      x['연결줄'] = JSON.stringify(links); x['수정일시'] = nowStr();
      if (x['상태'] === '완료' && !x['완료일']) x['완료일'] = today(); if (x['상태'] !== '완료') x['완료일'] = '';
      var acts = [tv(x['재납품']) ? '재납품' : '', sAmt && x['매출조정'] ? x['매출조정'] + ' −' + sAmt.toLocaleString('ko-KR') : '', cAmt && x['매입조치'] === '청구' ? x['책임처'] + ' 청구 −' + cAmt.toLocaleString('ko-KR') : ''].filter(Boolean).join(' · ');
      D.history.push(hrow(x['업체명'], x['원발주일'] || d, item, '클레임', isNew ? '접수' : '수정', isNew ? '' : before, (x['상태'] || '접수') + (acts ? ' · ' + acts : ''), x['불량내용'] || ''));
      return { id: x.ID };
    },
    deleteClaim: function (r) {
      var x = find(D.claims || [], 'ID', r.id); if (!x) throw new Error('클레임을 찾지 못했어요.');
      var links = {}; try { links = JSON.parse(x['연결줄'] || '{}'); } catch (e) {}
      var ids = Object.keys(links).map(function (k) { return links[k]; });
      D.orders = D.orders.filter(function (o) { return ids.indexOf(o.ID) < 0 || o['입금확인'] || o['지급확인']; });
      D.claims = D.claims.filter(function (c) { return c !== x; });
      D.history.push(hrow(x['업체명'], x['원발주일'] || x['접수일'], x['품목'], '클레임', '삭제', x['불량내용'] || '', '', ''));
    },
    deleteBuyLines: function (r) { var gone = {}; (r.lines || []).forEach(function (l) { var o = find(D.orders, 'ID', l.id); if (!o) return; var desc = (o['매입처'] || '') + ' ' + (o['규격'] || '') + ' ' + Math.round(n(o['매입금액'])).toLocaleString('ko-KR') + '원'; blog(o, '매입 삭제', desc, '', '공정 삭제 · ' + (l.step || ''), r.reason || ''); D.history.push(hrow(o['업체명'], o['발주일'], o['품목'], '매입 삭제', (l.step || '') + ' 매입', desc, '', r.reason || '')); if (supply(o)) { ['매입처', '규격', '매입수량', '매입단가', '매입금액'].forEach(function (k) { o[k] = ''; }); o['단가상태'] = ''; calc(o); } else gone[o.ID] = 1; }); D.orders = D.orders.filter(function (o) { return !gone[o.ID]; }); return { count: (r.lines || []).length }; },
    setPaid: function (r) { var o = find(D.orders, 'ID', r.id); o['입금확인'] = !!r.paid; o['입금일'] = r.paid ? r.date : ''; o['입금액'] = r.paid ? (r.amount || Math.round(supply(o) * 1.1)) : ''; },
    setPaidMany: function (r) { r.ids.forEach(function (i) { var o = find(D.orders, 'ID', i); if (o) { o['입금확인'] = true; o['입금일'] = r.date; o['입금액'] = Math.round(supply(o) * 1.1); } }); },
    setBuyStatus: function (r) { (r.ids || []).forEach(function (i) { var o = find(D.orders, 'ID', i); if (!o) return; var was = o['단가상태'] || '예정', now = r.status === '확정' ? '확정' : '예정'; if (was === now) return; o['단가상태'] = now; blog(o, '단가상태', was, now, '단가 ' + now, ''); }); return { count: (r.ids || []).length }; },
    setBuyLine: function (r) { var o = find(D.orders, 'ID', r.id); if (!o) throw new Error('수정할 매입 줄을 찾지 못했습니다.'); var f = r.fields || {}, before = { '규격': o['규격'], '매입수량': o['매입수량'], '매입단가': o['매입단가'], '매입금액': o['매입금액'] }, was = o['단가상태'] || '예정', kind = (was === '확정' || o['지급확인']) ? '확정 후 수정' : '수정'; ['규격', '매입수량', '매입단가', '매입금액'].forEach(function (k) { if (f[k] !== undefined) o[k] = f[k]; }); calc(o); Object.keys(before).forEach(function (k) { if (!sameVal(before[k], o[k])) blog(o, BUY_LOG_NAME[k], before[k], o[k], kind, r.reason || ''); }); var now = r.status === '확정' ? '확정' : '예정'; if (now !== was) { o['단가상태'] = now; blog(o, '단가상태', was, now, '단가 ' + now, r.reason || ''); } else o['단가상태'] = now; return { id: o.ID }; },
    setPayOut: function (r) { (r.ids || []).forEach(function (i) { var o = find(D.orders, 'ID', i); if (!o) return; blog(o, '지급', o['지급확인'] ? '지급 ' + (o['지급일'] || '') : '미지급', r.paid ? '지급 ' + (r.date || today()) + ' ' + Math.round(n(o['매입금액']) * 1.1).toLocaleString('ko-KR') + '원' : '미지급', r.paid ? '지급' : '지급 취소', ''); o['지급확인'] = !!r.paid; o['지급일'] = r.paid ? (r.date || today()) : ''; o['지급액'] = r.paid ? Math.round(n(o['매입금액']) * 1.1) : ''; }); return { count: (r.ids || []).length }; },
    setShip: function (r) { var gs = {}; r.items.forEach(function (it) { var o = find(D.orders, 'ID', it.id); if (!o) return; var k = o['업체명'] + '|' + o['발주일'] + '|' + pkOf(o);
      if (!gs[k]) gs[k] = { co: o['업체명'], order: o['발주일'], item: pkOf(o), before: o['출고일'] || '' };
      o['출고일'] = r.date; o['출고수량'] = it.qty; calc(o); });
      Object.keys(gs).forEach(function (k) { var g = gs[k]; if (g.before !== (r.date || '')) D.history.push(hrow(g.co, g.order, g.item, '진행', '출고', g.before, r.date || '', '')); mirror(g.co, g.order, g.item); }); },
    saveSched: function (r) {
      var co = r.co, order = r.order, f = r.fields || {}, reason = r.reason || '';
      var pk = r.item || '';
      var sc = D.sched.filter(function (x) { return gm(x, co, order, pk); })[0];
      if (!sc) { sc = { '업체명': co, '발주일': order, '품목': pk }; D.sched.push(sc); }
      if (r.item) sc['품목'] = r.item;
      var item = sc['품목'] || '', logs = [];
      var hasPosts = r.posts ? r.posts.length > 0 : D.posts.some(function (p) { return gm(p, co, order, pk); });
      Object.keys(f).forEach(function (k) {
        var nv = f[k] || '', ov = sc[k] || ''; if (nv === ov) return;
        var txt = ['메모', '원단 발주처', '인쇄 공장'].indexOf(k) >= 0;
        if (!txt && nv && nv !== '생략' && !isYmd(nv)) throw new Error(k + ' 날짜가 올바르지 않습니다: ' + nv);
        sc[k] = nv;
        if ((k === '인쇄 공장' || k === '원단 발주처') && ov && nv) specVendorRename(ov, nv, function (s) { return gm(s, co, order, pk); });
        if (k === '메모' || (hasPosts && /^후가공 /.test(k))) return;
        logs.push(hrow(co, order, item, nv === '생략' ? '공정 삭제' : ov === '생략' ? '공정 복구' : txt ? '공정 변경' : /완료$/.test(k) ? '진행' : ov ? '일정 변경' : '일정 등록', (nv === '생략' || ov === '생략') ? k.replace(/ 완료$/, '').replace('원단입고', '원단 입고') : k === '출고예정' ? '출고 예정' : k, ov, nv, reason));
      });
      if (r.posts) {
        var left = D.posts.filter(function (p) { return gm(p, co, order, pk); }).sort(function (a, b) { return a['순서'] - b['순서']; });
        D.posts = D.posts.filter(function (p) { return !gm(p, co, order, pk); });
        r.posts.forEach(function (p, i) {
          var np = { '업체명': co, '발주일': order, '품목': pk, '순서': i + 1, '공정': p['공정'], '외주처': p['외주처'] || '', '예정일': p['예정일'] || '', '완료일': p['완료일'] || '', '메모': p['메모'] || '' };
          D.posts.push(np);
          var j = -1; left.some(function (o, x) { if (o['공정'] === np['공정']) { j = x; return true; } return false; });
          var lb = '후가공·' + np['공정'];
          if (j < 0) { logs.push(hrow(co, order, item, '공정 추가', lb, '', np['예정일'], reason)); return; }
          var o = left.splice(j, 1)[0];
          if ((o['예정일'] || '') !== np['예정일']) logs.push(hrow(co, order, item, o['예정일'] ? '일정 변경' : '일정 등록', lb + ' 예정', o['예정일'] || '', np['예정일'], reason));
          if ((o['완료일'] || '') !== np['완료일']) logs.push(hrow(co, order, item, '진행', lb + ' 완료', o['완료일'] || '', np['완료일'], reason));
          if ((o['외주처'] || '') !== np['외주처']) logs.push(hrow(co, order, item, '공정 변경', lb + ' 외주처', o['외주처'] || '', np['외주처'], reason));
        });
        left.forEach(function (o) { logs.push(hrow(co, order, item, '공정 삭제', '후가공·' + o['공정'], o['예정일'] || '', '', reason)); });
      }
      var chg = logs.filter(function (l) { return l['구분'] === '일정 변경' || l['구분'] === '공정 삭제'; }), rev = +(sc['변경횟수'] || 0);
      if (chg.length) {
        rev++; sc['변경횟수'] = rev;
        var sh = function (v) { return isYmd(v) ? md(v) : (v || '없음'); };
        sc['변경기록'] = (md(today()) + ' Rev.' + rev + ' ' + chg.map(function (l) { return l['항목'] + ' ' + sh(l['이전']) + '→' + sh(l['변경']) + (l['차이(일)'] !== '' ? '(' + (l['차이(일)'] > 0 ? '+' : '') + l['차이(일)'] + '일)' : ''); }).join(', ') + (reason ? ' · ' + reason : '') + (sc['변경기록'] ? '\n' + sc['변경기록'] : '')).slice(0, 4000);
      }
      sc['수정일시'] = nowStr();
      D.history = D.history.concat(logs);
      mirror(co, order, pk);
      return { logged: logs.length, rev: rev, revised: chg.length > 0 };
    },
    saveSpec: function (r) {
      D.specs = D.specs || []; D.mimg = D.mimg || {};
      var x = D.specs.filter(function (o) { return gm(o, r.co, r.order, r.item); })[0];
      if (!x) { x = { '업체명': r.co, '발주일': r.order, '품목': r.item || '' }; D.specs.push(x); }
      if (r.item) x['품목'] = r.item;
      var img = x['도안'] || '';
      if (r.removeImage) img = '';
      if (r.imageId !== undefined && !r.image && !r.removeImage) img = r.imageId;
      if (r.image && r.image.b64) { img = 'M' + id(); D.mimg[img] = { b64: r.image.b64, mime: r.image.mime || 'image/jpeg' }; }
      var sp = JSON.parse(r.spec || '{}');
      if (x['사양']) D.history.push(hrow(r.co, r.order, r.item || '', '사양 변경', '작업 사양', '', '수정', ''));
      Object.assign(x, { '제품명': sp.제품명 || '', '제품규격': sp.제품규격 || '', '사양': r.spec, '도안': img, '수정일시': nowStr() });
      return { image: img };
    },
    getImage: function (r) { var m = (D.mimg || {})[r.id]; return m ? { b64: m.b64, mime: m.mime } : {}; },
    saveFactory: function (r) {
      var f = r.factory, old = r.oldName || f['공장명'];
      if (!f['공장명']) throw new Error('공장 이름을 입력하세요.');
      if (old !== f['공장명'] && find(D.factories, '공장명', f['공장명'])) throw new Error('같은 이름의 공장이 이미 있습니다.');
      var x = find(D.factories, '공장명', old); if (x) Object.assign(x, f); else D.factories.push(f);
      if (old !== f['공장명']) { specVendorRename(old, f['공장명']); (D.buylog || []).forEach(function (b) { if (b['매입처'] === old) b['매입처'] = f['공장명']; }); (D.sends || []).forEach(function (s) { if (s['공장'] === old) s['공장'] = f['공장명']; }); D.sched.forEach(function (s) { ['원단 발주처', '인쇄 공장'].forEach(function (k) { if (s[k] === old) s[k] = f['공장명']; }); }); D.posts.forEach(function (p) { if (p['외주처'] === old) p['외주처'] = f['공장명']; }); D.orders.forEach(function (o) { if (String(o['매입처'] || '').trim() === old) o['매입처'] = f['공장명']; }); }
    },
    deleteFactory: function (r) { D.factories = D.factories.filter(function (f) { return f['공장명'] !== r.name; }); },
    saveDoc: function (r) { D.sends.push({ '일시': nowStr(), '업체명': r.co, '발주일': r.order, '품목': r.item || '', '공장': r.factory, '방법': r.method || '보관', '받는곳': r.share ? '링크' : '', '문서': r.file.name, 'Rev': r.rev, '결과': '체험판 보관', '파일': '' }); return { url: '' }; },
    sendDoc: function (r) {
      var to = r.to; if (r.method === 'fax') to = ((D.appSettings || {}).faxGateway || '{국제번호}@fax.plus').replace('{국제번호}', '+82' + String(r.to).replace(/\D/g, '').replace(/^0/, '')).replace('{번호}', String(r.to).replace(/\D/g, ''));
      D.sends.push({ '일시': nowStr(), '업체명': r.co, '발주일': r.order, '품목': r.item || '', '공장': r.factory, '방법': r.method === 'fax' ? '팩스' : '이메일', '받는곳': to, '문서': r.file.name, 'Rev': r.rev, '결과': '체험판(실제 전송 안 함)', '파일': '' });
      return { to: to };
    },
    setInvoice: function (r) { var o = find(D.orders, 'ID', r.id); o['세금계산서'] = !!r.issued; o['발행일'] = r.issued ? r.date : ''; },
    setInvoiceMany: function (r) { (r.items || []).forEach(function (it) { var o = find(D.orders, 'ID', it.id); if (!o) return; o['세금계산서'] = !r.off; o['발행일'] = r.off ? '' : (it.date || today()); }); return { count: (r.items || []).length }; },
    setDigest: function (r) { D.appSettings = D.appSettings || {}; D.appSettings.digest = JSON.stringify({ on: !!r.on, hour: r.hour, to: r.to, weekend: !!r.weekend }); return {}; },
    sendDigest: function (r) { return { to: r.to || '시트 주인', preview: true }; },
    savePayment: function (r) { var p = r.payment; p.ID = id('P'); p['입금액'] = n(p['입금액']); D.payments.push(p); return { id: p.ID }; },
    restoreOrder: function (r) {
      if (find(D.orders, 'ID', r.order.ID)) return { id: r.order.ID };
      var o = JSON.parse(JSON.stringify(r.order)), at = D.orders.findIndex(function (x) { return (x._row || 0) >= (r.row || 1e9); });
      if (at < 0) D.orders.push(calc(o)); else D.orders.splice(at, 0, calc(o));
      return { id: o.ID };
    },
    deletePayment: function (r) { D.payments = D.payments.filter(function (p) { return p.ID !== r.id; }); },
    saveClient: function (r) {
      var c = r.client, old = r.oldName || c['업체명'], x = find(D.clients, '업체명', old);
      if (old !== c['업체명']) [D.sched, D.posts, D.history, D.specs || [], D.sends || [], D.buylog || []].forEach(function (arr) { arr.forEach(function (o) { if (o['업체명'] === old) o['업체명'] = c['업체명']; }); });
      if (x) Object.assign(x, c); else D.clients.push(c);
      if (old !== c['업체명']) { D.orders.forEach(function (o) { if (o['업체명'] === old) o['업체명'] = c['업체명']; }); D.payments.forEach(function (p) { if (p['업체명'] === old) p['업체명'] = c['업체명']; }); }
    },
    deleteClient: function (r) { D.clients = D.clients.filter(function (c) { return c['업체명'] !== r.name; }); },
    importClients: function (r) { (r.clients || []).forEach(function (c) { if (!c['업체명']) return; var x = find(D.clients, '업체명', c['업체명']); if (x) Object.assign(x, c); else D.clients.push(c); }); return { count: (r.clients || []).length }; },
    importFactories: function (r) { (r.factories || []).forEach(function (f) { if (!f['공장명']) return; var x = find(D.factories, '공장명', f['공장명']); if (x) Object.assign(x, f); else D.factories.push(f); }); return { count: (r.factories || []).length }; },
    saveExpense: function (r) { var e = r.expense; if (e.ID) { Object.assign(find(D.expenses, 'ID', e.ID), e); return { id: e.ID }; } e.ID = id('C'); e['등록일시'] = new Date().toISOString(); D.expenses.push(e); return { id: e.ID }; },
    saveExpenses: function (r) { r.items.forEach(function (e) { e.ID = id('C'); e['등록일시'] = new Date().toISOString(); D.expenses.push(e); }); return { count: r.items.length }; },
    deleteExpenses: function (r) { D.expenses = D.expenses.filter(function (e) { return r.ids.indexOf(e.ID) < 0; }); },
    saveTaxSettings: function (r) { D.taxSettings = D.taxSettings || {}; D.taxSettings[r.year] = r.settings; },
    writeBook: function (r) { return { sheet: '간편장부 ' + r.year, count: r.rows.length - 4 }; },
    saveAppSetting: function (r) { D.appSettings = D.appSettings || {}; D.appSettings[r.name] = r.value; }
  };
  return A;
}

/* ================= 탭 준비 ================= */
let SS_CACHE_ = null;
/** 데이터 시트: 마스터가 연결한 시트(스크립트 속성 DATA_SHEET_ID) — 없으면 이 스크립트가 붙어 있는 시트 */
function ss_() {
  if (SS_CACHE_) return SS_CACHE_;
  const id = PropertiesService.getScriptProperties().getProperty('DATA_SHEET_ID');
  SS_CACHE_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
  return SS_CACHE_;
}
function sheetIdOf_(s) { const m = String(s || '').match(/\/d\/([a-zA-Z0-9_-]{20,})/) || String(s || '').match(/^([a-zA-Z0-9_-]{20,})$/); return m ? m[1] : ''; }
/** 3행에 발주일·업체명·품목 열 제목이 있는 탭들 */
function mainCandidates_() {
  const out = [];
  ss_().getSheets().forEach(function (sh) {
    if (sh.getLastRow() < CONFIG.HEADER_ROW) return;
    const h = sh.getRange(CONFIG.HEADER_ROW, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0];
    if (h.indexOf('발주일') >= 0 && h.indexOf('업체명') >= 0 && h.indexOf('품목') >= 0) out.push(sh);
  });
  return out;
}
function mainSheet_() {
  const ss = ss_();
  // 1) 마스터가 고른 탭  2) 리손총정리·총정리  3) 올해 연도가 이름에 든 탭(예: 2026년)  4) 3행 열 제목이 맞는 첫 탭
  const pick = PropertiesService.getScriptProperties().getProperty('MAIN_SHEET_NAME');
  if (pick) { const p = ss.getSheetByName(pick); if (p) return p; }
  for (let i = 0; i < CONFIG.MAIN_SHEETS.length; i++) { const s = ss.getSheetByName(CONFIG.MAIN_SHEETS[i]); if (s) return s; }
  const cands = mainCandidates_(), yr = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy');
  const thisYear = cands.filter(function (sh) { return sh.getName().indexOf(yr) >= 0; });
  if (thisYear.length) return thisYear[0];
  if (cands.length) return cands[0];
  throw new Error("총정리 탭을 찾지 못했습니다. 탭 이름을 '" + CONFIG.MAIN_SHEETS[0] + "'로 하거나 3행에 발주일·업체명·품목 열 제목을 두세요.");
}
function ensureAll_() {
  ensureMainCols_(mainSheet_());
  Object.keys(TABLES).forEach(function (k) { ensureTable_(TABLES[k]); });
  Object.keys(KV).forEach(function (k) { ensureTable_(KV[k]); });
}
function ensureTable_(T) {
  const ss = ss_();
  let sh = ss.getSheetByName(T.name);
  if (!sh) {
    sh = ss.insertSheet(T.name);
    sh.getRange(1, 1, 1, T.headers.length).setValues([T.headers]).setFontWeight('bold').setBackground('#ddebf7');
    sh.setFrozenRows(1);
    return sh;
  }
  const last = Math.max(1, sh.getLastColumn());
  const have = sh.getRange(1, 1, 1, last).getDisplayValues()[0];
  const missing = T.headers.filter(function (h) { return have.indexOf(h) < 0; });
  if (missing.length) {
    const start = have.filter(String).length ? last + 1 : 1;
    sh.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#ddebf7');
  }
  return sh;
}
function mainHeader_(sh) {
  const last = Math.max(1, sh.getLastColumn());
  return sh.getRange(CONFIG.HEADER_ROW, 1, 1, last).getDisplayValues()[0].map(function (x) { return String(x).trim(); });
}
function ensureMainCols_(sh) {
  const h = mainHeader_(sh);
  const missing = ADDED_COLS.filter(function (c) { return h.indexOf(c) < 0; });
  if (!missing.length) return;
  let lastUsed = 0; h.forEach(function (x, i) { if (x) lastUsed = i + 1; });
  sh.getRange(CONFIG.HEADER_ROW, lastUsed + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#e2efda');
}
/** 앱 이름 → 열 번호(1부터) */
function mainCols_(sh) {
  const h = mainHeader_(sh), cols = {};
  MAIN_COLS.forEach(function (c) {
    let seen = 0;
    for (let i = 0; i < h.length; i++) if (h[i] === c[1] && ++seen === c[2]) { cols[c[0]] = i + 1; break; }
  });
  return cols;
}

/* ================= 읽기 ================= */
function cellOut_(v) {
  if (v instanceof Date) {
    const hasTime = v.getHours() || v.getMinutes() || v.getSeconds();
    return Utilities.formatDate(v, CONFIG.TZ, hasTime ? 'yyyy-MM-dd HH:mm:ss' : 'yyyy-MM-dd');
  }
  return v;
}
function readMain_() {
  const sh = mainSheet_(), cols = mainCols_(sh), first = CONFIG.HEADER_ROW + 1, last = sh.getLastRow();
  const width = Math.max(1, sh.getLastColumn());
  const rows = [];
  if (last >= first) {
    const rng = sh.getRange(first, 1, last - first + 1, width);
    const vals = rng.getValues();
    vals.forEach(function (r, i) {
      const o = { _row: first + i };
      Object.keys(cols).forEach(function (k) {
        let v = cellOut_(r[cols[k] - 1]);
        if (BOOL_KEYS.indexOf(k) >= 0) v = v === true || v === 'TRUE' || v === 'O' || v === 'o' || v === '✔';
        else if (DATE_KEYS.indexOf(k) >= 0 && typeof v === 'string') v = v.trim();
        o[k] = v;
      });
      if (!o['업체명'] && !o['품목'] && !o['발주일'] && o['금액'] === '' && o['매입금액'] === '') return;
      rows.push(o);
    });
  }
  return { sheet: sh, cols: cols, rows: rows };
}
function readTable_(T) {
  const sh = ss_().getSheetByName(T.name);
  const lastR = sh.getLastRow(), lastC = Math.max(1, sh.getLastColumn());
  const head = sh.getRange(1, 1, 1, lastC).getDisplayValues()[0].map(function (x) { return String(x).trim(); });
  const out = [];
  if (lastR >= 2) {
    sh.getRange(2, 1, lastR - 1, lastC).getValues().forEach(function (r) {
      if (r.every(function (v) { return v === '' || v === null; })) return;
      const o = {};
      head.forEach(function (h, i) { if (h) o[h] = cellOut_(r[i]); });
      out.push(o);
    });
  }
  return { sheet: sh, head: head, rows: out };
}
/** 시트 전체 → 앱 데이터 (+ 쓰기용 원본) */
function loadRaw_(fixIds) {
  if (fixIds) fillMissingIds_();
  const main = readMain_();
  const data = { orders: main.rows };
  const tabs = {};
  Object.keys(TABLES).forEach(function (k) { const t = readTable_(TABLES[k]); data[k] = t.rows; tabs[TABLES[k].name] = t.sheet.getSheetId(); });
  Object.keys(KV).forEach(function (k) {
    const t = readTable_(KV[k]), o = {};
    t.rows.forEach(function (r) { const nm = String(r[KV[k].headers[0]] || '').trim(); if (!nm) return; let v = r[KV[k].headers[1]]; if (KV[k].json) { try { v = JSON.parse(v); } catch (e) {} } o[nm] = v; });
    data[k] = o; tabs[KV[k].name] = t.sheet.getSheetId();
  });
  ['payments', 'expenses'].forEach(function (k) { data[k].forEach(function (r) { r['금액'] !== undefined && k === 'expenses' && (r['금액'] = r['금액'] === '' ? '' : n(r['금액'])); }); });
  data.payments.forEach(function (p) { p['입금액'] = p['입금액'] === '' ? '' : n(p['입금액']); });
  tabs[main.sheet.getName()] = main.sheet.getSheetId();
  return { data: data, cols: main.cols, sheet: main.sheet, tabs: tabs };
}
function publicData_(snap) {
  const d = snap.data;
  d.tabs = snap.tabs;
  d.sheetUrl = ss_().getUrl();
  return d;
}
/** 시트에 직접 쓴 줄에 ID 붙이기 */
function fillMissingIds_() {
  const sh = mainSheet_(), cols = mainCols_(sh), first = CONFIG.HEADER_ROW + 1, last = sh.getLastRow();
  if (last < first || !cols.ID) return;
  const n = last - first + 1;
  const vals = sh.getRange(first, 1, n, Math.max(cols.ID, cols['품목'], cols['업체명'])).getValues();
  const ids = vals.map(function (r) { return [r[cols.ID - 1]]; });
  let changed = false, seq = 0;
  vals.forEach(function (r, i) {
    if (ids[i][0]) return;
    if (!r[cols['업체명'] - 1] && !r[cols['품목'] - 1]) return;
    ids[i][0] = 'E' + Date.now().toString(36) + 's' + (seq++); changed = true;
  });
  if (changed) sh.getRange(first, cols.ID, n, 1).setValues(ids);
}

/* ================= 쓰기 ================= */
function cellIn_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' && (/^0\d+$/.test(v) || /^[=+]/.test(v))) return "'" + v;
  return v;
}
function persist_(snap, D) {
  persistMain_(snap, D.orders);
  Object.keys(TABLES).forEach(function (k) { persistTable_(TABLES[k], snap.data[k], D[k]); });
  Object.keys(KV).forEach(function (k) {
    if (JSON.stringify(snap.data[k] || {}) === JSON.stringify(D[k] || {})) return;
    const rows = Object.keys(D[k] || {}).map(function (nm) { const v = D[k][nm]; return { [KV[k].headers[0]]: nm, [KV[k].headers[1]]: KV[k].json || typeof v !== 'string' ? JSON.stringify(v) : v }; });
    writeTable_(KV[k], rows, true);
  });
}
function persistTable_(T, before, after) {
  after = after || [];
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  // 뒤에 덧붙이기만 했으면 그 줄만 추가 (이력처럼 계속 쌓이는 탭)
  const prefix = after.length > before.length && JSON.stringify(after.slice(0, before.length)) === JSON.stringify(before);
  writeTable_(T, prefix ? after.slice(before.length) : after, !prefix);
}
function writeTable_(T, rows, replace) {
  const sh = ss_().getSheetByName(T.name);
  let head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0].map(function (x) { return String(x).trim(); });
  // 처음 보는 항목은 오른쪽에 열 추가 (내용을 잃지 않게)
  const extra = [];
  rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (k.charAt(0) !== '_' && head.indexOf(k) < 0 && extra.indexOf(k) < 0) extra.push(k); }); });
  if (extra.length) {
    const start = head.filter(String).length ? head.length + 1 : 1;
    sh.getRange(1, start, 1, extra.length).setValues([extra]).setFontWeight('bold').setBackground('#ddebf7');
    head = head.filter(String).length ? head.concat(extra) : extra;
  }
  const width = head.length;
  const values = rows.map(function (r) { return head.map(function (h) { return h ? cellIn_(r[h]) : ''; }); });
  if (replace) {
    const lastR = sh.getLastRow();
    if (lastR >= 2) sh.getRange(2, 1, lastR - 1, width).clearContent();
    if (values.length) sh.getRange(2, 1, values.length, width).setValues(values);
  } else if (values.length) {
    sh.getRange(sh.getLastRow() + 1, 1, values.length, width).setValues(values);
  }
}
function colLetter_(c) { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
/** 총정리: 바뀐 칸만 고치고, 지운 줄은 지우고, 새 줄은 맨 아래(되살리기는 원래 자리)에 */
function persistMain_(snap, after) {
  const sh = snap.sheet, cols = snap.cols, before = snap.data.orders;
  const byId = {}; before.forEach(function (o) { if (o.ID) byId[o.ID] = o; });
  const afterIds = {}; after.forEach(function (o) { if (o.ID) afterIds[o.ID] = 1; });
  const writable = Object.keys(cols).filter(function (k) { return READONLY_KEYS.indexOf(k) < 0 && k !== 'ID'; });

  // 1) 고친 줄: 바뀐 칸만
  after.forEach(function (o) {
    const b = byId[o.ID]; if (!b) return;
    writable.forEach(function (k) {
      if (o[k] === undefined || sameCell_(b[k], o[k])) return;
      const cell = sh.getRange(b._row, cols[k]);
      if ((k === '금액' || k === '매입금액') && cell.getFormula()) {
        const q = k === '금액' ? ['수량', '단가'] : ['매입수량', '매입단가'];
        if (o[q[0]] !== '' && o[q[1]] !== '' && Math.round(n(o[q[0]]) * n(o[q[1]])) === n(o[k])) return; // 수식이 같은 값을 계산함
      }
      cell.setValue(cellIn_(o[k]));
    });
  });
  // 2) 지운 줄 (아래부터)
  before.filter(function (o) { return o.ID && !afterIds[o.ID]; }).sort(function (a, b) { return b._row - a._row; })
    .forEach(function (o) { sh.deleteRow(o._row); });
  // 3) 새 줄
  const news = after.filter(function (o) { return !o.ID || !byId[o.ID]; });
  if (!news.length) return;
  let lastData = CONFIG.HEADER_ROW;
  const remaining = before.filter(function (o) { return afterIds[o.ID]; });
  const deletedBelow = function (row) { return before.filter(function (o) { return o.ID && !afterIds[o.ID] && o._row < row; }).length; };
  remaining.forEach(function (o) { const r = o._row - deletedBelow(o._row); if (r > lastData) lastData = r; });
  news.forEach(function (o) {
    let row;
    const isRestore = o._row && remaining.some(function (x) { return x._row >= o._row; });
    if (isRestore) { row = Math.max(CONFIG.HEADER_ROW + 1, o._row); sh.insertRowBefore(row); lastData++; }
    else { lastData++; row = lastData; if (row > sh.getMaxRows()) sh.insertRowAfter(sh.getMaxRows()); }
    writeNewRow_(sh, cols, row, o);
  });
}
function sameCell_(a, b) {
  if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b;
  const sa = String(a == null ? '' : a), sb = String(b == null ? '' : b);
  if (sa === sb) return true;
  if (sa !== '' && sb !== '' && !isNaN(Number(sa.replace(/,/g, ''))) && !isNaN(Number(sb.replace(/,/g, '')))) return Number(sa.replace(/,/g, '')) === Number(sb.replace(/,/g, ''));
  return false;
}
function writeNewRow_(sh, cols, row, o) {
  const width = Math.max.apply(null, Object.keys(cols).map(function (k) { return cols[k]; }));
  if (row - 1 > CONFIG.HEADER_ROW) sh.getRange(row - 1, 1, 1, width).copyTo(sh.getRange(row, 1, 1, width), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  const rng = sh.getRange(row, 1, 1, width);
  const cur = rng.getValues()[0];
  Object.keys(cols).forEach(function (k) { if (READONLY_KEYS.indexOf(k) < 0 && o[k] !== undefined) cur[cols[k] - 1] = cellIn_(o[k]); });
  rng.setValues([cur]);
  const L = function (k) { return colLetter_(cols[k]) + row; };
  // 금액·매입금액은 엑셀처럼 수식으로, 마진은 위 줄 수식을 이어 씀
  if (cols['금액'] && cols['수량'] && cols['단가'] && o['수량'] !== '' && o['단가'] !== '' && o['수량'] != null && o['단가'] != null) sh.getRange(L('금액')).setFormula('=' + L('수량') + '*' + L('단가'));
  if (cols['매입금액'] && cols['매입수량'] && cols['매입단가'] && o['매입수량'] !== '' && o['매입단가'] !== '' && o['매입수량'] != null && o['매입단가'] != null) sh.getRange(L('매입금액')).setFormula('=' + L('매입단가') + '*' + L('매입수량'));
  ['마진금액', '마진율'].forEach(function (k) {
    if (!cols[k]) return;
    for (let r = row - 1; r > CONFIG.HEADER_ROW; r--) { const f = sh.getRange(r, cols[k]).getFormulaR1C1(); if (f) { sh.getRange(row, cols[k]).setFormulaR1C1(f); break; } if (row - r > 30) break; }
  });
  BOOL_KEYS.forEach(function (k) { if (cols[k]) { const c = sh.getRange(row, cols[k]); c.insertCheckboxes(); c.setValue(!!o[k]); } });
}

/* ================= 작업 사양 · 도안 ================= */
function folder_(name, sub) {
  let it = DriveApp.getFoldersByName(name), f = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  if (sub) { const s = String(sub).replace(/[\\\/]/g, '_'); it = f.getFoldersByName(s); f = it.hasNext() ? it.next() : f.createFolder(s); }
  return f;
}
function saveSpec_(D, r) {
  D.specs = D.specs || [];
  let x = D.specs.filter(function (o) { return gm(o, r.co, r.order, r.item); })[0];
  if (!x) { x = { '업체명': r.co, '발주일': r.order, '품목': r.item || '' }; D.specs.push(x); }
  if (r.item) x['품목'] = r.item;
  let img = x['도안'] || '';
  if (r.removeImage) img = '';
  if (r.imageId !== undefined && !r.image && !r.removeImage) img = r.imageId;
  if (r.image && r.image.b64) {
    const blob = Utilities.newBlob(Utilities.base64Decode(r.image.b64), r.image.mime || 'image/jpeg', (r.image.name || '도안.jpg'));
    const file = folder_(CONFIG.IMG_FOLDER, r.co).createFile(blob).setName(r.order + '_' + (r.image.name || '도안.jpg'));
    img = file.getId();
  }
  const sp = JSON.parse(r.spec || '{}');
  if (x['사양']) D.history.push({ '일시': nowStr_(), '업체명': r.co, '발주일': r.order, '품목': r.item || '', '구분': '사양 변경', '항목': '작업 사양', '이전': '', '변경': '수정', '차이(일)': '', '사유': '' });
  Object.assign(x, { '제품명': sp.제품명 || '', '제품규격': sp.제품규격 || '', '사양': r.spec, '도안': img, '수정일시': nowStr_() });
  return { image: img };
}
function getImage_(r) {
  if (!r.id) return {};
  try { const b = DriveApp.getFileById(r.id).getBlob(); return { b64: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() }; }
  catch (e) { return {}; }
}

/* ================= 문서 보관 · 메일 · 팩스 ================= */
function mimeOf_(name) {
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.xlsx$/i.test(name)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  return 'application/octet-stream';
}
function blobOf_(f) { return Utilities.newBlob(Utilities.base64Decode(f.b64), mimeOf_(f.name), f.name); }
function keepFile_(r, f) {
  const fol = r.folder === 'client' ? folder_(CONFIG.CLIENT_FOLDER, r.co) : folder_(CONFIG.DOC_FOLDER, (r.co || '') + (r.order ? '_' + r.order : ''));
  return fol.createFile(blobOf_(f));
}
function saveDoc_(D, r) {
  let url = '';
  if (r.file && r.file.b64) {
    const file = keepFile_(r, r.file);
    if (r.share) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    url = file.getUrl();
  }
  D.sends.push({ '일시': nowStr_(), '업체명': r.co, '발주일': r.order || '', '품목': r.item || '', '공장': r.factory || '', '방법': r.method || '보관', '받는곳': r.share ? '링크' : '', '문서': r.file ? r.file.name : '', 'Rev': r.rev || 0, '결과': '보관', '파일': url });
  return { url: url };
}
function faxAddress_(D, num) {
  const gw = (D.appSettings || {}).faxGateway || '';
  if (!gw) throw new Error('팩스 전송 설정이 없어요. 공장 관리에서 팩스 전송 주소 형식을 넣어주세요.');
  const digits = String(num).replace(/\D/g, '');
  return gw.replace('{국제번호}', '+82' + digits.replace(/^0/, '')).replace('{번호}', digits);
}
function sendDoc_(D, r) {
  const files = (r.files && r.files.length ? r.files : [r.file]).filter(function (f) { return f && f.b64; });
  if (!files.length) throw new Error('보낼 파일이 없습니다.');
  const to = r.method === 'fax' ? faxAddress_(D, r.to) : String(r.to || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.split(',')[0].trim())) throw new Error('받는 주소를 확인하세요: ' + to);
  const blobs = files.map(blobOf_);
  MailApp.sendEmail({ to: to, subject: r.subject || ((r.senderName || '리손패키지') + ' 문서'), body: r.body || '', attachments: blobs, name: r.senderName || '리손패키지' });
  let url = '';
  try { url = keepFile_(r, files[0]).getUrl(); } catch (e) {}
  D.sends.push({ '일시': nowStr_(), '업체명': r.co, '발주일': r.order || '', '품목': r.item || '', '공장': r.factory || '', '방법': r.method === 'fax' ? '팩스' : '이메일', '받는곳': to, '문서': files.map(function (f) { return f.name; }).join(', '), 'Rev': r.rev || 0, '결과': '보냄', '파일': url });
  return { to: to };
}

/* ================= 아침 요약 메일 ================= */
function digestCfg_(D) { let c = {}; try { c = JSON.parse((D.appSettings || {}).digest || '{}') || {}; } catch (e) {} return c; }
function setDigest_(D, r) {
  D.appSettings = D.appSettings || {};
  D.appSettings.digest = JSON.stringify({ on: !!r.on, hour: +r.hour || 8, to: r.to || '', weekend: !!r.weekend, coName: r.coName || '', appUrl: r.appUrl || '' });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendMorningDigest') ScriptApp.deleteTrigger(t); });
  if (r.on) ScriptApp.newTrigger('sendMorningDigest').timeBased().everyDays(1).atHour(+r.hour || 8).inTimezone(CONFIG.TZ).create();
  return {};
}
function digestTo_(to) { return String(to || '').trim() || Session.getEffectiveUser().getEmail(); }
function mailDigest_(D, opts, to) {
  const dg = buildDigest(D, today(), opts);
  MailApp.sendEmail({ to: to, subject: dg.subject, body: dg.text, htmlBody: dg.html, name: opts.coName || '리손패키지' });
  return dg;
}
function sendDigest_(D, r) {
  const to = digestTo_(r.to);
  mailDigest_(D, { coName: r.coName || '', appUrl: r.appUrl || '' }, to);
  return { to: to };
}
/** 매일 정한 시각에 트리거가 부름 */
function sendMorningDigest() {
  const D = loadRaw_(false).data, c = digestCfg_(D);
  if (!c.on) return;
  const wd = Number(Utilities.formatDate(new Date(), CONFIG.TZ, 'u')); // 1=월 … 7=일
  if (!c.weekend && wd >= 6) return;
  mailDigest_(D, { coName: c.coName || '', appUrl: c.appUrl || '' }, digestTo_(c.to));
}

/* ---- 앱 미리보기와 같은 요약 메일 코드 ---- */
function buildDigest(d, t, opts) {
  opts = opts || {};
  var me = opts.coName || '리손패키지';
  function num(v) { var x = Number(String(v === null || v === undefined ? '' : v).replace(/,/g, '')); return isNaN(x) ? 0 : x; }
  function blank(v) { return v === '' || v === null || v === undefined; }
  function sup(o) {
    if (!blank(o['출고수량']) && !blank(o['단가'])) return Math.round(num(o['출고수량']) * num(o['단가']));
    if (!blank(o['출고금액'])) return num(o['출고금액']);
    return num(o['금액']);
  }
  function tot(o) { var s = sup(o); return s + Math.round(s * 0.1); }
  function won(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function md(s) { if (!s) return ''; var p = String(s).split('-'); return p.length === 3 ? Number(p[1]) + '/' + Number(p[2]) : s; }
  function add(s, k) { var p = s.split('-'), x = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + k); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); }
  function days(a, b) { var p = a.split('-'), q = b.split('-'); return Math.round((new Date(+q[0], +q[1] - 1, +q[2]) - new Date(+p[0], +p[1] - 1, +p[2])) / 864e5); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var orders = d.orders || [], pays = d.payments || [], clients = d.clients || [], sched = d.sched || [], posts = d.posts || [];
  // 출고일이 비면 같은 주문(업체+발주일)의 출고일
  var shipMap = {};
  orders.forEach(function (o) { if (!o['출고일']) return; var k = o['업체명'] + '|' + o['발주일']; if (!shipMap[k] || o['출고일'] > shipMap[k]) shipMap[k] = o['출고일']; });
  function eff(o) { return o['출고일'] || shipMap[o['업체명'] + '|' + o['발주일']] || ''; }
  function isSale(o) { return sup(o) !== 0; }
  function rec(o) { var s = eff(o); return isSale(o) && !!s && s <= t; }
  function paidAmt(o) { return o['입금확인'] ? (blank(o['입금액']) ? tot(o) : num(o['입금액'])) : 0; }
  // 미수
  var bal = {}, oldest = {};
  clients.forEach(function (c) { if (num(c['이월잔액'])) bal[c['업체명']] = num(c['이월잔액']); });
  orders.forEach(function (o) {
    if (!isSale(o)) return;
    var c = o['업체명'];
    if (rec(o)) { bal[c] = (bal[c] || 0) + tot(o); if (!o['입금확인'] && tot(o) > 0 && (!oldest[c] || eff(o) < oldest[c])) oldest[c] = eff(o); }
    if (o['입금확인'] && (o['입금일'] || eff(o) || o['발주일']) <= t) bal[c] = (bal[c] || 0) - paidAmt(o);
  });
  pays.forEach(function (p) { if ((p['입금일'] || '') <= t) bal[p['업체명']] = (bal[p['업체명']] || 0) - num(p['입금액']); });
  var debt = Object.keys(bal).filter(function (c) { return bal[c] > 0; }).sort(function (a, b) { return bal[b] - bal[a]; });
  var debtSum = debt.reduce(function (s, c) { return s + bal[c]; }, 0);
  // 계산서 미발행
  var noinv = orders.filter(function (o) { return rec(o) && !o['세금계산서']; });
  var day = Number(t.slice(8, 10)), thisM = t.slice(0, 7);
  var lastM = (function () { var p = t.split('-'), x = new Date(+p[0], +p[1] - 2, 1); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2); })();
  var noinvLast = noinv.filter(function (o) { return eff(o).slice(0, 7) <= lastM; });
  // 생산
  var groups = {}, gl = [];
  orders.forEach(function (o) { if (!o['업체명'] || !o['발주일']) return; var k = o['업체명'] + '|' + o['발주일'] + '|' + pkOf(o); if (!groups[k]) { groups[k] = { co: o['업체명'], order: o['발주일'], pk: pkOf(o), rows: [] }; gl.push(groups[k]); } groups[k].rows.push(o); });
  var todayW = [], late = [], dueSoon = [], dueLate = [], shipWeek = [];
  var STEPS = [['동판', '동판'], ['원단입고', '원단 입고'], ['인쇄', '인쇄']];
  gl.forEach(function (g) {
    var shipped = g.rows.some(function (o) { return o['출고일'] && o['출고일'] <= t; });
    if (shipped) return;
    var sc = sched.filter(function (s) { return gm(s, g.co, g.order, g.pk); })[0] || {};
    var ps = posts.filter(function (p) { return gm(p, g.co, g.order, g.pk); });
    var main = g.rows.filter(isSale).sort(function (a, b) { return sup(b) - sup(a); })[0] || g.rows[0];
    var label = g.co + ' · ' + (main['품목'] || '') + (g.rows.length > 1 ? ' 외 ' + (g.rows.length - 1) : '');
    var work = STEPS.map(function (s) { return { name: s[1], plan: sc[s[0] + ' 예정'] || '', done: sc[s[0] + ' 완료'] || '', fac: (s[0] === '인쇄' || s[0] === '동판') ? sc['인쇄 공장'] : sc['원단 발주처'] }; })
      .concat(ps.map(function (p) { return { name: p['공정'], plan: p['예정일'] || '', done: p['완료일'] || '', fac: p['외주처'] }; }));
    work.forEach(function (w) {
      if (w.done || !w.plan) return;
      if (w.plan === t) todayW.push({ label: label, step: w.name, fac: w.fac });
      else if (w.plan < t) late.push({ label: label, step: w.name, fac: w.fac, days: days(w.plan, t) });
    });
    var due = sc['납기일'] || g.rows.map(function (o) { return o['납기일']; }).filter(Boolean).sort()[0] || '';
    if (due && due < t) dueLate.push({ label: label, due: due, days: days(due, t) });
    else if (due && due <= add(t, 3)) dueSoon.push({ label: label, due: due, dd: days(t, due) });
    var sp = sc['출고예정'] || g.rows.map(function (o) { return o['출고일']; }).filter(function (x) { return x && x > t; }).sort().pop() || '';
    if (sp && sp >= t && sp <= add(t, 7)) shipWeek.push({ label: label, date: sp });
  });
  late.sort(function (a, b) { return b.days - a.days; });
  shipWeek.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  // 본문
  var W = ['일', '월', '화', '수', '목', '금', '토'], dt = t.split('-'), wd = W[new Date(+dt[0], +dt[1] - 1, +dt[2]).getDay()];
  var head = Number(dt[1]) + '/' + Number(dt[2]) + '(' + wd + ')';
  var counts = { today: todayW.length, late: late.length + dueLate.length, debt: debtSum, noinv: noinv.length };
  var sec = [], txt = [];
  function block(title, color, rows, line) {
    if (!rows.length) return;
    sec.push('<h3 style="margin:20px 0 6px;font-size:15px;color:' + color + '">' + esc(title) + ' <span style="color:#888;font-weight:400">' + rows.length + '건</span></h3><table style="border-collapse:collapse;width:100%;font-size:14px">' +
      rows.slice(0, 12).map(function (r) { var c = line(r); return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;word-break:keep-all">' + esc(c[0]) + '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;width:42%;word-break:keep-all;color:#555">' + esc(c[1]) + '</td></tr>'; }).join('') +
      (rows.length > 12 ? '<tr><td colspan="2" style="padding:6px 8px;color:#888">외 ' + (rows.length - 12) + '건</td></tr>' : '') + '</table>');
    txt.push('■ ' + title + ' ' + rows.length + '건');
    rows.slice(0, 12).forEach(function (r) { var c = line(r); txt.push('  - ' + c[0] + ' (' + c[1] + ')'); });
  }
  block('오늘 예정 공정', '#1d4e89', todayW, function (r) { return [r.label, r.step + (r.fac ? ' · ' + r.fac : '')]; });
  block('예정일 넘긴 공정', '#c03c2a', late, function (r) { return [r.label, r.step + ' ' + r.days + '일 지연' + (r.fac ? ' · ' + r.fac : '')]; });
  block('납기 지난 주문', '#c03c2a', dueLate, function (r) { return [r.label, '납기 ' + md(r.due) + ' (+' + r.days + '일)']; });
  block('3일 안 납기', '#9a6300', dueSoon, function (r) { return [r.label, '납기 ' + md(r.due) + (r.dd === 0 ? ' 오늘' : ' D-' + r.dd)]; });
  block('7일 안 출고 예정', '#1d4e89', shipWeek, function (r) { return [r.label, md(r.date)]; });
  block('미수금', '#c03c2a', debt, function (c) { return [c, won(bal[c]) + '원' + (oldest[c] ? ' · 출고 후 ' + days(oldest[c], t) + '일' : '')]; });
  if (noinvLast.length && day <= 10) block('세금계산서 발급 마감 ' + md(thisM + '-10') + ' (지난달 이전 출고분)', '#9a6300', noinvLast, function (o) { return [o['업체명'] + ' · ' + o['품목'], md(eff(o)) + ' 출고 · ' + won(sup(o)) + '원']; });
  else if (noinv.length) block('세금계산서 미발행', '#9a6300', noinv, function (o) { return [o['업체명'] + ' · ' + o['품목'], md(eff(o)) + ' 출고 · ' + won(sup(o)) + '원']; });
  var nothing = !sec.length;
  var summary = [todayW.length ? '오늘 공정 ' + todayW.length : '', (late.length + dueLate.length) ? '지연 ' + (late.length + dueLate.length) : '', debtSum > 0 ? '미수 ' + won(debtSum) + '원' : ''].filter(Boolean).join(' · ');
  var subject = '[' + me + '] ' + head + ' 오늘 확인할 일' + (summary ? ' — ' + summary : ' 없음');
  var html = '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;max-width:640px;color:#17212b">' +
    '<div style="background:#1d4e89;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0"><b style="font-size:17px">' + esc(me) + ' 아침 요약</b><span style="float:right;opacity:.85">' + head + '</span></div>' +
    '<div style="border:1px solid #dbe1e7;border-top:0;padding:4px 18px 18px;border-radius:0 0 10px 10px">' +
    (nothing ? '<p style="font-size:15px;margin:18px 0">오늘은 확인할 일이 없어요. 지연·미수·계산서 모두 정리됐어요.</p>' : sec.join('')) +
    (opts.appUrl ? '<p style="margin:22px 0 0"><a href="' + esc(opts.appUrl) + '" style="background:#1d4e89;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;display:inline-block">앱 열기</a></p>' : '') +
    '<p style="color:#888;font-size:12px;margin-top:16px">' + esc(me) + ' 거래처 관리 앱이 보낸 메일이에요. 설정에서 끄거나 시간을 바꿀 수 있어요.</p></div></div>';
  var text = me + ' 아침 요약 ' + head + '\n\n' + (nothing ? '오늘은 확인할 일이 없어요.' : txt.join('\n')) + (opts.appUrl ? '\n\n앱 열기: ' + opts.appUrl : '');
  return { subject: subject, html: html, text: text, counts: counts, empty: nothing };
}

/* ================= 간편장부 탭 ================= */
function writeBook_(r) {
  const ss = ss_(), name = '간편장부 ' + r.year;
  let sh = ss.getSheetByName(name);
  if (sh) sh.clear(); else sh = ss.insertSheet(name);
  const rows = r.rows || [];
  const width = Math.max.apply(null, rows.map(function (x) { return x.length; }).concat([1]));
  const vals = rows.map(function (x) { const a = x.slice(); while (a.length < width) a.push(''); return a.map(function (v) { return v == null ? '' : v; }); });
  if (vals.length) sh.getRange(1, 1, vals.length, width).setValues(vals);
  (r.boldRows || []).forEach(function (i) { if (i < vals.length) sh.getRange(i + 1, 1, 1, width).setFontWeight('bold'); });
  // 매출 줄 전체 연한 회색 (지출은 배경 없음), 비고: 세금계산서 미발행 빨강 · 수취 파랑
  vals.forEach(function (row, i) {
    if (i < 4) return;
    if (/매출/.test(String(row[1] || ''))) sh.getRange(i + 1, 1, 1, width).setBackground('#eeeeee');
    var note = String(row[width - 1] || '');
    if (/미발행/.test(note)) sh.getRange(i + 1, width).setFontColor('#c4302b').setFontWeight('bold');
    else if (/수취/.test(note)) sh.getRange(i + 1, width).setFontColor('#2f6cc0').setFontWeight('bold');
  });
  sh.setFrozenRows(Math.min(4, vals.length));
  return { sheet: name, count: Math.max(0, rows.length - 4) };
}


/* ================= 사용자 계정 · 권한 (마스터 1명 + 직원 계정 최대 10개) =================
   계정은 스크립트 속성(USERS)에 저장 — 시트에는 보이지 않음. 비밀번호는 해시로만 보관 */
const MAX_USERS = 10;
const PERM_CATS = ['order', 'prod', 'vpay', 'claim', 'ledger', 'pay', 'exp', 'tax', 'clients'];
const ACTION_PERMS_ = {
  load: '*', getImage: '*', sendDigest: '*', changeMyPassword: '*',
  saveOrder: ['order'], saveOrders: ['order'], deleteOrder: ['order'], restoreOrder: ['order'], setInvoice: ['order', 'tax'], setInvoiceMany: ['order', 'tax'],
  setShip: ['order', 'prod'], saveSched: ['prod'], saveSpec: ['prod'], saveDoc: ['prod', 'vpay', 'claim', 'ledger'], sendDoc: ['prod', 'vpay', 'claim', 'ledger'],
  saveFactory: ['prod', 'vpay', 'clients'], deleteFactory: ['prod', 'clients'], importFactories: ['clients', 'vpay'],
  setBuyStatus: ['vpay'], setBuyLine: ['vpay'], setPayOut: ['vpay'], deleteBuyLines: ['prod', 'vpay'],
  setPaid: ['pay', 'order'], setPaidMany: ['pay'], savePayment: ['pay'], deletePayment: ['pay'],
  saveClient: ['clients', 'pay'], deleteClient: ['clients'], importClients: ['clients'],
  saveExpense: ['exp'], saveExpenses: ['exp'], deleteExpenses: ['exp'], saveTaxSettings: ['tax'], writeBook: ['tax'],
  saveClaim: ['claim'], deleteClaim: ['claim'], importMisu: [], bulkPayOut: [],
  saveAppSetting: ['prod'], setDigest: []
};
function props_() { return PropertiesService.getScriptProperties(); }
function usersGet_() { try { return JSON.parse(props_().getProperty('USERS') || '[]'); } catch (e) { return []; } }
function usersSet_(u) { props_().setProperty('USERS', JSON.stringify(u)); }
function secret_() { let s = props_().getProperty('TOKEN_SECRET'); if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props_().setProperty('TOKEN_SECRET', s); } return s; }
function hashPw_(salt, pw) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pw, Utilities.Charset.UTF_8)); }
function sign_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret_())); }
function makeToken_(id, ver) { const body = [id, Date.now() + 30 * 864e5, ver || 0].join('|'); return Utilities.base64EncodeWebSafe(body, Utilities.Charset.UTF_8) + '.' + sign_(body); }
function readToken_(t) {
  const p = String(t || '').split('.'); if (p.length !== 2) return null;
  let body; try { body = String.fromCharCode.apply(null, Utilities.base64DecodeWebSafe(p[0]).map(function (b) { return b & 255; })); body = decodeURIComponent(escape(body)); } catch (e) { return null; }
  if (sign_(body) !== p[1]) return null;
  const q = body.split('|'); if (+q[1] < Date.now()) return null;
  return { id: q[0], ver: +q[2] || 0 };
}
function masterVer_() { return +(props_().getProperty('MASTER_VER') || 0); }
function masterGet_() { try { return JSON.parse(props_().getProperty('MASTER') || 'null'); } catch (e) { return null; } }
function masterSet_(m) { props_().setProperty('MASTER', JSON.stringify(m)); }
function masterId_() { const m = masterGet_(); return (m && m.id) || 'admin'; }
function isMasterId_(id) { id = String(id || '').trim(); return /^(admin|master|관리자|마스터)$/i.test(id) || id.toLowerCase() === masterId_().toLowerCase(); }
function masterPwOk_(pw) { const m = masterGet_(); if (m && m.hash) return m.hash === hashPw_(m.salt, String(pw || '')); const key = props_().getProperty('API_KEY'); return !!key && pw === key; }
function masterMe_() { const m = masterGet_() || {}; return { id: 'admin', loginId: m.id || 'admin', name: m.name || '관리자', master: true, perms: PERM_CATS.slice() }; }
function onlyDigits_(s) { return String(s || '').replace(/\D/g, ''); }
function maskEmail_(e) { const p = String(e || '').split('@'); if (p.length !== 2) return ''; const a = p[0]; return (a.length <= 4 ? a[0] + '***' : a.slice(0, 2) + '*'.repeat(a.length - 3) + a.slice(-1)) + '@' + p[1]; }
function recoveryEmail_() { const m = masterGet_(); return (m && m.email) || Session.getEffectiveUser().getEmail(); }
function auth_(req) {
  const key = props_().getProperty('API_KEY');
  if (key && req.key && req.key === key) return masterMe_();
  const tk = readToken_(req.token);
  if (!tk) throw new Error(req.token ? '로그인이 만료됐어요. 다시 로그인하세요.' : '비밀번호가 맞지 않습니다. 다시 로그인하세요.');
  if (tk.id === 'admin') { if (tk.ver !== masterVer_()) throw new Error('로그인이 만료됐어요. 다시 로그인하세요.'); return masterMe_(); }
  const u = usersGet_().filter(function (x) { return x.id === tk.id; })[0];
  if (!u || !u.on || (u.ver || 0) !== tk.ver) throw new Error('계정이 바뀌었거나 사용이 중지됐어요. 다시 로그인하세요.');
  return { id: u.id, name: u.name || u.id, master: false, perms: (u.perms || []).filter(function (c) { return PERM_CATS.indexOf(c) >= 0; }) };
}
function allowed_(who, action) {
  if (who.master) return true;
  const need = ACTION_PERMS_[action];
  if (need === '*') return true;
  if (USER_ACTIONS_[action]) return false;
  if (!need) return false;
  return need.some(function (c) { return who.perms.indexOf(c) >= 0; });
}
function meOf_(who) { return { id: who.id, loginId: who.loginId || who.id, name: who.name, master: !!who.master, perms: who.perms }; }
/** 권한 없는 직원에게는 카드·경비 내용은 보내지 않음 */
function viewFor_(who, data) {
  if (who.master) return data;
  if (who.perms.indexOf('exp') < 0 && who.perms.indexOf('tax') < 0) data.expenses = [];
  if (who.perms.indexOf('tax') < 0) data.taxSettings = {};
  delete data.sheetUrl; data.tabs = {};
  return data;
}
function login_(req) {
  const id = String(req.uid || '').trim(), pw = String(req.pw || '');
  if (!id || !pw) throw new Error('아이디와 비밀번호를 입력하세요.');
  const key = props_().getProperty('API_KEY');
  if (id.toLowerCase() === masterId_().toLowerCase() || (!masterGet_() && isMasterId_(id))) {
    lockCheck_('login:master');
    if (!masterPwOk_(pw)) { lockFail_('login:master'); throw new Error('아이디 또는 비밀번호가 맞지 않습니다.'); }
    lockClear_('login:master');
    const m = masterGet_(); if (m) { m.last = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm'); masterSet_(m); }
    return { token: makeToken_('admin', masterVer_()), me: masterMe_() };
  }
  const list = usersGet_(), u = list.filter(function (x) { return x.id === id; })[0];
  lockCheck_('login:' + id);
  if (!u || u.hash !== hashPw_(u.salt, pw)) { lockFail_('login:' + id); throw new Error('아이디 또는 비밀번호가 맞지 않습니다.'); }
  lockClear_('login:' + id);
  if (!u.on) throw new Error('사용이 중지된 계정이에요. 관리자에게 문의하세요.');
  u.last = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm'); usersSet_(list);
  return { token: makeToken_(u.id, u.ver || 0), me: { id: u.id, name: u.name || u.id, master: false, perms: u.perms || [] } };
}
function userPublic_(u) { return { id: u.id, name: u.name || '', perms: u.perms || [], on: !!u.on, created: u.created || '', last: u.last || '' }; }
const USER_ACTIONS_ = {
  listUsers: function () { return { users: usersGet_().map(userPublic_), max: MAX_USERS }; },
  saveUser: function (r) {
    const list = usersGet_(), u = r.user || {}, id = String(u.id || '').trim(), old = String(r.oldId || '').trim();
    if (!/^[A-Za-z0-9._\-가-힣]{2,20}$/.test(id)) throw new Error('아이디는 2~20자 (한글·영문·숫자·._-)로 정해주세요.');
    if (isMasterId_(id)) throw new Error('admin · master · 관리자와 마스터 아이디는 직원 계정에 쓸 수 없어요.');
    let x = list.filter(function (y) { return y.id === (old || id); })[0];
    if (old !== id && list.some(function (y) { return y.id === id; })) throw new Error('같은 아이디가 이미 있어요.');
    if (!x) {
      if (list.length >= MAX_USERS) throw new Error('계정은 ' + MAX_USERS + '개까지 만들 수 있어요.');
      if (!u.pw) throw new Error('처음 만들 때는 비밀번호를 정해주세요.');
      x = { id: id, created: Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm'), ver: 0 }; list.push(x);
    }
    const perms = (u.perms || []).filter(function (c) { return PERM_CATS.indexOf(c) >= 0; });
    const permChanged = JSON.stringify(perms) !== JSON.stringify(x.perms || []);
    x.id = id; x.name = String(u.name || '').trim(); x.perms = perms;
    const wasOn = x.on; x.on = u.on !== false;
    if (u.pw) { if (String(u.pw).length < 4) throw new Error('비밀번호는 4자 이상으로 정해주세요.'); x.salt = Utilities.getUuid(); x.hash = hashPw_(x.salt, String(u.pw)); x.ver = (x.ver || 0) + 1; }
    else if ((wasOn && !x.on) || old !== id) x.ver = (x.ver || 0) + 1;
    usersSet_(list);
    return { users: list.map(userPublic_), max: MAX_USERS, permChanged: permChanged };
  },
  deleteUser: function (r) { const list = usersGet_().filter(function (y) { return y.id !== r.id; }); usersSet_(list); return { users: list.map(userPublic_), max: MAX_USERS }; },
  getMaster: function () { const m = masterGet_() || {}; return { master: { id: m.id || 'admin', name: m.name || '관리자', phone: m.phone || '', email: m.email || '', emailDefault: Session.getEffectiveUser().getEmail(), custom: !!m.hash, last: m.last || '' } }; },
  saveMaster: function (r) {
    if (!masterPwOk_(r.curPw)) throw new Error('지금 마스터 비밀번호가 맞지 않습니다.');
    const m = masterGet_() || { id: 'admin' };
    const id = String(r.id || m.id || 'admin').trim();
    if (!/^[A-Za-z0-9._\-가-힣]{2,20}$/.test(id)) throw new Error('아이디는 2~20자 (한글·영문·숫자·._-)로 정해주세요.');
    if (usersGet_().some(function (u) { return u.id.toLowerCase() === id.toLowerCase(); })) throw new Error('직원 계정과 같은 아이디는 쓸 수 없어요.');
    const email = String(r.email || '').trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('복구 메일 주소 형식을 확인해 주세요.');
    m.id = id; m.name = String(r.name || m.name || '관리자').trim(); m.phone = String(r.phone || '').trim(); m.email = email;
    let out = {};
    if (r.newPw) {
      if (String(r.newPw).length < 6) throw new Error('마스터 비밀번호는 6자 이상으로 정해주세요.');
      m.salt = Utilities.getUuid(); m.hash = hashPw_(m.salt, String(r.newPw));
      props_().setProperty('MASTER_VER', String(masterVer_() + 1));
      out.token = makeToken_('admin', masterVer_());
    } else if (!m.hash) { const key = props_().getProperty('API_KEY'); m.salt = Utilities.getUuid(); m.hash = hashPw_(m.salt, key); }
    masterSet_(m);
    try { MailApp.sendEmail({ to: recoveryEmail_(), subject: '[리손패키지] 마스터 계정 정보가 바뀌었어요', body: '마스터 아이디: ' + m.id + (r.newPw ? '\n비밀번호도 바뀌었어요.' : '') + '\n휴대폰: ' + (m.phone || '-') + '\n일시: ' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm') + '\n\n본인이 바꾼 것이 아니면 바로 비밀번호 재설정을 하세요.', name: '리손패키지' }); } catch (e) {}
    return Object.assign(out, { me: masterMe_() });
  },
  listLog: function (r) {
    const sh = ss_().getSheetByName(LOG_SHEET); if (!sh || sh.getLastRow() < 2) return { rows: [] };
    const vals = sh.getRange(2, 1, sh.getLastRow() - 1, LOG_HEAD.length).getDisplayValues();
    const from = r.from || '', to = r.to || '', u = r.user || '', k = r.kind || '', q = String(r.q || '').toLowerCase();
    const rows = vals.filter(function (v) {
      const d = String(v[0]).slice(0, 10);
      if (from && d < from) return false; if (to && d > to) return false;
      if (u && v[1] !== u) return false; if (k && v[3] !== k) return false;
      if (q && v.join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).reverse().slice(0, 2000).map(function (v) { const o = {}; LOG_HEAD.forEach(function (h, i) { o[h] = v[i]; }); return o; });
    return { rows: rows, total: vals.length };
  },
  getDataSheet: function () {
    const id = props_().getProperty('DATA_SHEET_ID') || '', ss = ss_();
    let own = ''; try { own = SpreadsheetApp.getActive() ? SpreadsheetApp.getActive().getId() : ''; } catch (e) {}
    return { sheet: { id: ss.getId(), name: ss.getName(), url: ss.getUrl(), custom: !!id, boundId: own, owner: Session.getEffectiveUser().getEmail() } };
  },
  setDataSheet: function (r) {
    if (!masterPwOk_(r.curPw)) throw new Error('지금 마스터 비밀번호가 맞지 않습니다.');
    const id = r.reset ? '' : sheetIdOf_(r.url);
    if (!r.reset && !id) throw new Error('구글 시트 주소(https://docs.google.com/spreadsheets/d/…)를 넣어주세요.');
    let ss;
    try { ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive(); } catch (e) { throw new Error('시트를 열 수 없어요. 이 Apps Script를 배포한 계정(' + Session.getEffectiveUser().getEmail() + ')이 그 시트의 편집자인지 확인하세요.'); }
    if (!ss) throw new Error('시트를 열 수 없어요.');
    SS_CACHE_ = ss;
    let main; try { main = mainSheet_(); } catch (e) { SS_CACHE_ = null; throw new Error('그 시트에서 총정리 탭을 찾지 못했어요. 3행에 발주일·업체명·품목 열 제목이 있어야 해요.'); }
    if (id) props_().setProperty('DATA_SHEET_ID', id); else props_().deleteProperty('DATA_SHEET_ID');
    ensureAll_(); fillMissingIds_();
    try { MailApp.sendEmail({ to: recoveryEmail_(), name: '리손패키지', subject: '[리손패키지] 데이터 시트 연결이 바뀌었어요', body: '연결된 시트: ' + ss.getName() + '\n' + ss.getUrl() + '\n총정리 탭: ' + main.getName() + '\n일시: ' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm') }); } catch (e) {}
    return { sheet: { id: ss.getId(), name: ss.getName(), url: ss.getUrl(), main: main.getName(), custom: !!id } };
  },
  logoutAll: function () { props_().setProperty('MASTER_VER', String(masterVer_() + 1)); return {}; },
  changeMyPassword: function (r, who) {
    if (who.master) throw new Error('마스터 비밀번호는 Apps Script의 setup에서 바꿔요.');
    const list = usersGet_(), x = list.filter(function (y) { return y.id === who.id; })[0];
    if (!x || x.hash !== hashPw_(x.salt, String(r.oldPw || ''))) throw new Error('지금 비밀번호가 맞지 않습니다.');
    if (String(r.newPw || '').length < 4) throw new Error('새 비밀번호는 4자 이상으로 정해주세요.');
    x.salt = Utilities.getUuid(); x.hash = hashPw_(x.salt, String(r.newPw)); x.ver = (x.ver || 0) + 1; usersSet_(list);
    return { token: makeToken_(x.id, x.ver) };
  }
};


/* ================= 로그인 잠금 · 마스터 비밀번호 재설정 (메일 인증 코드) =================
   - 같은 아이디로 5번 틀리면 10분 잠금
   - 재설정: 마스터 아이디 또는 등록한 휴대폰 번호 → 복구 메일로 6자리 코드 (10분 유효, 5번까지 입력, 1시간에 3번까지 요청)
   - 코드는 해시로만 보관. 재설정되면 모든 기기의 마스터 로그인이 끊김 */
function cache_() { return CacheService.getScriptCache(); }
function lockCheck_(k) { const v = +(cache_().get('fail:' + k) || 0); if (v >= 5) throw new Error('비밀번호를 5번 틀려서 10분 동안 잠겼어요. 잠시 후 다시 해보세요.'); }
function lockFail_(k) { const v = +(cache_().get('fail:' + k) || 0) + 1; cache_().put('fail:' + k, String(v), 600); }
function lockClear_(k) { cache_().remove('fail:' + k); }
function resetWho_(who) {
  who = String(who || '').trim(); if (!who) throw new Error('마스터 아이디 또는 등록한 휴대폰 번호를 입력하세요.');
  const m = masterGet_() || {}, ph = onlyDigits_(m.phone);
  const okId = who.toLowerCase() === (m.id || 'admin').toLowerCase() || (!m.id && isMasterId_(who));
  const okPh = ph.length >= 9 && onlyDigits_(who) === ph;
  if (!okId && !okPh) throw new Error('마스터 아이디나 등록된 휴대폰 번호가 아니에요.');
  return m;
}
function resetRequest_(r) {
  resetWho_(r.who);
  const st = JSON.parse(props_().getProperty('RESET') || '{}'), now = Date.now();
  st.reqs = (st.reqs || []).filter(function (t) { return now - t < 3600e3; });
  if (st.reqs.length >= 3) throw new Error('코드 요청은 1시간에 3번까지예요. 조금 뒤에 다시 해보세요.');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  st.reqs.push(now); st.salt = Utilities.getUuid(); st.hash = hashPw_(st.salt, code); st.exp = now + 600e3; st.tries = 0;
  props_().setProperty('RESET', JSON.stringify(st));
  const to = recoveryEmail_(), m = masterGet_() || {};
  MailApp.sendEmail({ to: to, name: '리손패키지', subject: '[리손패키지] 마스터 비밀번호 재설정 인증 코드 ' + code,
    body: '인증 코드: ' + code + '\n\n10분 안에 앱 로그인 화면의 [비밀번호 재설정]에 입력하세요.\n마스터 아이디: ' + (m.id || 'admin') + '\n요청 시각: ' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm') + '\n\n본인이 요청하지 않았다면 이 메일을 무시하세요. 코드가 없으면 비밀번호는 바뀌지 않아요.' });
  return { sentTo: maskEmail_(to), minutes: 10 };
}
function resetConfirm_(r) {
  const m = resetWho_(r.who), st = JSON.parse(props_().getProperty('RESET') || '{}');
  if (!st.hash || Date.now() > st.exp) throw new Error('인증 코드가 없거나 시간이 지났어요. 코드를 다시 받아 주세요.');
  if ((st.tries || 0) >= 5) throw new Error('코드를 5번 틀렸어요. 코드를 다시 받아 주세요.');
  if (hashPw_(st.salt, String(r.code || '').trim()) !== st.hash) { st.tries = (st.tries || 0) + 1; props_().setProperty('RESET', JSON.stringify(st)); throw new Error('인증 코드가 맞지 않아요. (' + st.tries + '/5)'); }
  if (String(r.newPw || '').length < 6) throw new Error('새 비밀번호는 6자 이상으로 정해주세요.');
  m.id = m.id || 'admin'; m.salt = Utilities.getUuid(); m.hash = hashPw_(m.salt, String(r.newPw)); masterSet_(m);
  props_().setProperty('MASTER_VER', String(masterVer_() + 1));
  props_().setProperty('RESET', JSON.stringify({ reqs: st.reqs || [] }));
  lockClear_('login:master');
  try { MailApp.sendEmail({ to: recoveryEmail_(), name: '리손패키지', subject: '[리손패키지] 마스터 비밀번호가 재설정됐어요', body: '마스터 아이디: ' + m.id + '\n일시: ' + Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm') + '\n다른 기기의 마스터 로그인은 모두 끊겼어요.' }); } catch (e) {}
  return { id: m.id };
}
/** 비상용: Apps Script 편집기에서 직접 실행 — 마스터를 admin + API_KEY 로 되돌림 */
function resetMasterToApiKey() {
  props_().deleteProperty('MASTER'); props_().setProperty('MASTER_VER', String(masterVer_() + 1));
  Logger.log('마스터를 초기화했어요. 아이디 admin / 비밀번호: ' + props_().getProperty('API_KEY'));
}


/* ================= 접속 기록 (마스터만 봄) ================= */
const LOG_SHEET = '접속기록', LOG_HEAD = ['일시', '아이디', '이름', '구분', '기능', '대상', '내용', '결과'], LOG_MAX = 20000;
/* ---- 접속 기록: 요청을 사람이 읽는 한 줄로 (앱 체험판과 서버가 같은 코드) ---- */
var LOG_LABELS = {
  login: ['접속', '로그인'], saveOrder: ['입력', '발주 저장'], saveOrders: ['입력', '발주 여러 줄 저장'], deleteOrder: ['삭제', '발주 줄 삭제'], restoreOrder: ['수정', '발주 줄 되살리기'],
  deleteBuyLines: ['삭제', '매입 줄 정리'], setPaid: ['수정', '입금 처리'], setPaidMany: ['수정', '입금 처리(여러 건)'], setBuyStatus: ['수정', '매입 단가 예정/확정'], setBuyLine: ['수정', '매입 내역 수정'],
  setPayOut: ['수정', '공장 지급 처리'], setShip: ['수정', '출고 처리'], saveSched: ['수정', '생산 일정'], saveSpec: ['수정', '작업 사양'], saveFactory: ['수정', '공장(매입처) 정보'],
  deleteFactory: ['삭제', '공장(매입처) 삭제'], saveDoc: ['입력', '작업의뢰서 보관'], sendDoc: ['입력', '작업의뢰서 보내기'], setInvoice: ['수정', '세금계산서'], setInvoiceMany: ['수정', '세금계산서(여러 건)'],
  setDigest: ['설정', '아침 요약 메일 설정'], sendDigest: ['입력', '요약 메일 보내기'], savePayment: ['입력', '입금 기록'], deletePayment: ['삭제', '입금 기록 삭제'],
  saveClient: ['수정', '매출거래처 정보'], deleteClient: ['삭제', '매출거래처 삭제'], importClients: ['입력', '매출거래처 엑셀 올리기'], importFactories: ['입력', '매입거래처 엑셀 올리기'],
  saveExpense: ['입력', '카드·경비'], saveExpenses: ['입력', '카드·경비(여러 건)'], deleteExpenses: ['삭제', '카드·경비 삭제'], saveTaxSettings: ['설정', '세금 설정'], writeBook: ['입력', '간편장부 시트 만들기'],
  saveAppSetting: ['설정', '앱 설정'], saveUser: ['계정', '직원 계정 저장'], deleteUser: ['계정', '직원 계정 삭제'], saveMaster: ['계정', '마스터 정보 변경'], changeMyPassword: ['계정', '내 비밀번호 변경'],
  saveClaim: ['입력', '불량·클레임 저장'], deleteClaim: ['삭제', '불량·클레임 삭제'],
  resetConfirm: ['계정', '마스터 비밀번호 재설정'], resetRequest: ['계정', '비밀번호 재설정 코드 요청'], logoutAll: ['계정', '모든 기기 로그아웃']
};
function logSummary(action, r, look) {
  r = r || {};
  var L = LOG_LABELS[action] || ['기타', action];
  var fmt = function (v) { if (typeof v === 'number' || /^-?\d{4,}(\.\d+)?$/.test(String(v))) return Number(v).toLocaleString('ko-KR'); if (v === true) return '예'; if (v === false) return '아니오'; if (v === '' || v == null) return '빈칸'; return String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v); };
  var skip = { ID: 1, _row: 1, '발행일': 1, '입금일': 1, '입금액': 1 };
  var target = '', parts = [];
  if (action === 'saveMaster') return { kind: L[0], label: L[1], target: r.id || '', detail: ['아이디 ' + (r.id || ''), '휴대폰 ' + (r.phone || '-'), '복구 메일 ' + (r.email || '기본'), r.newPw ? '비밀번호 변경' : ''].filter(Boolean).join(' · ') };
  if (action === 'resetRequest') return { kind: '계정', label: '비밀번호 재설정 코드 요청', target: String(r.who || ''), detail: '' };
  if (r.claim) return { kind: r.claim.ID ? '수정' : '입력', label: r.claim.ID ? '불량·클레임 수정' : '불량·클레임 접수', target: [r.claim['업체명'], r.claim['품목']].filter(Boolean).join(' · '), detail: [r.claim['상태'], '불량: ' + (r.claim['불량내용'] || ''), r.claim['재납품'] ? '재납품' : '', r.claim['매출조정'] ? r.claim['매출조정'] + ' −' + fmt(r.claim['매출조정액']) : '', r.claim['매입조치'] === '청구' ? (r.claim['책임처'] || '') + ' 청구 −' + fmt(r.claim['청구액']) : ''].filter(Boolean).join(' · ').slice(0, 500) };
  if (action === 'login') return { kind: L[0], label: L[1], target: String(r.uid || ''), detail: '' };
  var o = r.order || null;
  var nameOf = function (id) { var x = look && look(id); return x ? [x['업체명'], x['품목']].filter(Boolean).join(' · ') : ''; };
  if (o) {
    target = [o['업체명'], o['품목']].filter(Boolean).join(' · ') || nameOf(o.ID);
    if (o.ID && action === 'saveOrder') L = ['수정', '발주 수정'];
    if (r.base) Object.keys(r.base).forEach(function (k) { if (!skip[k]) parts.push(k + ' ' + fmt(r.base[k]) + ' → ' + fmt(o[k])); });
    else if (o.ID) Object.keys(o).forEach(function (k) { if (!skip[k]) parts.push(k + ' → ' + fmt(o[k])); });
    else ['발주일', '수량', '단가', '금액', '매입처', '규격', '매입금액'].forEach(function (k) { if (o[k] !== '' && o[k] != null) parts.push(k + ' ' + fmt(o[k])); });
  }
  if (r.orders) { target = (r.orders[0] || {})['업체명'] || ''; parts.push(r.orders.length + '줄: ' + r.orders.map(function (x) { return x['품목'] || x['매입처'] || ''; }).filter(Boolean).slice(0, 5).join(', ')); }
  if (r.co) target = [r.co, r.item].filter(Boolean).join(' · ') + (r.order ? ' (' + r.order + ' 발주)' : '');
  if (r.fields) Object.keys(r.fields).forEach(function (k) { parts.push(k + ' → ' + fmt(r.fields[k])); });
  if (action === 'deleteUser') target = r.id || '';
  if (r.posts) parts.push('후가공 ' + r.posts.map(function (p) { return p['공정'] + (p['외주처'] ? '(' + p['외주처'] + ')' : ''); }).join(', '));
  if (r.payment) { target = r.payment['업체명'] || ''; parts.push((r.payment['입금일'] || '') + ' ' + fmt(r.payment['입금액']) + '원 ' + (r.payment['비고'] || '')); }
  if (r.expense) { target = r.expense['사용처'] || ''; parts.push((r.expense['사용일'] || '') + ' ' + fmt(r.expense['금액']) + '원 ' + (r.expense['분류'] || '')); }
  if (r.client) { target = r.client['업체명'] || ''; if (r.oldName && r.oldName !== r.client['업체명']) parts.push('이름 ' + r.oldName + ' → ' + r.client['업체명']); }
  if (r.factory) { target = r.factory['공장명'] || ''; if (r.oldName && r.oldName !== r.factory['공장명']) parts.push('이름 ' + r.oldName + ' → ' + r.factory['공장명']); }
  if (r.user) { target = r.user.id || ''; parts.push('권한: ' + (r.user.perms || []).join(', ') + (r.user.pw ? ' · 비밀번호 새로 정함' : '') + (r.user.on === false ? ' · 사용 중지' : '')); }
  if (r.ids && !target) target = r.ids.slice(0, 3).map(nameOf).filter(Boolean).join(', ') + (r.ids.length > 3 ? ' 외' : '');
  if (r.lines && !target) target = nameOf((r.lines[0] || {}).id);
  if (r.id && !target && !r.user) target = nameOf(r.id);
  if (r.ids) parts.push(r.ids.length + '건' + (r.date ? ' · ' + r.date : '') + (r.paid === false ? ' · 취소' : ''));
  if (r.id && !o && !r.user && action !== 'deleteUser') { var px = [r.paid === false ? '취소' : r.paid ? '처리' : '', r.date || ''].filter(Boolean).join(' · '); if (px) parts.push(px); }
  if (r.lines) parts.push(r.lines.length + '줄 (' + r.lines.map(function (l) { return l.step; }).join(', ') + ')');
  if (r.status) parts.push('상태 ' + r.status);
  if (r.reason) parts.push('사유: ' + r.reason);
  if (r.name && action === 'saveAppSetting') parts.push(r.name);
  if (r.method) parts.push(r.method + (r.to ? ' → ' + r.to : '') + (r.factory ? ' · ' + r.factory : ''));
  if (r.clients) parts.push(r.clients.length + '곳');
  if (r.factories) parts.push(r.factories.length + '곳');
  if (r.items) parts.push(r.items.length + '건');
  if (r.year) parts.push(r.year + '년');
  return { kind: L[0], label: L[1], target: String(target || '').slice(0, 80), detail: parts.join(' · ').slice(0, 500) };
}

function logAct_(who, action, req, result, look) {
  try {
    const ss = ss_();
    let sh = ss.getSheetByName(LOG_SHEET);
    if (!sh) { sh = ss.insertSheet(LOG_SHEET); sh.getRange(1, 1, 1, LOG_HEAD.length).setValues([LOG_HEAD]).setFontWeight('bold').setBackground('#fde9d9'); sh.setFrozenRows(1); if (sh.setTabColor) sh.setTabColor('#c4302b'); }
    const s = logSummary(action, req || {}, look);
    const row = [Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd HH:mm:ss'), (who && (who.loginId || who.id)) || '', (who && who.name) || '', result ? (action === 'login' ? '접속 실패' : s.kind) : s.kind, s.label, s.target, s.detail, result || '성공'];
    const last = Math.max(1, sh.getLastRow());
    sh.getRange(last + 1, 1, 1, row.length).setValues([row.map(function (v) { return String(v).charAt(0) === '=' ? "'" + v : v; })]);
    if (last > LOG_MAX) sh.deleteRows(2, last - LOG_MAX);
  } catch (e) { Logger.log('접속 기록 실패: ' + e.message); }
}

/** '미수관련' 탭 읽기: 날짜가 있는 줄 = 아직 안 받은 건, '미수 잔액' 줄 = 업체 미수 총액(비고의 "…원 미수잔액") */
function misuRows_() {
  const sh = ss_().getSheetByName('미수관련'); if (!sh) throw new Error("'미수관련' 탭이 없어요.");
  const v = sh.getLastRow() ? sh.getRange(1, 1, sh.getLastRow(), Math.max(9, sh.getLastColumn())).getValues() : [], items = [], lumps = [], lumpNames = {};
  const ymd = function (d) { return d instanceof Date ? Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd') : (isYmd(String(d)) ? String(d) : ''); };
  v.slice(1).forEach(function (r) {
    if (!r[1]) return;
    const d = ymd(r[0]);
    if (d) items.push({ date: d, co: String(r[1]).trim(), item: String(r[2] || '').trim(), amt: n(r[6]) });
    else if (/미수/.test(String(r[2]))) { const m = String(r[8] || '').match(/([\d,]+)\s*원\s*미수/); if (m) { lumps.push({ co: String(r[1]).trim(), amt: n(m[1]) }); lumpNames[String(r[1]).trim()] = 1; } }
  });
  return { items: items, lumps: lumps, lumpNames: lumpNames };
}
