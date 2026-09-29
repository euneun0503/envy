/* ENVY 관리자
   - 사이트 내용(data/*.json)과 사진(images/uploads)은 GitHub 저장소에 직접 저장합니다.
   - 견적 문의와 접속 통계는 구글 Apps Script(구글 시트)에서 불러옵니다.
   - window.ENVY_ADMIN.demo 가 true 이면 저장하지 않는 체험판으로 동작합니다. */

(function () {
const CFG = Object.assign({ repo: "", branch: "main", demo: false, dataBase: "../data/" }, window.ENVY_ADMIN || {});
const DEMO = !!CFG.demo;
const IC = window.IC || {};
const $ = (s, r = document) => r.querySelector(s);
/* 관리자 화면은 #admin-root 안에만 그림 (페이지의 스타일 연결을 지우지 않도록) */
const root = () => {
  let el = document.getElementById("admin-root");
  if (!el) { el = document.createElement("div"); el.id = "admin-root"; document.body.appendChild(el); }
  return el;
};
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const LS = {
  get(k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k) || ""; } catch (e) { return ""; } },
  set(k, v, keep = true) { try { (keep ? localStorage : sessionStorage).setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} }
};
/* 관리자가 저장한 "/images/…" 경로를 하위 주소에서도 열리게 */
const img = (p) => { p = String(p || ""); return /^(https?:|data:|blob:)/.test(p) ? p : (CFG.demo ? "" : "../") + p.replace(/^\//, ""); };

const CATS = { bread: "빵봉투·OPP", pouch: "스탠드파우치", vacuum: "진공·삼방", retort: "레토르트", roll: "롤필름", band: "포장 밴딩", sticker: "스티커·라벨", sleeve: "슬리브", box: "박스", bag: "쇼핑백" };
const ICONS = ["bread", "gusset", "pouch", "kraft", "alu", "vacuum", "flat", "retort", "spout", "roll", "stick", "band", "sticker", "sleeve", "box", "pbag", "bag", "tbag"];
const COLORS = { soft: "연회색", green: "연초록", crust: "연노랑" };
const CASE_MAIN_MAX = 9;
const mainCount = (skip = -1) => D.cases.items.filter((c, i) => i !== skip && c.main).length;
const LISTS = {
  products: { title: "제작 품목", label: "품목", file: "products" },
  cases:    { title: "제작사례", label: "제작사례", file: "cases" },
  banners:  { title: "메인 배너 슬라이드", label: "배너", file: "banners" },
  notices:  { title: "공지사항 · 상단 띠", label: "공지", file: "notices" },
  popups:   { title: "팝업 배너", label: "팝업", file: "popups" }
};

/* ───────── 저장소 (GitHub / 체험판) ───────── */
const b64enc = (str) => { const bytes = new TextEncoder().encode(str); let bin = ""; bytes.forEach((b) => bin += String.fromCharCode(b)); return btoa(bin); };
const b64dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

const Store = {
  sha: {},
  token: "",
  async gh(path, opt = {}) {
    return this._gh(path, opt).catch((e) => { if (e instanceof TypeError) throw new Error("GitHub에 연결하지 못했어요. 인터넷 연결을 확인하거나, 광고 차단 확장 프로그램을 잠시 끄고 다시 시도해 주세요."); throw e; });
  },
  async _gh(path, opt = {}) {
    const res = await fetch(`https://api.github.com/repos/${CFG.repo}${path ? "/" + path : ""}`, Object.assign({}, opt, {
      headers: Object.assign({ "Authorization": `Bearer ${this.token}`, "Accept": "application/vnd.github+json" }, opt.headers || {})
    }));
    if (res.status === 401) throw new Error("GitHub 토큰이 만료됐거나 올바르지 않아요. 다시 로그인해 주세요.");
    if (res.status === 403) throw new Error("이 저장소에 쓸 권한이 없는 토큰이에요. Contents: Read and write 권한을 확인해 주세요.");
    if (res.status === 404) throw new Error("저장소나 파일을 찾지 못했어요. admin/settings.js 의 repo 값을 확인해 주세요.");
    if (res.status === 409) throw new Error("다른 곳에서 먼저 수정됐어요. 새로고침한 뒤 다시 저장해 주세요.");
    if (!res.ok) throw new Error(`GitHub 오류 (${res.status})`);
    return res.json();
  },
  async check() {
    if (DEMO) return true;
    const r = await this.gh("");
    if (r.permissions && !r.permissions.push) throw new Error("이 저장소에 쓸 권한이 없는 토큰이에요.");
    return true;
  },
  async load(name) {
    if (DEMO) { const r = await fetch(CFG.dataBase + name + ".json"); return r.ok ? r.json() : {}; }
    const r = await this.gh(`contents/data/${name}.json?ref=${encodeURIComponent(CFG.branch)}`);
    this.sha[name] = r.sha;
    return JSON.parse(b64dec(r.content));
  },
  async save(name, obj, msg) {
    if (DEMO) { await new Promise((r) => setTimeout(r, 250)); return; }
    const r = await this.gh(`contents/data/${name}.json`, {
      method: "PUT",
      body: JSON.stringify({ message: msg, content: b64enc(JSON.stringify(obj, null, 2) + "\n"), sha: this.sha[name], branch: CFG.branch })
    });
    this.sha[name] = r.content.sha;
  },
  async upload(file) {
    const blob = await shrink(file);
    if (DEMO) return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
    const ext = blob.type === "image/png" ? "png" : blob.type === "image/gif" ? "gif" : blob.type === "image/webp" ? "webp" : "jpg";
    const base = (file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photo").slice(0, 40);
    const stamp = new Date().toLocaleString("sv-SE").replace(/\D/g, "").slice(0, 14);
    const path = `images/uploads/${stamp}-${base}.${ext}`;
    const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.readAsDataURL(blob); });
    await this.gh(`contents/${path}`, { method: "PUT", body: JSON.stringify({ message: `사진 업로드: ${path}`, content: b64, branch: CFG.branch }) });
    return "/" + path;
  }
};

/* 사진은 올리기 전에 긴 변 1600px, JPG로 줄여서 사이트를 가볍게 */
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 600 * 1024) return file;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob((b) => ok(b || file), "image/jpeg", 0.85));
  } catch (e) { return file; }
}

/* ───────── Apps Script (문의·통계) ───────── */
const Remote = {
  key: "",
  endpoint() { return String((D.site && D.site.inquiry_endpoint) || "").trim(); },
  async call(body) {
    const res = await fetch(this.endpoint(), { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ key: this.key }, body)) });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || "요청을 처리하지 못했어요.");
    return out;
  }
};
const InqAPI = {
  list: () => DEMO ? Demo.list() : Remote.call({ action: "list" }),
  update: (p) => DEMO ? Demo.update(p) : Remote.call(Object.assign({ action: "update" }, p))
};
const StatsAPI = { get: (days) => DEMO ? Demo.stats(days) : Remote.call({ action: "stats", days }) };

/* ───────── 상태 ───────── */
const D = { site: {}, products: { items: [] }, cases: { items: [] }, banners: { items: [] }, notices: { items: [] }, popups: { items: [] } };
const S = { view: "inquiries", edit: null, filter: "all", sel: new Set(), inqCount: 0 };

function toast(msg, ms = 3200) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); }
const savedMsg = () => DEMO ? "체험판이라 여기서만 반영됐어요. 실제 관리자에서는 GitHub에 저장돼요." : "저장했어요. 1~2분 뒤 사이트에 반영돼요.";

async function persist(file, msg) {
  const el = $("#saving"); el.textContent = "저장하는 중…";
  try { await Store.save(file, D[file], msg); el.textContent = ""; toast(savedMsg()); return true; }
  catch (e) { el.textContent = ""; toast(e.message, 6000); return false; }
}

function live(x) {
  if (x.show === false) return ["숨김", "off"];
  const n = new Date(), a = x.start ? new Date(x.start) : null, b = x.end ? new Date(x.end) : null;
  if (a && n < a) return ["예약", "wait"];
  if (b && n >= b) return ["종료", "off"];
  return ["노출중", "main"];
}
const fmt = (v) => v ? String(v).replace("T", " ").slice(0, 16) : "";
const when = (x) => x.start || x.end ? `${fmt(x.start) || "바로"} ~ ${fmt(x.end) || "계속"}` : "기간 제한 없음";
const thumb = (p, icon) => p ? `<img src="${esc(img(p))}" alt="" loading="lazy">` : (IC[icon] || IC.flat || "");

/* ───────── 화면 틀 ───────── */
function counts() {
  Object.keys(LISTS).forEach((k) => { const el = $("#cnt-" + k); if (el) el.textContent = (D[k].items || []).length; });
  const q = $("#cnt-inq"); q.textContent = S.inqCount ? S.inqCount : ""; q.classList.toggle("alert", !!S.inqCount);
}
function go(v) { S.view = v; S.edit = null; S.filter = "all"; S.sel.clear(); render(); window.scrollTo(0, 0); }

function render() {
  $$("#side button[data-v]").forEach((b) => b.setAttribute("aria-current", b.dataset.v === S.view));
  if ($("#crumb")) $("#crumb").textContent = NAME[S.view] || "";
  counts();
  const v = S.view;
  if (v === "inquiries") return renderInquiries();
  if (v === "stats") return renderStats();
  if (v === "site") return renderSite();
  if (S.edit) return renderEditor();
  renderList();
}

/* ───────── 목록 (선택·노출·순서·삭제) ───────── */
function renderList() {
  const v = S.view, L = LISTS[v], items = D[v].items;
  let rows = items.map((x, i) => ({ x, i }));
  if (v === "products" && S.filter !== "all") rows = rows.filter((o) => o.x.category === S.filter);
  const chips = v === "products" ? `<div class="chips">${[["all", "전체"], ...Object.entries(CATS)].map(([k, l]) => `<button data-f="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join("")}</div>` : "";
  const ordered = v === "banners" || v === "cases" || (v === "products" && S.filter !== "all");
  const hint = {
    products: "노출을 끄면 사이트에서 바로 빠지고, 다시 켜면 돌아와요. 안 만드는 품목은 삭제보다 노출 끄기를 권해요.",
    cases: `사이트는 한 페이지에 9개(3개씩 3줄)씩 보여주고, 넘치면 아래 숫자 탭으로 넘어가요. ★ 메인으로 지정한 사례(최대 ${CASE_MAIN_MAX}개)가 첫 페이지에 먼저 나와요. 화살표로 순서를 바꿀 수 있어요.`,
    banners: "목록 순서대로 슬라이드가 넘어가요. 예약 기간이 아닌 배너는 자동으로 빠져요.",
    notices: "'상단 띠'를 켠 공지는 1면 맨 위에 떠요. 모든 공지는 사이트 공지사항 게시판에 올라가요.",
    popups: "예약 기간 동안 사이트 첫 화면에 팝업으로 떠요. 방문자는 '오늘 하루 보지 않기'를 누를 수 있어요."
  }[v];

  const row = ({ x, i }, pos, arr) => {
    const [st, cls] = v === "products" || v === "cases" ? (x.show === false ? ["숨김", "off"] : ["노출", "main"]) : live(x);
    let th = "", title = "", sub = "", meta = "";
    if (v === "products") { th = thumb(x.image, x.icon); title = x.name; sub = `${CATS[x.category] || ""} · ${x.spec || ""}`;
      meta = `${x.best ? '<span class="pill main">메인</span>' : ""}${(x.badges || []).map((b) => `<span class="pill ${b === "HOT" ? "hot" : ""}">${b}</span>`).join("")}${x.image ? "" : '<span class="pill off">사진 없음</span>'}`; }
    if (v === "cases") { th = thumb(x.image, x.icon); title = x.title; sub = x.spec || "";
      meta = `${x.image ? "" : '<span class="pill off">사진 없음</span>'}<button type="button" class="star" data-main="${i}" aria-pressed="${!!x.main}" title="메인(첫 페이지) 노출">★ 메인</button>`; }
    if (v === "banners") { th = x.image ? thumb(x.image) : (IC.pouch || ""); title = String(x.title || "").replace(/\n/g, " "); sub = `${x.tag || ""} · ${when(x)}`; meta = `<span class="pill ${cls}">${st}</span>`; }
    if (v === "notices") { th = `<b style="font-size:12px;color:var(--brand-dark)">${x.pinned ? "중요" : "공지"}</b>`; title = x.title; sub = `${x.date || ""} · ${when(x)}`; meta = `${x.topbar ? '<span class="pill main">상단 띠</span>' : ""}<span class="pill ${cls}">${st}</span>`; }
    if (v === "popups") { th = x.image ? thumb(x.image) : (IC.sticker || ""); title = x.title; sub = when(x); meta = `<span class="pill ${cls}">${st}</span>`; }
    const order = ordered ? `<span class="order"><button data-up="${i}" ${pos === 0 ? "disabled" : ""} aria-label="위로">▲</button><button data-down="${i}" ${pos === arr.length - 1 ? "disabled" : ""} aria-label="아래로">▼</button></span>` : "";
    return `<div class="row ${x.show === false ? "hidden-item" : ""}">
      <input type="checkbox" class="ck" data-i="${i}" ${S.sel.has(i) ? "checked" : ""} aria-label="${esc(title)} 선택">
      <span class="th">${th}</span>
      <button class="open" data-i="${i}"><span class="t"><b>${esc(title || "(제목 없음)")}</b><span>${esc(sub)}</span></span></button>
      <span class="meta">${meta}${order}</span>
      <label class="toggle" title="사이트 노출"><input type="checkbox" data-show="${i}" ${x.show !== false ? "checked" : ""} aria-label="${esc(title)} 노출"><span>노출</span></label>
    </div>`;
  };

  const n = S.sel.size;
  const allOn = rows.length && rows.every((o) => S.sel.has(o.i));
  $("#main").innerHTML = `
    <div class="head"><h1>${L.title}</h1><span class="saving" id="saving"></span><div class="sp"></div><button class="btn primary" id="add">+ 새로 추가</button></div>
    ${chips}
    <div class="list">
      <div class="listhead">
        <label><input type="checkbox" id="selall" ${allOn ? "checked" : ""}> 전체 선택</label>
        <span style="color:var(--muted)">${rows.length}개${v === "products" || v === "cases" ? ` · 노출 ${rows.filter((o) => o.x.show !== false).length}` : ""}${v === "cases" ? ` · <b style="color:${mainCount() >= CASE_MAIN_MAX ? "var(--hot)" : "var(--brand-dark)"}">메인 ${mainCount()}/${CASE_MAIN_MAX}</b>` : ""}</span>
        <div class="bulk" ${n ? "" : "hidden"}>
          <span class="n">${n}개 선택</span>
          ${v === "cases" ? '<button class="btn" data-bulk="main">★ 메인 지정</button><button class="btn" data-bulk="unmain">메인 해제</button>' : ""}
          <button class="btn" data-bulk="show">노출</button>
          <button class="btn" data-bulk="hide">숨김</button>
          <span id="bulkdel"><button class="btn danger" data-bulk="del">삭제</button></span>
        </div>
      </div>
      ${rows.length ? rows.map(row).join("") : '<p class="empty">항목이 없어요. 오른쪽 위 버튼으로 추가해 보세요.</p>'}
    </div>
    <p class="hint" style="margin-top:10px">${hint}</p>`;

  $$(".chips button").forEach((b) => b.onclick = () => { S.filter = b.dataset.f; S.sel.clear(); renderList(); });
  $$(".row .open").forEach((b) => b.onclick = () => { S.edit = { i: +b.dataset.i, d: clone(items[+b.dataset.i]) }; render(); });
  $$(".row .ck").forEach((c) => c.onchange = () => { c.checked ? S.sel.add(+c.dataset.i) : S.sel.delete(+c.dataset.i); renderList(); });
  $("#selall").onchange = (e) => { rows.forEach((o) => e.target.checked ? S.sel.add(o.i) : S.sel.delete(o.i)); renderList(); };
  $$("[data-show]").forEach((c) => c.onchange = async () => {
    const x = items[+c.dataset.show]; x.show = c.checked; renderList();
    if (!(await persist(L.file, `${c.checked ? "노출" : "숨김"}: ${x.name || x.title}`))) { x.show = !c.checked; renderList(); }
  });
  $$("[data-main]").forEach((b) => b.onclick = async () => {
    const x = items[+b.dataset.main], on = !x.main;
    if (on && mainCount() >= CASE_MAIN_MAX) return toast(`메인은 최대 ${CASE_MAIN_MAX}개까지예요. 다른 사례의 메인을 먼저 해제해 주세요.`, 5000);
    x.main = on; renderList();
    if (!(await persist(L.file, `메인 ${on ? "지정" : "해제"}: ${x.title}`))) { x.main = !on; renderList(); }
  });
  const move = async (i, d) => {
    const pool = rows.map((o) => o.i), p = pool.indexOf(i), j = pool[p + d];
    if (j === undefined) return;
    [items[i], items[j]] = [items[j], items[i]]; S.sel.clear(); renderList();
    await persist(L.file, `순서 변경: ${L.label}`);
  };
  $$("[data-up]").forEach((b) => b.onclick = () => move(+b.dataset.up, -1));
  $$("[data-down]").forEach((b) => b.onclick = () => move(+b.dataset.down, 1));
  $$("[data-bulk]").forEach((b) => b.onclick = async () => {
    const idx = [...S.sel].sort((a, c) => c - a);
    if (b.dataset.bulk === "del") {
      $("#bulkdel").innerHTML = `<span class="confirm">${idx.length}개를 삭제할까요? <button class="btn danger" id="bdyes">삭제</button><button class="btn" id="bdno">아니요</button></span>`;
      $("#bdno").onclick = () => renderList();
      $("#bdyes").onclick = async () => {
        const backup = clone(items);
        idx.forEach((i) => items.splice(i, 1)); S.sel.clear(); renderList();
        if (!(await persist(L.file, `삭제: ${L.label} ${idx.length}개`))) { D[v].items = backup; renderList(); }
      };
      return;
    }
    if (b.dataset.bulk === "main" || b.dataset.bulk === "unmain") {
      const on = b.dataset.bulk === "main";
      const add = idx.filter((i) => !items[i].main).length;
      if (on && mainCount() + add > CASE_MAIN_MAX) return toast(`메인은 최대 ${CASE_MAIN_MAX}개까지예요. 지금 ${mainCount()}개가 지정돼 있어요.`, 5000);
      idx.forEach((i) => items[i].main = on); S.sel.clear(); renderList();
      await persist(L.file, `메인 ${on ? "지정" : "해제"}: 제작사례 ${idx.length}개`);
      return;
    }
    const on = b.dataset.bulk === "show";
    idx.forEach((i) => items[i].show = on); S.sel.clear(); renderList();
    await persist(L.file, `${on ? "노출" : "숨김"}: ${L.label} ${idx.length}개`);
  });
  $("#add").onclick = () => {
    const blank = {
      products: { show: true, category: S.filter !== "all" ? S.filter : "bread", name: "", spec: "", moq: "상담", tags: [], badges: [], best: false, image: "", icon: "flat" },
      cases: { show: true, main: false, title: "", spec: "", image: "", icon: "flat" },
      banners: { show: true, tag: "", title: "", subtitle: "", button: "견적 받아보기", color: "soft", image: "", start: "", end: "" },
      notices: { show: true, title: "", date: new Date().toLocaleDateString("sv-SE"), body: "", pinned: false, topbar: false, start: "", end: "" },
      popups: { show: true, title: "", image: "", body: "", button: "견적 문의하기", link: "#quote", start: "", end: "" }
    }[v];
    S.edit = { i: -1, d: blank }; render();
  };
}

/* ───────── 편집 ───────── */
const showToggle = (d, label = "사이트에 노출") => `<label class="toggle" for="e-show"><input type="checkbox" id="e-show" data-k="show" ${d.show !== false ? "checked" : ""}> ${label}</label>`;
const sched = (d) => {
  const v = (x) => x ? String(x).slice(0, 16) : "";
  return `<div class="two">
    <div class="field"><label for="e-start">노출 시작 (예약)</label><input type="datetime-local" id="e-start" data-k="start" value="${v(d.start)}"><span class="hint">비워두면 바로 노출</span></div>
    <div class="field"><label for="e-end">노출 종료 (예약)</label><input type="datetime-local" id="e-end" data-k="end" value="${v(d.end)}"><span class="hint">이 시각이 되면 자동으로 내려가요</span></div></div>`;
};
const iconSel = (d) => `<div class="field"><label for="e-icon">사진 없을 때 일러스트</label><select id="e-icon" data-k="icon">${ICONS.map((k) => `<option ${d.icon === k ? "selected" : ""}>${k}</option>`).join("")}</select></div>`;
const upload = (hint) => `<div class="field"><span class="fl">사진</span>
  <div class="upload" id="up"><div class="pv" id="up-pv"></div>
    <div class="act"><label class="pick" for="e-file">사진 선택</label><input type="file" id="e-file" accept="image/*">
      <span class="file" id="up-name"></span><span class="hint">${hint} · 끌어다 놓아도 돼요 · 큰 사진은 자동으로 줄여서 올려요</span>
      <button type="button" class="btn" id="up-clear" style="align-self:flex-start">사진 빼기</button></div></div></div>`;

function renderEditor() {
  const v = S.view, L = LISTS[v], e = S.edit, d = e.d;
  let f = "";
  if (v === "products") f = `${showToggle(d)}
    <div class="two">
      <div class="field"><label for="e-cat">카테고리</label><select id="e-cat" data-k="category">${Object.entries(CATS).map(([k, l]) => `<option value="${k}" ${d.category === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field"><label for="e-name">품목명</label><input type="text" id="e-name" data-k="name" value="${esc(d.name)}" placeholder="예) 투명 스탠드 지퍼 파우치"></div>
    </div>
    ${upload("정사각형 사진 권장 (예: 800×800)")}
    <div class="two">
      <div class="field"><label for="e-spec">원단·사양</label><input type="text" id="e-spec" data-k="spec" value="${esc(d.spec)}" placeholder="예) PET 12 / LLDPE 70"></div>
      <div class="field"><label for="e-moq">수량 안내</label><input type="text" id="e-moq" data-k="moq" value="${esc(d.moq)}" placeholder="예) 소량 상담, 3,000매부터"></div>
    </div>
    <div class="field"><span class="fl">태그</span><div class="tagbox" id="tagbox"></div><span class="hint">입력하고 Enter를 누르면 추가돼요</span></div>
    <div class="field"><span class="fl">배지</span><div class="checks">${["BEST", "HOT", "NEW"].map((b) => `<label><input type="checkbox" class="badge-ck" value="${b}" ${(d.badges || []).includes(b) ? "checked" : ""}>${b}</label>`).join("")}</div></div>
    <label class="toggle" for="e-best"><input type="checkbox" id="e-best" data-k="best" ${d.best ? "checked" : ""}> 메인 '가장 많이 제작하는 품목'에 노출</label>
    ${iconSel(d)}`;
  if (v === "cases") f = `${showToggle(d)}
    <label class="toggle" for="e-main"><input type="checkbox" id="e-main" data-k="main" ${d.main ? "checked" : ""}> ★ 메인(첫 페이지) 노출 <span class="hint">· 지금 ${mainCount(e.i)}/${CASE_MAIN_MAX}개 사용 중</span></label>
    <div class="field"><label for="e-ct">제목</label><input type="text" id="e-ct" data-k="title" value="${esc(d.title)}" placeholder="예) 동네 베이커리 식빵 봉투"></div>
    <div class="field"><label for="e-cs">사양</label><input type="text" id="e-cs" data-k="spec" value="${esc(d.spec)}" placeholder="예) OPP 40μm · 2도 인쇄 · 5,000매"></div>
    ${upload("4:3 가로 사진 권장")}${iconSel(d)}`;
  if (v === "banners") f = `${showToggle(d, "보이기")}
    <div class="field"><label for="e-tag">작은 라벨</label><input type="text" id="e-tag" data-k="tag" value="${esc(d.tag)}" placeholder="예) 베이커리 전용"></div>
    <div class="field"><label for="e-title">제목</label><textarea id="e-title" data-k="title" placeholder="줄바꿈하면 화면에서도 줄이 바뀌어요">${esc(d.title)}</textarea></div>
    <div class="field"><label for="e-sub">설명</label><input type="text" id="e-sub" data-k="subtitle" value="${esc(d.subtitle)}"></div>
    <div class="two">
      <div class="field"><label for="e-btn">버튼 문구</label><input type="text" id="e-btn" data-k="button" value="${esc(d.button)}"></div>
      <div class="field"><label for="e-color">배경색</label><select id="e-color" data-k="color">${Object.entries(COLORS).map(([k, l]) => `<option value="${k}" ${d.color === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    </div>
    ${upload("가로 사진 권장 (예: 1200×800). 비워두면 기본 일러스트가 나와요.")}${sched(d)}`;
  if (v === "notices") f = `${showToggle(d, "보이기")}
    <div class="field"><label for="e-nt">제목</label><input type="text" id="e-nt" data-k="title" value="${esc(d.title)}" placeholder="예) 추석 연휴 휴무 안내"></div>
    <div class="field"><label for="e-nd">게시일</label><input type="date" id="e-nd" data-k="date" value="${esc(d.date)}"></div>
    <div class="field"><label for="e-nb">내용</label><textarea id="e-nb" data-k="body" style="min-height:130px">${esc(d.body)}</textarea></div>
    <label class="toggle" for="e-pin"><input type="checkbox" id="e-pin" data-k="pinned" ${d.pinned ? "checked" : ""}> 게시판 맨 위 고정 (중요)</label>
    <label class="toggle" for="e-top"><input type="checkbox" id="e-top" data-k="topbar" ${d.topbar ? "checked" : ""}> 1면 맨 위 공지 띠에 노출</label>
    ${sched(d)}`;
  if (v === "popups") f = `${showToggle(d, "보이기")}
    <div class="field"><label for="e-pt">제목</label><input type="text" id="e-pt" data-k="title" value="${esc(d.title)}" placeholder="예) 첫 주문 동판비 할인"></div>
    ${upload("4:3 가로 이미지 권장")}
    <div class="field"><label for="e-pb">설명</label><textarea id="e-pb" data-k="body">${esc(d.body)}</textarea></div>
    <div class="two">
      <div class="field"><label for="e-pbtn">버튼 문구</label><input type="text" id="e-pbtn" data-k="button" value="${esc(d.button)}"><span class="hint">비워두면 버튼 없음</span></div>
      <div class="field"><label for="e-plink">링크</label><input type="text" id="e-plink" data-k="link" value="${esc(d.link)}"><span class="hint">#quote, #notice 또는 https:// 주소</span></div>
    </div>${sched(d)}`;

  $("#main").innerHTML = `
    <div class="head"><button class="btn" id="back">← 목록</button><h1>${e.i < 0 ? "새 " + L.label : L.label + " 수정"}</h1><span class="saving" id="saving"></span></div>
    <div class="editor">
      <div class="form">${f}
        <div class="actions"><button class="btn primary" id="save">저장</button><button class="btn" id="cancel">취소</button><span class="sp"></span>
          ${e.i >= 0 ? '<span id="delwrap"><button class="btn danger" id="del">삭제</button></span>' : ""}</div>
      </div>
      <aside class="pvbox"><p class="cap">사이트에 이렇게 보여요</p><div class="pvsite" id="pv"></div></aside>
    </div>`;

  $$("[data-k]").forEach((el) => {
    const ev = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(ev, () => { d[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value; preview(); });
  });
  $$(".badge-ck").forEach((c) => c.onchange = () => { d.badges = $$(".badge-ck:checked").map((x) => x.value); preview(); });
  if ($("#tagbox")) tags(d);
  if ($("#up")) bindUpload(d);
  $("#back").onclick = $("#cancel").onclick = () => { S.edit = null; render(); };
  $("#save").onclick = async () => {
    const need = v === "products" ? d.name : d.title;
    if (!String(need || "").trim()) return toast(v === "products" ? "품목명을 입력해 주세요." : "제목을 입력해 주세요.");
    if (d.start && d.end && new Date(d.end) <= new Date(d.start)) return toast("노출 종료가 시작보다 뒤여야 해요.");
    if (v === "cases" && d.main && mainCount(e.i) >= CASE_MAIN_MAX) return toast(`메인은 최대 ${CASE_MAIN_MAX}개까지예요. 다른 사례의 메인을 먼저 해제해 주세요.`, 5000);
    const items = D[v].items, backup = clone(items);
    if (e.i < 0) items.push(d); else items[e.i] = d;
    $("#save").disabled = true;
    if (await persist(L.file, `${e.i < 0 ? "추가" : "수정"}: ${d.name || d.title}`)) { S.edit = null; render(); }
    else { D[v].items = backup; $("#save").disabled = false; }
  };
  if ($("#del")) $("#del").onclick = () => {
    $("#delwrap").innerHTML = `<span class="confirm">정말 삭제할까요? <button class="btn danger" id="yes">삭제</button><button class="btn" id="no">아니요</button></span>`;
    $("#no").onclick = () => renderEditor();
    $("#yes").onclick = async () => {
      const items = D[v].items, backup = clone(items);
      items.splice(e.i, 1);
      if (await persist(L.file, `삭제: ${d.name || d.title}`)) { S.edit = null; render(); } else D[v].items = backup;
    };
  };
  preview();
}

function bindUpload(d) {
  const pv = $("#up-pv"), nm = $("#up-name"), clr = $("#up-clear"), up = $("#up");
  const show = (busy) => {
    pv.innerHTML = d.image ? `<img src="${esc(img(d.image))}" alt="">` : (IC[d.icon] || IC.pouch || "");
    nm.textContent = busy ? "올리는 중…" : d.image ? (String(d.image).startsWith("data:") ? "새 사진 (체험판)" : String(d.image).split("?")[0].split("/").slice(-1)[0]) : "사진 없음 (일러스트로 표시)";
    clr.hidden = !d.image;
  };
  const read = async (file) => {
    if (!file || !file.type.startsWith("image/")) return toast("이미지 파일만 올릴 수 있어요.");
    show(true);
    try { d.image = await Store.upload(file); show(); preview(); if (!DEMO) toast("사진을 올렸어요. 저장을 눌러야 사이트에 반영돼요."); }
    catch (err) { show(); toast(err.message, 6000); }
  };
  $("#e-file").onchange = (ev) => read(ev.target.files[0]);
  clr.onclick = () => { d.image = ""; show(); preview(); };
  up.addEventListener("dragover", (ev) => { ev.preventDefault(); up.classList.add("drag"); });
  up.addEventListener("dragleave", () => up.classList.remove("drag"));
  up.addEventListener("drop", (ev) => { ev.preventDefault(); up.classList.remove("drag"); read(ev.dataTransfer.files[0]); });
  show();
}

function tags(d) {
  const box = $("#tagbox");
  const draw = () => {
    box.innerHTML = (d.tags || []).map((t, i) => `<span>${esc(t)}<button type="button" data-i="${i}" aria-label="${esc(t)} 삭제">×</button></span>`).join("") + `<input type="text" id="tagin" placeholder="태그 입력" aria-label="태그 입력">`;
    $$("button", box).forEach((b) => b.onclick = () => { d.tags.splice(+b.dataset.i, 1); draw(); preview(); });
    const inp = $("#tagin");
    inp.onkeydown = (ev) => { if (ev.key === "Enter" && !ev.isComposing && inp.value.trim()) { ev.preventDefault(); (d.tags = d.tags || []).push(inp.value.trim()); draw(); preview(); $("#tagin").focus(); } };
  };
  draw();
}

function preview() {
  const v = S.view, d = S.edit.d, pv = $("#pv");
  const state = (x) => `<p class="hint" style="margin-top:10px;color:#777">상태: ${live(x)[0]} · ${when(x)}</p>`;
  if (v === "products") {
    const b = (d.badges || []).length ? `<div class="badge">${d.badges.map((x) => `<span class="${x === "HOT" ? "hot" : ""}">${x}</span>`).join("")}</div>` : "";
    pv.innerHTML = `<div class="card"><div class="thumb">${b}${thumb(d.image, d.icon)}</div><h3>${esc(d.name || "품목명")}</h3><p class="spec">${esc(d.spec || "원단·사양")}</p><p class="price">견적문의<small>${esc(d.moq || "")}</small></p><div class="tags">${(d.tags || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div></div>
      <p class="hint" style="margin-top:10px;color:#777">${d.show === false ? "숨김 상태라 사이트에 보이지 않아요" : `${d.best ? "메인과 " : ""}'${CATS[d.category]}' 탭에 보여요`}</p>`;
  } else if (v === "cases") {
    pv.innerHTML = `<div class="card"><div class="thumb" style="aspect-ratio:4/3">${thumb(d.image, d.icon)}</div><h3 style="font-weight:700">${esc(d.title || "제목")}</h3><p class="spec">${esc(d.spec || "사양")}</p></div>
      <p class="hint" style="margin-top:10px;color:#777">${d.show === false ? "숨김 상태라 사이트에 보이지 않아요" : d.main ? "메인: 제작사례 첫 페이지에 먼저 보여요" : "제작사례 목록에 보여요 (메인 사례 다음 순서)"}</p>`;
  } else if (v === "banners") {
    pv.innerHTML = `<div class="pvban ${d.color}">${d.image ? `<div class="img"><img src="${esc(img(d.image))}" alt=""></div>` : ""}${d.tag ? `<span class="tg">${esc(d.tag)}</span>` : ""}<h3>${esc(d.title || "제목").replace(/\n/g, "<br>")}</h3>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ""}<span class="go">${esc(d.button || "견적 받아보기")}</span></div>${state(d)}`;
  } else if (v === "notices") {
    pv.innerHTML = `${d.topbar ? `<div style="background:#222;color:#fff;font-size:12.5px;padding:8px 10px;border-radius:4px;display:flex;gap:8px;align-items:center;margin-bottom:12px"><span style="background:#1a8f5c;font-size:11px;font-weight:700;padding:1px 6px;border-radius:3px;flex-shrink:0">공지</span><span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(d.title || "제목")}</span></div>` : ""}
      <div style="border-top:2px solid #222"><div style="display:flex;gap:8px;align-items:center;padding:12px 4px;border-bottom:1px solid #e5e5e5"><span style="font-size:11px;font-weight:700;padding:1px 7px;border-radius:3px;${d.pinned ? "background:#1a8f5c;color:#fff" : "border:1px solid #e5e5e5;color:#777"}">${d.pinned ? "중요" : "공지"}</span><b style="font-weight:500;flex:1;min-width:0">${esc(d.title || "제목")}</b><span style="font-size:12px;color:#777">${esc(d.date || "")}</span></div>
      <div style="background:#f4f6f5;padding:12px;font-size:13px;white-space:pre-line;margin-top:8px;border-radius:4px">${esc(d.body || "내용")}</div></div>${state(d)}`;
  } else if (v === "popups") {
    pv.innerHTML = `<div style="background:rgba(0,0,0,.45);padding:14px;border-radius:6px"><div style="background:#fff;border-radius:8px;overflow:hidden">
      ${d.image ? `<div style="aspect-ratio:4/3;overflow:hidden"><img src="${esc(img(d.image))}" alt="" style="width:100%;height:100%;object-fit:cover"></div>` : ""}
      <div style="padding:14px"><b style="font-size:16px;font-weight:900">${esc(d.title || "제목")}</b><p style="font-size:12.5px;color:#777;white-space:pre-line;margin-top:4px">${esc(d.body || "")}</p>${d.button ? `<span style="display:inline-block;margin-top:8px;background:#1a8f5c;color:#fff;font-size:12px;font-weight:700;padding:6px 12px;border-radius:3px">${esc(d.button)}</span>` : ""}</div>
      <div style="display:flex;border-top:1px solid #e5e5e5;font-size:12px"><span style="flex:1;padding:9px;text-align:center">오늘 하루 보지 않기</span><span style="flex:1;padding:9px;text-align:center;border-left:1px solid #e5e5e5;font-weight:700">닫기</span></div></div></div>${state(d)}`;
  }
}

/* ───────── 회사 정보 ───────── */
function renderSite() {
  const s = clone(D.site);
  const F = [["company", "업체명"], ["tagline", "상단 한 줄 소개"], ["phone", "대표 전화"], ["email", "화면에 보이는 이메일"],
    ["inquiry_endpoint", "문의 기록 주소 (Apps Script 웹앱 URL)", "README '견적 문의 기록' 설치 후 받은 https://script.google.com/macros/s/…/exec 주소. 문의 기록, 알림 메일, 접속 통계가 여기로 연결돼요."],
    ["inquiry_email", "예비 수신 이메일", "문의 기록 주소를 비워둔 경우에만 쓰는 예비 메일 경로(FormSubmit)예요."],
    ["inquiry_cc", "예비 경로 참조 이메일", "쉼표로 여러 개. 알림 메일 받는 주소는 Apps Script 코드의 NOTIFY_EMAILS 에서 정해요."],
    ["hours", "상담 시간"], ["lunch", "점심 시간"], ["closed", "휴무"], ["ceo", "대표자"], ["bizno", "사업자등록번호"], ["salesno", "통신판매업신고번호"], ["privacy", "개인정보보호책임자"], ["address", "주소"]];
  $("#main").innerHTML = `
    <div class="head"><h1>회사 정보 · 연락처</h1><span class="saving" id="saving"></span></div>
    <div class="form" style="max-width:780px">
      <div class="two">${F.map(([k, l, h]) => `<div class="field" ${h ? 'style="grid-column:1/-1"' : ""}><label for="s-${k}">${l}</label><input type="${k === "email" ? "email" : "text"}" id="s-${k}" data-s="${k}" value="${esc(Array.isArray(s[k]) ? s[k].join(", ") : s[k])}">${h ? `<span class="hint">${h}</span>` : ""}</div>`).join("")}</div>
      <div class="field"><label for="s-kw">검색창 인기 키워드</label><input type="text" id="s-kw" value="${esc((s.keywords || []).join(", "))}"><span class="hint">쉼표로 구분</span></div>
      <div class="field"><span class="fl">초록 띠 강점 (4개 권장)</span>
        ${(s.strengths || []).map((x, i) => `<div class="two"><input type="text" aria-label="강점 ${i + 1} 제목" data-st="${i}" data-f="title" value="${esc(x.title)}"><input type="text" aria-label="강점 ${i + 1} 설명" data-st="${i}" data-f="desc" value="${esc(x.desc)}"></div>`).join("")}
      </div>
      <div class="actions"><button class="btn primary" id="ssave">저장</button></div>
    </div>`;
  $("#ssave").onclick = async () => {
    $$("[data-s]").forEach((el) => s[el.dataset.s] = el.value.trim());
    s.inquiry_cc = String(s.inquiry_cc || "").split(",").map((x) => x.trim()).filter(Boolean);
    s.keywords = $("#s-kw").value.split(",").map((x) => x.trim()).filter(Boolean);
    $$("[data-st]").forEach((el) => s.strengths[+el.dataset.st][el.dataset.f] = el.value);
    const backup = D.site; D.site = s;
    if (!(await persist("site", "수정: 회사 정보"))) D.site = backup;
  };
}

/* ───────── 견적 문의 · 접속 통계 (Apps Script 비밀번호) ───────── */
function needRemote(title, then) {
  if (DEMO) return then();
  const main = $("#main");
  if (!Remote.endpoint()) {
    main.innerHTML = `<div class="head"><h1>${title}</h1></div><div class="inline-gate"><b>문의 기록이 아직 연결되지 않았어요</b>
      <p class="hint">README의 '견적 문의 기록' 순서대로 Apps Script를 설치하고, 회사 정보 · 연락처의 '문의 기록 주소'에 웹앱 URL을 넣어 주세요.</p>
      <button class="btn primary" id="gosite" style="align-self:flex-start">회사 정보로 가기</button></div>`;
    $("#gosite").onclick = () => go("site");
    return;
  }
  if (Remote.key) return then();
  main.innerHTML = `<div class="head"><h1>${title}</h1></div><form class="inline-gate" id="kf">
    <b>관리자 비밀번호</b><p class="hint">Apps Script 스크립트 속성에 넣은 ADMIN_KEY 를 입력하세요.</p>
    <input type="password" id="kpw" autocomplete="current-password" aria-label="관리자 비밀번호">
    <p class="hint" id="kerr" style="color:var(--hot)"></p><button class="btn primary" type="submit" style="align-self:flex-start">확인</button></form>`;
  $("#kpw").focus();
  $("#kf").onsubmit = async (ev) => {
    ev.preventDefault(); Remote.key = $("#kpw").value; $("#kerr").textContent = "확인하는 중…";
    try { await Remote.call({ action: "check" }); LS.set("envy_admin_key", Remote.key); then(); }
    catch (err) { Remote.key = ""; $("#kerr").textContent = err.message; }
  };
}

function renderInquiries() {
  needRemote("견적 문의", () => {
    const api = { list: async () => { const r = await InqAPI.list(); S.inqCount = (r.items || []).filter((x) => x["상태"] !== "처리완료").length; counts(); return r; },
      update: async (p) => { const r = await InqAPI.update(p); const l = await InqAPI.list(); S.inqCount = (l.items || []).filter((x) => x["상태"] !== "처리완료").length; counts(); return r; } };
    window.mountInquiries($("#main"), api);
  });
}

function renderStats(days = 30) {
  needRemote("접속 통계", async () => {
    const main = $("#main");
    main.innerHTML = `<div class="head"><h1>접속 통계</h1><div class="sp"></div>
      <div class="chips rangebtns">${[7, 30, 90].map((n) => `<button data-d="${n}" aria-pressed="${n === days}">${n}일</button>`).join("")}</div>
      <button class="btn" id="st-re">새로고침</button></div><p class="empty">통계를 불러오는 중…</p>`;
    const bind = () => { $$("[data-d]").forEach((b) => b.onclick = () => renderStats(+b.dataset.d)); $("#st-re").onclick = () => renderStats(days); };
    bind();
    let r;
    try { r = await StatsAPI.get(days); } catch (e) { main.querySelector(".empty").textContent = e.message; return; }
    const ds = r.days || [], today = ds[ds.length - 1] || { pv: 0, uv: 0, inq: 0 };
    const sum = (k) => ds.reduce((a, x) => a + (x[k] || 0), 0);
    const uvSum = r.visitors ?? sum("uv"), inq = sum("inq");
    const rate = uvSum ? (inq / uvSum * 100).toFixed(1) : "0.0";
    const dev = r.devices || {}, devT = (dev["PC"] || 0) + (dev["모바일"] || 0) || 1;
    const rank = (list, empty) => list && list.length ? `<table class="rank">${list.map((x) => `<tr><td><span class="nm">${esc(x.name)}</span><div class="track"><div class="fill" style="width:${Math.max(3, x.count / list[0].count * 100)}%"></div></div></td><td class="num">${x.count}</td></tr>`).join("")}</table>` : `<p class="hint">${empty}</p>`;
    main.innerHTML = `
      <div class="head"><h1>접속 통계</h1><div class="sp"></div>
        <div class="chips rangebtns">${[7, 30, 90].map((n) => `<button data-d="${n}" aria-pressed="${n === days}">${n}일</button>`).join("")}</div>
        <button class="btn" id="st-re">새로고침</button></div>
      <div class="kpis">
        <div class="kpi"><span>오늘 방문자</span><b>${today.uv.toLocaleString()}</b><small>페이지뷰 ${today.pv.toLocaleString()}</small></div>
        <div class="kpi"><span>${days}일 방문자</span><b>${uvSum.toLocaleString()}</b><small>페이지뷰 ${sum("pv").toLocaleString()}</small></div>
        <div class="kpi"><span>${days}일 견적 문의</span><b>${inq.toLocaleString()}</b><small>오늘 ${today.inq}건</small></div>
        <div class="kpi"><span>문의 전환율</span><b>${rate}%</b><small>문의 ÷ 방문자</small></div>
      </div>
      <div class="panel"><h2>일별 방문자</h2><p class="sub">막대에 마우스를 올리거나 누르면 그날 방문자·페이지뷰·문의가 보여요</p>
        <div class="chartbox" id="chart"></div>
        <details class="datatable"><summary>표로 보기</summary><div style="overflow-x:auto"><table><thead><tr><th>날짜</th><th>방문자</th><th>페이지뷰</th><th>문의</th></tr></thead>
          <tbody>${ds.slice().reverse().map((x) => `<tr><td>${x.date}</td><td>${x.uv}</td><td>${x.pv}</td><td>${x.inq}</td></tr>`).join("")}</tbody></table></div></details>
      </div>
      <div class="two-col">
        <div class="panel"><h2>유입 경로</h2><p class="sub">방문자가 어디서 왔는지 (${days}일)</p>${rank(r.referrers, "아직 기록이 없어요.")}</div>
        <div class="panel"><h2>광고 캠페인 (utm_source)</h2><p class="sub">광고 링크에 ?utm_source=naver 처럼 붙이면 여기서 구분돼요</p>${rank(r.sources, "utm 이 붙은 방문이 아직 없어요.")}</div>
      </div>
      <div class="panel"><h2>기기</h2>
        <div class="devbar" role="img" aria-label="PC ${dev["PC"] || 0}명, 모바일 ${dev["모바일"] || 0}명"><i style="width:${(dev["PC"] || 0) / devT * 100}%"></i><i style="width:${(dev["모바일"] || 0) / devT * 100}%"></i></div>
        <div class="devlegend"><span><span class="dot"></span>PC <b>${dev["PC"] || 0}</b> (${Math.round((dev["PC"] || 0) / devT * 100)}%)</span><span><span class="dot b"></span>모바일 <b>${dev["모바일"] || 0}</b> (${Math.round((dev["모바일"] || 0) / devT * 100)}%)</span></div>
      </div>
      ${DEMO ? '<p class="hint">체험판은 예시 숫자예요. 실제로는 사이트 방문이 구글 시트 \'방문\' 탭에 쌓이고 여기서 집계돼요.</p>' : '<p class="hint">방문 기록은 구글 시트 \'방문\' 탭에 쌓여요. 이름·IP 같은 개인정보는 저장하지 않아요.</p>'}`;
    bind();
    drawBars($("#chart"), ds);
  });
}

/* 일별 방문자 막대 (한 가지 값, 한 가지 색, 마우스 올리면 상세) */
function drawBars(box, ds) {
  const W = 760, H = 220, P = { l: 36, r: 8, t: 12, b: 26 };
  const max = Math.max(4, ...ds.map((x) => x.uv));
  const step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step) * step;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(nice * k));
  const iw = W - P.l - P.r, ih = H - P.t - P.b, bw = iw / ds.length, gap = Math.min(4, bw * 0.25);
  const y = (v) => P.t + ih - v / nice * ih;
  const every = Math.ceil(ds.length / 8);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="일별 방문자 막대 그래프">`;
  ticks.forEach((t) => { svg += `<line class="gl" x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${P.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`; });
  ds.forEach((x, i) => {
    const bx = P.l + i * bw + gap / 2, w = Math.max(1, bw - gap), h = Math.max(0, ih - (y(x.uv) - P.t)), r = Math.min(4, w / 2, h);
    const top = y(x.uv);
    const path = h > 0 ? `M${bx},${P.t + ih} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + w - r} Q${bx + w},${top} ${bx + w},${top + r} V${P.t + ih} Z` : "";
    svg += `<g data-i="${i}"><rect class="hit" x="${P.l + i * bw}" y="${P.t}" width="${bw}" height="${ih}"/>${path ? `<path class="bar" d="${path}"/>` : ""}</g>`;
    const last = ds.length - 1;
    if ((i % every === 0 && (last - i >= every * 0.6 || i === last)) || i === last) svg += `<text class="ax" x="${bx + w / 2}" y="${H - 8}" text-anchor="middle">${x.date.slice(5).replace("-", "/")}</text>`;
  });
  svg += `</svg><div class="tip" hidden></div>`;
  box.innerHTML = svg;
  const tip = $(".tip", box), sv = $("svg", box);
  const show = (g) => {
    $$("g.on", box).forEach((e) => e.classList.remove("on")); g.classList.add("on");
    const x = ds[+g.dataset.i], rb = $(".hit", g).getBoundingClientRect(), bb = box.getBoundingClientRect();
    tip.innerHTML = `<b>${x.date}</b>방문자 ${x.uv} · 페이지뷰 ${x.pv} · 문의 ${x.inq}`;
    tip.style.left = (rb.left - bb.left + box.scrollLeft + rb.width / 2) + "px";
    tip.style.top = (y(x.uv) / H * sv.getBoundingClientRect().height) + "px";
    tip.hidden = false;
  };
  $$("g[data-i]", box).forEach((g) => { g.addEventListener("mouseenter", () => show(g)); g.addEventListener("click", () => show(g)); });
  box.addEventListener("mouseleave", () => { tip.hidden = true; $$("g.on", box).forEach((e) => e.classList.remove("on")); });
}

/* ───────── 체험판 데이터 ───────── */
const Demo = {
  inq: [
    { "접수번호": "Q260929-0004", "접수일시": "2026-09-29 13:48", "상태": "신규", "상호명": "(예시) 달빛베이커리", "담당자": "김하늘", "연락처": "010-1234-5678", "이메일": "sample1@example.com", "포장형태": "빵봉투/OPP, 스티커/라벨", "담을제품": "식빵 1줄, 소금빵 개별", "사이즈": "160×320mm", "제작수량": "3,000~10,000매", "인쇄": "로고 1~2도", "희망납기": "10월 말", "받으실지역": "경기 성남시", "요청사항": "식빵 봉투에 로고 1도, 소금빵은 원형 스티커로 붙이려고 해요.", "메모": "", "처리일시": "" },
    { "접수번호": "Q260928-0003", "접수일시": "2026-09-28 17:12", "상태": "처리중", "상호명": "(예시) 오늘반찬", "담당자": "이도윤", "연락처": "010-2222-3333", "이메일": "sample2@example.com", "포장형태": "삼방/진공", "담을제품": "장조림 300g, 멸치볶음 150g", "사이즈": "", "제작수량": "10,000~50,000매", "인쇄": "풀컬러", "희망납기": "11월 중순", "받으실지역": "서울 마포구", "요청사항": "냉장 유통입니다. 표시사항 칸 필요해요.", "메모": "9/29 통화. 나일론 진공 2종 샘플 발송함. 디자인 파일 금요일 수령 예정.", "처리일시": "" },
    { "접수번호": "Q260927-0002", "접수일시": "2026-09-27 10:05", "상태": "신규", "상호명": "(예시) 그래놀라랩", "담당자": "박서연", "연락처": "010-4444-5555", "이메일": "sample3@example.com", "포장형태": "스탠드 지퍼 파우치, 박스", "담을제품": "그래놀라 300g", "사이즈": "140×220×80mm", "제작수량": "1,000~3,000매", "인쇄": "디자인부터 필요", "희망납기": "미정", "받으실지역": "부산 해운대구", "요청사항": "크라프트 느낌에 투명창 원해요. 선물용 단상자도 같이 견적 부탁드려요.", "메모": "", "처리일시": "" },
    { "접수번호": "Q260925-0001", "접수일시": "2026-09-25 09:31", "상태": "처리완료", "상호명": "(예시) 한입떡방", "담당자": "최민준", "연락처": "010-6666-7777", "이메일": "sample4@example.com", "포장형태": "포장 밴딩/띠지", "담을제품": "떡 도시락", "사이즈": "", "제작수량": "1,000매 미만", "인쇄": "풀컬러", "희망납기": "추석 전", "받으실지역": "대전 서구", "요청사항": "", "메모": "띠지 1,000매 납품 완료 (9/27). 재주문 시 동일 사양.", "처리일시": "2026-09-27 16:20" }
  ],
  async list() { await new Promise((r) => setTimeout(r, 200)); return { items: this.inq, sheetUrl: "" }; },
  async update(p) {
    await new Promise((r) => setTimeout(r, 250));
    const x = this.inq.find((i) => i["접수번호"] === p.id);
    if (p.status !== undefined) { x["상태"] = p.status; x["처리일시"] = p.status === "처리완료" ? new Date().toLocaleString("sv-SE").slice(0, 16) : ""; }
    if (p.memo !== undefined) x["메모"] = p.memo;
    return { item: Object.assign({}, x) };
  },
  async stats(days) {
    await new Promise((r) => setTimeout(r, 250));
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5), wk = d.getDay() === 0 || d.getDay() === 6;
      const uv = Math.round((wk ? 18 : 42) + rnd() * 30 + (days - i) * 0.4);
      out.push({ date: d.toLocaleDateString("sv-SE"), uv, pv: Math.round(uv * (1.6 + rnd())), inq: rnd() < 0.35 ? 1 + Math.floor(rnd() * 2) : 0 });
    }
    const v = out.reduce((a, x) => a + x.uv, 0);
    return { days: out, visitors: Math.round(v * 0.82), devices: { "PC": Math.round(v * 0.82 * 0.38), "모바일": Math.round(v * 0.82 * 0.62) },
      referrers: [{ name: "직접 방문", count: Math.round(v * .3) }, { name: "search.naver.com", count: Math.round(v * .27) }, { name: "m.search.naver.com", count: Math.round(v * .16) }, { name: "instagram.com", count: Math.round(v * .09) }, { name: "google.com", count: Math.round(v * .06) }],
      sources: [{ name: "naver", count: Math.round(v * .21) }, { name: "instagram", count: Math.round(v * .08) }] };
  }
};

/* 사진을 못 불러오면 깨진 아이콘 대신 일러스트로 */
document.addEventListener("error", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLImageElement) || el.dataset.broken) return;
  el.dataset.broken = "1";
  const t = document.createElement("template");
  t.innerHTML = IC.flat || "";
  el.replaceWith(t.content);
}, true);

/* ───────── 시작 ───────── */
const ICON = {
  inquiries: '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M5 5h14l1 8v6H4v-6z"/>',
  products: '<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/>',
  cases: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
  banners: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8"/>',
  notices: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  popups: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="7" y="8" width="10" height="8" rx="1"/>',
  site: '<path d="M4 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'
};
const NAME = { inquiries: "견적 문의", products: "제작 품목", cases: "제작사례", banners: "메인 배너 슬라이드", notices: "공지사항 · 상단 띠", popups: "팝업 배너", site: "회사 정보 · 연락처", stats: "접속 통계" };
const navBtn = (v, cnt = true) => `<button data-v="${v}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[v]}</svg><span class="nm">${NAME[v]}</span>${cnt ? `<small id="cnt-${v === "inquiries" ? "inq" : v}"></small>` : ""}</button>`;

function shell() {
  const co = esc(D.site.company || "ENVY");
  root().innerHTML = `
    ${DEMO ? '<div class="notice">관리자 <b>체험판</b>이에요. 문의·통계는 예시 데이터이고, 편집·사진 올리기·선택 삭제·처리 완료는 눌러볼 수 있지만 저장되지 않아요.</div>' : ""}
    <div class="app">
      <nav class="side" id="side" aria-label="관리 메뉴">
        <div class="brand"><i class="logo-mark" aria-hidden="true"></i>${co}<small>관리자</small></div>
        <p class="lbl">고객</p>
        ${navBtn("inquiries")}
        <p class="lbl">사이트 관리</p>
        ${navBtn("products")}${navBtn("cases")}${navBtn("banners")}${navBtn("notices")}${navBtn("popups")}${navBtn("site", false)}
        <p class="lbl">분석</p>
        ${navBtn("stats", false)}
        <p class="foot">저장하면 GitHub에 반영되고 1~2분 뒤 사이트에 나타나요.</p>
      </nav>
      <div class="body">
        <div class="top">
          <div class="logo"><i class="logo-mark" aria-hidden="true"></i>${co}</div>
          <p class="crumb">${co} 관리자 · <b id="crumb"></b></p>
          <div class="sp"></div>
          <a class="btn topbtn" href="${DEMO ? "#" : "../"}" target="_blank" rel="noopener">사이트 보기 ↗</a>
          ${DEMO ? '<span class="user"><b>관</b><span>체험판</span></span>' : '<button class="btn topbtn" id="logout">로그아웃</button>'}
        </div>
        <main class="main" id="main"></main>
      </div>
    </div>
    <div class="toast" id="toast" role="status" hidden></div>`;
  $$("#side button[data-v]").forEach((b) => b.onclick = () => go(b.dataset.v));
  if ($("#logout")) $("#logout").onclick = () => { LS.del("envy_gh_token"); LS.del("envy_admin_key"); location.reload(); };
}

async function boot() {
  try {
    await Store.check();
    const names = ["site", "products", "cases", "banners", "notices", "popups"];
    const all = await Promise.all(names.map((n) => Store.load(n)));
    names.forEach((n, i) => D[n] = n === "site" ? (all[i] || {}) : Object.assign({ items: [] }, all[i]));
  } catch (e) { return login(e.message); }
  Remote.key = LS.get("envy_admin_key");
  shell(); render();
}

function login(msg = "") {
  root().innerHTML = `<form class="gate" id="gate">
    <h1>ENVY 관리자 로그인</h1>
    <p>GitHub 토큰으로 로그인해요. 처음 한 번만 만들면 이 기기에서 계속 쓸 수 있어요.</p>
    <ol>
      <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub 토큰 만들기</a> (Fine-grained token)</li>
      <li>Repository access: <b>Only select repositories</b> → ${esc(CFG.repo || "사이트 저장소")}</li>
      <li>Permissions → Repository → <b>Contents: Read and write</b></li>
      <li>만든 토큰을 아래에 붙여넣기</li>
    </ol>
    <input type="password" id="tok" placeholder="github_pat_…" autocomplete="off" aria-label="GitHub 토큰">
    <label class="toggle" for="keep"><input type="checkbox" id="keep" checked> 이 기기에서 로그인 유지</label>
    <p class="err" id="err">${esc(msg)}</p>
    <button class="btn primary" type="submit">로그인</button>
  </form>`;
  $("#tok").focus();
  $("#gate").onsubmit = async (e) => {
    e.preventDefault();
    Store.token = $("#tok").value.replace(/[^\x21-\x7e]/g, "");
    $("#err").textContent = "확인하는 중…";
    try { await Store.check(); LS.set("envy_gh_token", Store.token, $("#keep").checked); boot(); }
    catch (err) { $("#err").textContent = err.message; }
  };
}

if (DEMO) boot();
else if (!CFG.repo || /YOUR-GITHUB-ID/.test(CFG.repo)) root().innerHTML = `<div class="gate"><h1>설정이 필요해요</h1><p>admin/settings.js 파일의 repo 값을 본인 GitHub 저장소(예: envy2927/envy)로 바꿔 주세요.</p></div>`;
else { Store.token = LS.get("envy_gh_token"); Store.token ? boot() : login(); }
})();
