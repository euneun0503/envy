/* ENVY 견적 문의 관리 화면
   mountInquiries(root, api)
   api.list()   → { items:[{접수번호,접수일시,상태,상호명,…,메모,처리일시}], sheetUrl }
   api.update({ id, status?, memo? }) → { item } */

(function () {
  const FIELDS = [["담당자"], ["연락처", "copy"], ["이메일", "mail"], ["포장형태"], ["담을제품"], ["사이즈"], ["제작수량"], ["인쇄"], ["희망납기"], ["받으실지역"], ["요청사항", "long"]];
  const ST = { "신규": "new", "처리중": "doing", "처리완료": "done" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  window.mountInquiries = function (root, api, opts = {}) {
    const S = { items: [], sheetUrl: "", filter: "active", q: "", sel: null, loading: true, error: "" };

    root.innerHTML = `
      <div class="iq">
        <div class="iq-head">
          <h1>견적 문의</h1>
          <div class="iq-counts" id="iq-counts"></div>
          <span class="iq-sp"></span>
          <a class="btn" id="iq-sheet" target="_blank" rel="noopener" hidden>구글 시트 열기</a>
          <button class="btn" id="iq-reload">새로고침</button>
          ${opts.onLogout ? '<button class="btn" id="iq-logout">로그아웃</button>' : ""}
        </div>
        <div class="iq-tools">
          <div class="chips" id="iq-filters"></div>
          <input type="search" id="iq-q" placeholder="상호명, 담당자, 연락처, 접수번호 검색" aria-label="문의 검색">
        </div>
        <div class="iq-body">
          <div class="iq-list" id="iq-list" role="list"></div>
          <section class="iq-detail" id="iq-detail" aria-live="polite"></section>
        </div>
      </div>`;
    const $ = (s) => root.querySelector(s);

    $("#iq-reload").onclick = () => load();
    if (opts.onLogout) $("#iq-logout").onclick = opts.onLogout;
    $("#iq-q").oninput = (e) => { S.q = e.target.value.trim().toLowerCase(); drawList(); };

    async function load() {
      S.loading = true; S.error = ""; drawList();
      try {
        const r = await api.list();
        S.items = r.items || []; S.sheetUrl = r.sheetUrl || "";
        if (S.sel && !S.items.find((x) => x["접수번호"] === S.sel)) S.sel = null;
      } catch (e) { S.error = e.message || "불러오지 못했어요."; }
      S.loading = false; draw();
    }

    function counts() {
      const c = { "신규": 0, "처리중": 0, "처리완료": 0 };
      S.items.forEach((x) => { if (c[x["상태"]] !== undefined) c[x["상태"]]++; });
      return c;
    }

    function visible() {
      return S.items.filter((x) => {
        if (S.filter === "active" && x["상태"] === "처리완료") return false;
        if (S.filter !== "active" && S.filter !== "all" && x["상태"] !== S.filter) return false;
        if (!S.q) return true;
        return ["상호명", "담당자", "연락처", "이메일", "접수번호", "포장형태"].some((k) => String(x[k] || "").toLowerCase().includes(S.q));
      });
    }

    function draw() { drawHead(); drawList(); drawDetail(); }

    function drawHead() {
      const c = counts();
      $("#iq-counts").innerHTML = `<span class="st new">신규 ${c["신규"]}</span><span class="st doing">처리중 ${c["처리중"]}</span><span class="st done">처리완료 ${c["처리완료"]}</span>`;
      const sheet = $("#iq-sheet");
      sheet.hidden = !S.sheetUrl; if (S.sheetUrl) sheet.href = S.sheetUrl;
      const F = [["active", `미처리 ${c["신규"] + c["처리중"]}`], ["신규", "신규"], ["처리중", "처리중"], ["처리완료", "처리완료"], ["all", `전체 ${S.items.length}`]];
      $("#iq-filters").innerHTML = F.map(([k, l]) => `<button data-f="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join("");
      root.querySelectorAll("#iq-filters button").forEach((b) => b.onclick = () => { S.filter = b.dataset.f; drawHead(); drawList(); });
    }

    function drawList() {
      const box = $("#iq-list");
      if (S.loading && !S.items.length) { box.innerHTML = `<p class="iq-empty">문의를 불러오는 중…</p>`; return; }
      if (S.error) { box.innerHTML = `<p class="iq-empty err">${esc(S.error)}</p>`; return; }
      const list = visible();
      if (!list.length) {
        box.innerHTML = `<p class="iq-empty">${S.items.length ? "조건에 맞는 문의가 없어요." : "아직 들어온 문의가 없어요. 사이트 견적 폼으로 문의가 들어오면 여기에 쌓여요."}</p>`;
        return;
      }
      box.innerHTML = list.map((x) => `
        <button class="iq-row ${x["접수번호"] === S.sel ? "on" : ""}" data-id="${esc(x["접수번호"])}" role="listitem">
          <span class="st ${ST[x["상태"]] || "new"}">${esc(x["상태"] || "신규")}</span>
          <span class="iq-main"><b>${esc(x["상호명"])}</b><span>${esc(x["담당자"])} · ${esc(x["포장형태"] || "형태 미정")}</span></span>
          <span class="iq-meta"><span>${esc(x["접수일시"])}</span><span>${esc(x["접수번호"])}${x["메모"] ? " · 메모" : ""}</span></span>
        </button>`).join("");
      box.querySelectorAll(".iq-row").forEach((r) => r.onclick = () => {
        S.sel = r.dataset.id; drawList(); drawDetail();
        if (matchMedia("(max-width: 900px)").matches) $("#iq-detail").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    function drawDetail() {
      const box = $("#iq-detail");
      const x = S.items.find((i) => i["접수번호"] === S.sel);
      if (!x) { box.innerHTML = `<p class="iq-empty">왼쪽 목록에서 문의를 고르면 내용과 메모가 보여요.</p>`; return; }
      const st = x["상태"] || "신규";
      const rows = FIELDS.filter(([k]) => String(x[k] || "").trim()).map(([k, t]) => {
        let v = esc(x[k]);
        if (t === "long") v = v.replace(/\n/g, "<br>");
        if (t === "copy") v = `<span class="sel">${v}</span> <button class="mini" data-copy="${esc(x[k])}">복사</button>`;
        if (t === "mail") v = `<span class="sel">${v}</span> <button class="mini" data-copy="${esc(x[k])}">복사</button> <a class="mini" href="mailto:${esc(x[k])}?subject=${encodeURIComponent("[ENVY] 견적 문의 답변 (" + x["접수번호"] + ")")}">메일 쓰기</a>`;
        return `<dt>${k}</dt><dd>${v}</dd>`;
      }).join("");
      const btns = st === "처리완료"
        ? `<button class="btn" data-st="처리중">다시 처리중으로</button>`
        : `<button class="btn primary" data-st="처리완료">처리 완료로 전환</button>${st === "신규" ? `<button class="btn" data-st="처리중">처리중으로</button>` : `<button class="btn" data-st="신규">신규로 되돌리기</button>`}`;
      box.innerHTML = `
        <div class="iq-dh">
          <span class="st ${ST[st]}">${esc(st)}</span>
          <h2>${esc(x["상호명"])}</h2>
          <p>${esc(x["접수번호"])} · 접수 ${esc(x["접수일시"])}${x["처리일시"] ? ` · 완료 ${esc(x["처리일시"])}` : ""}</p>
        </div>
        <dl class="iq-dl">${rows}</dl>
        <div class="iq-memo">
          <label for="iq-memo">처리 메모</label>
          <textarea id="iq-memo" placeholder="예) 10/2 통화, 샘플 3종 발송 예정. 견적서 메일 보냄.">${esc(x["메모"])}</textarea>
          <div class="iq-act">
            <button class="btn" id="iq-save-memo">메모 저장</button>
            <span class="iq-sp"></span>
            ${btns}
          </div>
          <p class="iq-msg" id="iq-msg" role="status"></p>
        </div>`;

      box.querySelectorAll("[data-copy]").forEach((b) => b.onclick = async () => {
        try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "복사됨"; }
        catch (e) { const s = b.previousElementSibling; const r = document.createRange(); r.selectNodeContents(s); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = "선택됨"; }
        setTimeout(() => b.textContent = "복사", 1500);
      });
      const memo = $("#iq-memo");
      $("#iq-save-memo").onclick = () => save(x, { memo: memo.value }, "메모를 저장했어요.");
      box.querySelectorAll("[data-st]").forEach((b) => b.onclick = () => {
        const patch = { status: b.dataset.st };
        if (memo.value !== (x["메모"] || "")) patch.memo = memo.value;   // 메모도 함께 저장
        save(x, patch, b.dataset.st === "처리완료" ? "처리 완료로 바꿨어요." : `'${b.dataset.st}'(으)로 바꿨어요.`);
      });
    }

    async function save(x, patch, okMsg) {
      const msg = $("#iq-msg");
      root.querySelectorAll(".iq-act button").forEach((b) => b.disabled = true);
      msg.className = "iq-msg"; msg.textContent = "저장하는 중…";
      try {
        const r = await api.update(Object.assign({ id: x["접수번호"] }, patch));
        Object.assign(x, r.item || {});
        drawHead(); drawList(); drawDetail();
        const m = $("#iq-msg"); m.className = "iq-msg ok"; m.textContent = okMsg;
      } catch (e) {
        msg.className = "iq-msg err"; msg.textContent = e.message || "저장하지 못했어요. 다시 시도해 주세요.";
        root.querySelectorAll(".iq-act button").forEach((b) => b.disabled = false);
      }
    }

    drawHead(); load();
    return { reload: load };
  };
})();
