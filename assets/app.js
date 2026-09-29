/* ENVY 사이트 스크립트
   내용(회사정보·배너·품목·제작사례)은 data/*.json 에 있고, 관리자 화면(/admin)에서 수정합니다.
   이 파일은 그 데이터를 화면에 그려주는 역할만 합니다. */

const CATS = [
  { k: "bread",   label: "빵봉투·OPP",   short: "빵봉투",     icon: "bread" },
  { k: "pouch",   label: "스탠드파우치", short: "스탠드파우치", icon: "pouch" },
  { k: "vacuum",  label: "진공·삼방",    short: "진공봉투",   icon: "vacuum" },
  { k: "retort",  label: "레토르트",     short: "레토르트",   icon: "retort" },
  { k: "roll",    label: "롤필름",       short: "롤필름",     icon: "roll" },
  { k: "band",    label: "포장 밴딩",    short: "밴딩·띠지",  icon: "band" },
  { k: "sticker", label: "스티커·라벨",  short: "스티커",     icon: "sticker" },
  { k: "sleeve",  label: "슬리브",       short: "슬리브",     icon: "sleeve" },
  { k: "box",     label: "박스",         short: "박스",       icon: "box" },
  { k: "bag",     label: "쇼핑백",       short: "쇼핑백",     icon: "pbag" }
];
const TABS = CATS.map((c) => c.k);

const IC = window.IC || {};
const BANNER_ART = [
  `<svg viewBox="0 0 300 260" aria-hidden="true"><rect x="70" y="20" width="160" height="220" rx="6" fill="var(--film)" stroke="var(--ink)" stroke-width="3"/><rect x="70" y="20" width="160" height="34" fill="var(--brand)"/><text x="150" y="44" text-anchor="middle" font-family="Pretendard,Noto Sans KR,sans-serif" font-weight="900" font-size="17" fill="#fff">MY BAKERY</text><ellipse cx="150" cy="160" rx="58" ry="62" fill="var(--crust)"/><path d="M122 150 l22 -26 M146 166 l22 -26 M170 178 l16 -20" stroke="#fff3d6" stroke-opacity=".75" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M84 60 L110 60 L90 236 L78 236 Z" fill="#fff" opacity=".4"/></svg>`,
  `<svg viewBox="0 0 300 260" aria-hidden="true"><path d="M80 16 H220 L228 232 Q228 244 216 244 H84 Q72 244 72 232 Z" fill="var(--bg)" stroke="var(--ink)" stroke-width="3"/><line x1="80" y1="46" x2="220" y2="46" stroke="var(--ink)" stroke-width="2" stroke-dasharray="6 5"/><text x="150" y="86" text-anchor="middle" font-family="Pretendard,Noto Sans KR,sans-serif" font-weight="900" font-size="20" fill="var(--brand)">GRANOLA</text><rect x="102" y="104" width="96" height="84" rx="10" fill="var(--film)" stroke="var(--ink)" stroke-opacity=".3" stroke-width="2"/><g fill="var(--crust)"><circle cx="124" cy="160" r="9"/><circle cx="146" cy="170" r="8"/><circle cx="168" cy="158" r="10"/><circle cx="136" cy="140" r="7"/><circle cx="160" cy="138" r="8"/><circle cx="182" cy="176" r="7"/></g><path d="M72 214 H228" stroke="var(--brand)" stroke-width="10"/></svg>`,
  `<svg viewBox="0 0 300 260" aria-hidden="true"><rect x="40" y="70" width="90" height="150" rx="5" fill="var(--film)" stroke="var(--ink)" stroke-width="3"/><path d="M160 60 H250 L254 214 Q254 222 246 222 H164 Q156 222 156 214 Z" fill="var(--bg)" stroke="var(--ink)" stroke-width="3"/><rect x="100" y="30" width="80" height="120" rx="5" fill="#c9a574" stroke="var(--ink)" stroke-width="3" transform="rotate(-8 140 90)"/></svg>`
];

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const br = (v) => esc(v).replace(/\n/g, "<br>");

/* 예약 노출: show 가 꺼져 있지 않고, 지금이 시작~종료 사이면 노출 */
function isLive(x, now = new Date()) {
  if (!x || x.show === false) return false;
  const t = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };
  const a = t(x.start), b = t(x.end);
  return (!a || now >= a) && (!b || now < b);
}
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
};
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
const todayKey = () => new Date().toLocaleDateString("sv-SE");

async function load(name) {
  try {
    const r = await fetch(`data/${name}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    console.warn(`data/${name}.json 을 불러오지 못했어요`, e);
    return null;
  }
}

let SITE = {};

function renderSite(site) {
  SITE = site || {};
  document.querySelectorAll("[data-site]").forEach((el) => {
    const v = SITE[el.dataset.site];
    if (v) el.textContent = v;
  });
  if (SITE.company) document.title = `${SITE.company} 식품포장`;
  $("#year").textContent = new Date().getFullYear();
  $("#keywords").innerHTML = "인기 " + (SITE.keywords || []).map((k) => `<a href="#products">#${esc(k)}</a>`).join("");
  $("#strip").innerHTML = (SITE.strengths || [])
    .map((s) => `<div><b>${esc(s.title)}</b><span>${esc(s.desc)}</span></div>`).join("");
}

function renderCats() {
  $("#cats").innerHTML = CATS.map((c) => {
    const svg = (IC[c.icon] || "").replace('viewBox="0 0 64 64"', 'viewBox="0 0 64 64" aria-hidden="true"');
    return `<li><a href="#products" data-tab="${c.tab || c.k}"><span class="ic">${svg}</span>${c.short}</a></li>`;
  }).join("");
}

/* 관리자 화면이 저장한 "/images/uploads/…" 경로를 GitHub Pages 하위 주소에서도 열리게 상대 경로로 바꿈 */
const src = (p) => String(p || "").replace(/^\//, "");

function media(img, icon, alt) {
  img = src(img);
  return img ? `<img src="${esc(img)}" alt="${esc(alt)}" loading="lazy" data-fb="${esc(icon || "flat")}">` : (IC[icon] || IC.flat);
}
/* 사진을 못 불러오면 깨진 아이콘 대신 일러스트로 */
document.addEventListener("error", (e) => {
  const el = e.target;
  if (!(el instanceof HTMLImageElement)) return;
  if (el.dataset.fb !== undefined) { const t = document.createElement("template"); t.innerHTML = el.dataset.fb.startsWith("banner:") ? BANNER_ART[+el.dataset.fb.slice(7) % BANNER_ART.length] : (IC[el.dataset.fb] || IC.flat); el.replaceWith(t.content); }
  else if (el.closest(".pimg")) el.closest(".pimg").remove();
}, true);

function card(p) {
  const badges = (p.badges || []).length
    ? `<div class="badge">${p.badges.map((x) => `<span class="${x === "HOT" ? "hot" : ""}">${esc(x)}</span>`).join("")}</div>` : "";
  return `<a class="card" href="#quote" data-name="${esc(p.name)}">
    <div class="thumb">${badges}${media(p.image, p.icon, p.name)}</div>
    <h3>${esc(p.name)}</h3><p class="spec">${esc(p.spec)}</p>
    <p class="price">견적문의<small>${esc(p.moq || "")}</small></p>
    <div class="tags">${(p.tags || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div></a>`;
}

let PRODUCTS = [];
function renderProducts(data) {
  PRODUCTS = ((data && data.items) || []).filter((p) => p.show !== false);
  const best = PRODUCTS.filter((p) => p.best).slice(0, 8);
  $("#bestGrid").innerHTML = best.length ? best.map(card).join("") : `<p class="empty">관리자 화면에서 '메인 노출'을 켠 품목이 여기에 보여요.</p>`;
  $("#tabs").innerHTML = TABS.map((k) => {
    const c = CATS.find((x) => x.k === k);
    return `<button role="tab" data-k="${k}" aria-selected="false">${c.label}</button>`;
  }).join("");
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.k)));
  showTab("bread");
}
function showTab(k, list) {
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.k === k));
  const items = list || PRODUCTS.filter((p) => p.category === k);
  $("#tabGrid").innerHTML = items.length ? items.map(card).join("") : `<p class="empty" style="grid-column:1/-1">등록된 품목이 없어요.</p>`;
}

/* 제작사례: 한 페이지 9개(3개씩 3줄). 관리자에서 '메인 노출'로 지정한 사례(최대 9개)가 첫 페이지에 먼저 나옴 */
const CASE_PAGE = 9;
let CASES = [];
function renderCases(data) {
  const all = ((data && data.items) || []).filter((c) => c.show !== false);
  const main = all.filter((c) => c.main).slice(0, CASE_PAGE);
  CASES = main.concat(all.filter((c) => !main.includes(c)));
  showCasePage(1, false);
}
function showCasePage(pg, scroll = true) {
  const pages = Math.max(1, Math.ceil(CASES.length / CASE_PAGE));
  pg = Math.min(Math.max(1, pg), pages);
  const list = CASES.slice((pg - 1) * CASE_PAGE, pg * CASE_PAGE);
  $("#caseGrid").innerHTML = list.length ? list.map((c) =>
    `<a class="case" href="#quote"><div class="thumb">${media(c.image, c.icon, c.title)}</div>
      <div class="txt"><b>${esc(c.title)}</b><span>${esc(c.spec)}</span></div></a>`).join("")
    : `<p class="empty" style="grid-column:1/-1">등록된 제작사례가 없어요.</p>`;
  const nav = $("#casePager");
  if (pages < 2) { nav.hidden = true; nav.innerHTML = ""; }
  else {
    nav.hidden = false;
    let h = `<button type="button" data-pg="${pg - 1}" ${pg === 1 ? "disabled" : ""} aria-label="이전 페이지">‹</button>`;
    for (let i = 1; i <= pages; i++) h += `<button type="button" data-pg="${i}" ${i === pg ? 'aria-current="page"' : ""}>${i}</button>`;
    h += `<button type="button" data-pg="${pg + 1}" ${pg === pages ? "disabled" : ""} aria-label="다음 페이지">›</button>`;
    nav.innerHTML = h;
    nav.querySelectorAll("button").forEach((b) => b.onclick = () => showCasePage(+b.dataset.pg));
  }
  if (scroll) document.getElementById("cases").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/* 배너 슬라이드 */
let cur = 0, timer, n = 0;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function renderBanners(data) {
  const items = ((data && data.items) || []).filter((b) => isLive(b));
  n = items.length;
  const bg = { soft: "", green: "s2", crust: "s3" };
  $("#slides").innerHTML = items.map((b, i) => `
    <div class="slide ${bg[b.color] || ""}"><div class="wrap">
      <div>
        ${b.tag ? `<span class="tag">${esc(b.tag)}</span>` : ""}
        <h2>${br(b.title)}</h2>
        ${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ""}
        <a class="go" href="#quote">${esc(b.button || "견적 받아보기")}</a>
      </div>
      <div class="art">${b.image ? `<img src="${esc(src(b.image))}" alt="${esc(b.tag || b.title)}" data-fb="banner:${i}">` : BANNER_ART[i % BANNER_ART.length]}</div>
    </div></div>`).join("");
  $("#dots").innerHTML = "";
  for (let i = 0; i < n; i++) {
    const d = document.createElement("button");
    d.setAttribute("aria-label", `${i + 1}번 배너`);
    d.onclick = () => { go(i); restart(); };
    $("#dots").appendChild(d);
  }
  const multi = n > 1;
  $("#prev").hidden = !multi; $("#next").hidden = !multi; $("#dots").hidden = !multi;
  go(0); restart();
}
function go(i) {
  if (!n) return;
  cur = (i + n) % n;
  $("#slides").style.transform = `translateX(-${cur * 100}%)`;
  [...$("#dots").children].forEach((d, j) => d.setAttribute("aria-current", j === cur));
}
function restart() { clearInterval(timer); if (!reduce && n > 1) timer = setInterval(() => go(cur + 1), 5000); }
$("#prev").onclick = () => { go(cur - 1); restart(); };
$("#next").onclick = () => { go(cur + 1); restart(); };

/* 카테고리 링크 → 탭 */
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-tab]");
  if (a) showTab(a.dataset.tab);
});

/* 검색 */
$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#q").value.trim().toLowerCase();
  document.getElementById("products").scrollIntoView({ behavior: "smooth" });
  if (!q) return showTab("bread");
  const hit = PRODUCTS.filter((p) => [p.name, p.spec, ...(p.tags || [])].join(" ").toLowerCase().includes(q));
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", "false"));
  $("#tabGrid").innerHTML = hit.length ? hit.map(card).join("") : `<p class="empty" style="grid-column:1/-1">'${esc(q)}' 검색 결과가 없어요. 견적 문의로 알려주시면 제작 가능 여부를 안내해 드려요.</p>`;
});

/* 상단 공지 띠 + 공지사항 게시판 */
function renderNotices(data) {
  const all = ((data && data.items) || []).filter((n) => isLive(n));
  all.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.date || "").localeCompare(String(a.date || "")));

  const board = $("#board");
  if (!all.length) { board.innerHTML = `<p class="empty" style="padding:30px 0">등록된 공지가 없어요.</p>`; }
  else {
    const weekAgo = Date.now() - 7 * 864e5;
    const row = (n, i) => `<details id="n${i}">
      <summary><span class="nk ${n.pinned ? "pin" : ""}">${n.pinned ? "중요" : "공지"}</span>
        <span class="nt">${esc(n.title)}${n.date && new Date(n.date) > weekAgo ? '<span class="new">NEW</span>' : ""}</span>
        <span class="nd">${esc(n.date || "")}</span></summary>
      <div class="nb">${esc(n.body || "")}</div></details>`;
    const LIMIT = 5;
    board.innerHTML = all.map(row).join("") + (all.length > LIMIT ? `<button class="more" id="boardMore" type="button">공지 더보기</button>` : "");
    const extra = [...board.querySelectorAll("details")].slice(LIMIT);
    extra.forEach((d) => d.hidden = true);
    if ($("#boardMore")) $("#boardMore").onclick = (e) => { extra.forEach((d) => d.hidden = false); e.target.remove(); };
  }

  const top = all.map((n, i) => ({ n, i })).filter((o) => o.n.topbar);
  const bar = $("#topnote");
  if (!top.length || ss.get("envy_topnote_closed")) { bar.hidden = true; return; }
  bar.hidden = false;
  let k = 0;
  const show = () => {
    const { n, i } = top[k % top.length];
    const a = $("#tn-text");
    a.textContent = n.title;
    a.onclick = () => { const d = document.getElementById("n" + i); if (d) { d.hidden = false; d.open = true; } };
  };
  show();
  if (top.length > 1 && !reduce) setInterval(() => { k++; show(); }, 4000);
  $("#tn-close").onclick = () => { bar.hidden = true; ss.set("envy_topnote_closed", "1"); };
}

/* 팝업 배너: 예약 기간 안에만, '오늘 하루 보지 않기' 지원 */
function renderPopups(data) {
  const key = (p) => "envy_pop_" + (p.title || "") + "_" + (p.start || "");
  const list = ((data && data.items) || []).filter((p) => isLive(p) && ls.get(key(p)) !== todayKey());
  const wrap = $("#popwrap");
  let i = 0;
  const next = () => {
    if (i >= list.length) { wrap.hidden = true; wrap.innerHTML = ""; return; }
    const p = list[i++];
    const href = esc(p.link || "#quote");
    const ext = /^https?:/i.test(p.link || "") ? ' target="_blank" rel="noopener"' : "";
    wrap.innerHTML = `<div class="popup" role="dialog" aria-modal="true" aria-label="${esc(p.title)}">
      ${p.image ? `<a class="pimg" href="${href}"${ext}><img src="${esc(src(p.image))}" alt="${esc(p.title)}"></a>` : ""}
      <div class="pbody"><h3>${esc(p.title)}</h3>${p.body ? `<p>${esc(p.body)}</p>` : ""}
        ${p.button ? `<a class="pgo" href="${href}"${ext}>${esc(p.button)}</a>` : ""}</div>
      <div class="pfoot"><button type="button" data-a="today">오늘 하루 보지 않기</button><button type="button" data-a="close">닫기</button></div></div>`;
    wrap.hidden = false;
    wrap.querySelector('[data-a="close"]').focus();
    wrap.querySelectorAll(".pfoot button").forEach((b) => b.onclick = () => { if (b.dataset.a === "today") ls.set(key(p), todayKey()); next(); });
    wrap.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => next()));
  };
  wrap.onclick = (e) => { if (e.target === wrap) next(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !wrap.hidden) next(); });
  if (list.length) next();
}

$("#toTop").onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

/* 견적 폼 → 구글 시트 기록 + 이메일 (Apps Script). 주소가 비어 있으면 FormSubmit 으로 메일만 발송
   받는 주소는 관리자 화면 > 회사 정보 > '문의 받을 이메일'(대표)과 '함께 받을 이메일'(참조)에서 바꿉니다. */
const form = $("#quoteForm"), status = $("#f-status"), btn = $("#f-submit");
/* :has() 를 모르는 구형 브라우저용: 선택한 포장 형태 칩 표시 */
form.addEventListener("change", (e) => { if (e.target.matches(".opts input")) e.target.closest("label").classList.toggle("on", e.target.checked); });
form.addEventListener("reset", () => setTimeout(() => form.querySelectorAll(".opts label.on").forEach((l) => l.classList.remove("on"))));
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.className = "status";
  const missing = [...form.querySelectorAll("[required]")].filter((el) => el.type === "checkbox" ? !el.checked : !el.value.trim());
  if (missing.length) {
    status.classList.add("err");
    status.textContent = missing.length === 1 && missing[0].id === "f-agree" ? "개인정보 수집·이용에 동의해 주세요." : "상호명, 담당자, 연락처, 이메일을 입력해 주세요.";
    missing[0].focus(); return;
  }
  const email = $("#f-email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { status.classList.add("err"); status.textContent = "이메일 주소 형식을 확인해 주세요."; email.focus(); return; }
  const data = {};
  new FormData(form).forEach((v, k) => { data[k] = data[k] ? data[k] + ", " + v : v; });
  data._source = location.href;
  const endpoint = (SITE.inquiry_endpoint || "").trim();
  const to = SITE.inquiry_email;
  if (!endpoint && !to) { status.classList.add("err"); status.textContent = "문의 접수 설정이 아직 안 됐어요. 전화로 문의해 주세요."; return; }
  btn.disabled = true; btn.textContent = "보내는 중…";
  try {
    let msg = "견적 요청이 접수됐어요. 영업일 1일 안에 연락드릴게요.";
    if (endpoint) {
      /* 구글 시트 기록 + 알림 메일 (Apps Script). text/plain 으로 보내야 브라우저 사전요청 없이 전송됩니다. */
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "submit", data }) });
      const out = await res.json();
      if (!out.ok) throw new Error(out.error || "전송 실패");
      if (out.id) msg = `견적 요청이 접수됐어요 (접수번호 ${out.id}). 영업일 1일 안에 연락드릴게요.`;
    } else {
      /* 예비 경로: FormSubmit 으로 메일만 발송 */
      data._subject = `[견적문의] ${data["상호명"]} · ${data["포장형태"] || "형태 미정"}`;
      data._replyto = data["이메일"]; data._template = "table"; data._captcha = "false";
      const cc = (SITE.inquiry_cc || []).filter(Boolean);
      if (cc.length) data._cc = cc.join(",");
      const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(res.status);
    }
    form.reset(); status.classList.add("ok"); status.textContent = msg;
    /* 광고 전환 추적: 픽셀을 설치했다면 여기서 전환 이벤트를 보내세요. 예) fbq('track','Lead') */
  } catch (err) {
    status.classList.add("err");
    status.textContent = /입력|형식/.test(err.message) ? err.message : "전송하지 못했어요. 잠시 후 다시 시도하시거나 고객센터로 전화 주세요.";
  } finally { btn.disabled = false; btn.textContent = "견적 요청하기"; }
});

/* 방문 기록 (접속 통계용). 개인을 알아볼 수 있는 정보는 보내지 않고, 이 브라우저용 임의 번호만 씁니다. */
function trackVisit() {
  const ep = (SITE.inquiry_endpoint || "").trim();
  if (!ep || navigator.webdriver || /bot|crawl|spider|preview/i.test(navigator.userAgent)) return;
  let vid = ls.get("envy_vid");
  if (!vid) { vid = Math.random().toString(36).slice(2) + Date.now().toString(36); ls.set("envy_vid", vid); }
  const q = new URLSearchParams(location.search);
  let ref = "";
  try { const h = document.referrer ? new URL(document.referrer).hostname : ""; ref = h && h !== location.hostname ? h.replace(/^www\./, "") : ""; } catch (e) {}
  const data = { vid, path: location.pathname, ref, us: q.get("utm_source") || "", um: q.get("utm_medium") || "", uc: q.get("utm_campaign") || "",
    dev: matchMedia("(max-width: 760px)").matches || /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "pc" };
  const body = JSON.stringify({ action: "hit", data });
  try {
    if (!(navigator.sendBeacon && navigator.sendBeacon(ep, new Blob([body], { type: "text/plain;charset=utf-8" }))))
      fetch(ep, { method: "POST", body, headers: { "Content-Type": "text/plain;charset=utf-8" }, keepalive: true, mode: "no-cors" });
  } catch (e) {}
}

(async () => {
  renderCats();
  const [site, banners, products, cases, notices, popups] = await Promise.all(["site", "banners", "products", "cases", "notices", "popups"].map(load));
  renderSite(site); renderBanners(banners); renderProducts(products); renderCases(cases);
  renderNotices(notices); renderPopups(popups);
  trackVisit();
})();
