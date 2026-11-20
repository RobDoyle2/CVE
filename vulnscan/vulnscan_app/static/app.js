"use strict";
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString();
  const DEFAULT_FILTERS = { q: "", days: "7", severity: "high", source: "", exploited_only: false };

  async function api(path, opts = {}) {
    const init = { method: opts.method || "GET", headers: { "X-VulnScan": "1" } };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
      if (!opts.method) init.method = "POST";
    }
    const r = await fetch(path, init);
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok && r.status !== 409) throw new Error((data && data.error) || `HTTP ${r.status}`);
    return data;
  }

  function toast(msg, ms = 3500) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
  }

  let info = null;
  let isPhone = false;

  // ------------------------------------------------------------------ tabs --
  function show(view) {
    $("#viewMain").hidden = view !== "main";
    $("#viewSettings").hidden = view !== "settings";
    $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === view)));
    if (view === "settings") loadSettings();
    try { history.replaceState(null, "", view === "settings" ? "#settings" : "#"); } catch (e) { /* ignore */ }
  }
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));

  // ------------------------------------------------------------------ info --
  async function loadInfo() {
    info = await api("/api/info");
    isPhone = info.phone;
    $("#appTitle").textContent = info.title;
    $("#tagline").textContent = info.tagline;
    document.title = info.title;
    const sel = $("#fSrc"), cur = sel.value;
    sel.innerHTML = '<option value="">All sources</option>' +
      info.sources.filter((s) => s.enabled || s.count).map((s) => `<option value="${esc(s.id)}">${esc(s.name)}${s.count ? "" : " (no data yet)"}</option>`).join("") +
      info.other_sources.map((id) => `<option value="${esc(id)}">${esc(id)} (removed)</option>`).join("");
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "";
    const runs = Object.values(info.last_runs || {}).sort();
    $("#lastScan").textContent = runs.length ? `Last scan: ${new Date(runs[runs.length - 1] + "Z").toLocaleString()}` : "";
    $("#quitCard").hidden = isPhone;
    $("#keysCard").hidden = isPhone;
    $("#phoneCard").hidden = isPhone;
    $("#about").textContent = `Version ${info.version}. Public vulnerability data only; everything is stored on this computer.`;
  }

  // ---------------------------------------------------------------- filters --
  function getFilters() {
    return { q: $("#fQ").value.trim(), days: $("#fDays").value, severity: $("#fSev").value,
             source: $("#fSrc").value, exploited_only: $("#fExp").checked };
  }
  function setFilters(f) {
    $("#fQ").value = f.q; $("#fDays").value = f.days; $("#fSev").value = f.severity;
    $("#fSrc").value = f.source; $("#fExp").checked = !!f.exploited_only;
  }
  function filterQuery(f) {
    const p = new URLSearchParams({ q: f.q, days: f.days, severity: f.severity, source: f.source });
    if (f.exploited_only) p.set("exploited_only", "1");
    return p.toString();
  }
  function saveFilters() {
    try { localStorage.setItem("vs_filters", JSON.stringify(getFilters())); } catch (e) { /* ignore */ }
  }
  function restoreFilters() {
    try {
      const f = JSON.parse(localStorage.getItem("vs_filters") || "null");
      if (f) setFilters({ ...DEFAULT_FILTERS, ...f });
    } catch (e) { /* ignore */ }
  }

  let reqId = 0, debounce = null;
  function refresh(delay = 0) {
    clearTimeout(debounce);
    debounce = setTimeout(loadResults, delay);
  }
  ["#fDays", "#fSev", "#fSrc", "#fExp"].forEach((s) => $(s).addEventListener("change", () => { saveFilters(); refresh(); }));
  $("#fQ").addEventListener("input", () => { saveFilters(); refresh(150); });
  $("#clearBtn").addEventListener("click", () => { setFilters(DEFAULT_FILTERS); saveFilters(); refresh(); });

  // ---------------------------------------------------------------- results --
  async function loadResults() {
    const id = ++reqId;
    const f = getFilters();
    let data;
    try { data = await api("/api/results?" + filterQuery(f) + "&limit=500"); }
    catch (e) { toast("Could not load results: " + e.message); return; }
    if (id !== reqId) return; // a newer request is on its way
    renderSummary(data);
    $("#count").textContent = `Showing ${fmt(data.matching)} of ${fmt(data.total)}`;
    const tb = $("#results tbody");
    tb.innerHTML = data.rows.map(rowHtml).join("");
    const empty = $("#empty");
    if (!data.total) {
      empty.hidden = false; empty.textContent = "Nothing collected yet. Press Scan to fetch today's vulnerabilities.";
    } else if (!data.rows.length) {
      empty.hidden = false; empty.textContent = "No vulnerabilities match these filters. Try a longer time window or Clear filters.";
    } else empty.hidden = true;
    const more = $("#more");
    more.hidden = data.matching <= data.rows.length;
    more.textContent = `The first ${fmt(data.rows.length)} rows are shown here. Narrow the filters, or export to see all ${fmt(data.matching)}.`;
    $("#xlsxBtn").disabled = $("#pdfBtn").disabled = !data.matching;
  }

  function renderSummary(data) {
    if (!data.total) return;
    const s = data.summary;
    $("#summary").textContent = `${fmt(s.total)} records collected. ${fmt(s.matching)} are exploited or critical/high in the last ${s.days} days (${fmt(s.exploited)} known exploited).`;
  }

  function rowHtml(r) {
    const sev = r.severity ? `<span class="badge sev-${esc(r.severity)}">${esc(r.severity)}</span>` : "";
    const src = (info && info.sources.find((s) => s.id === r.source)) || { name: r.source };
    const aliases = r.aliases && r.aliases !== r.id ? `<div class="src-tag">${esc(r.aliases.slice(0, 80))}</div>` : "";
    const link = /^https?:\/\//i.test(r.url) ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Open</a>` : "";
    return `<tr class="${r.exploited ? "exploited" : ""}">
      <td class="id">${esc(r.id)}${aliases}</td>
      <td class="srccol src-tag">${esc(src.name)}</td>
      <td class="exp-cell">${r.exploited ? '<span class="exp">YES - exploited</span>' : ""}</td>
      <td class="sev">${sev}</td>
      <td class="num score">${r.score == null ? "" : esc(Number(r.score).toFixed(1))}</td>
      <td class="aff">${esc(r.affected)}</td>
      <td class="sum">${esc(r.summary)}</td>
      <td class="date">${esc(r.published || r.modified)}</td>
      <td class="link">${link}</td></tr>`;
  }

  // ----------------------------------------------------------------- export --
  function download(kind) {
    const a = document.createElement("a");
    a.href = `/api/export.${kind}?` + filterQuery(getFilters());
    a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    toast(kind === "pdf" ? "Preparing PDF… it will appear in your Downloads folder." : "Preparing Excel file… it will appear in your Downloads folder.");
  }
  $("#xlsxBtn").addEventListener("click", () => download("xlsx"));
  $("#pdfBtn").addEventListener("click", () => download("pdf"));

  // ------------------------------------------------------------------- scan --
  let polling = null;
  $("#scanBtn").addEventListener("click", async () => {
    const btn = $("#scanBtn");
    if (btn.classList.contains("running")) {
      await api("/api/scan/stop", { body: {} });
      btn.textContent = "Stopping…";
      return;
    }
    const st = await api("/api/scan", { body: {} });
    if (st && !st.sources.length) { toast("No sources are switched on. Turn some on in Settings."); return; }
    pollScan();
  });

  async function pollScan() {
    clearTimeout(polling);
    let st;
    try { st = await api("/api/scan"); } catch (e) { polling = setTimeout(pollScan, 3000); return; }
    renderProgress(st);
    const btn = $("#scanBtn");
    if (st.running) {
      btn.classList.add("running");
      if (btn.textContent !== "Stopping…") btn.textContent = "Stop";
      polling = setTimeout(pollScan, 1000);
      if (Date.now() - (pollScan._last || 0) > 4000) { pollScan._last = Date.now(); loadResults(); }
    } else {
      btn.classList.remove("running");
      btn.textContent = "Scan";
      if (pollScan._wasRunning) {
        await loadInfo(); await loadResults();
        const fails = st.sources.filter((s) => s.status === "fail").length;
        toast(fails ? `Scan finished. ${fails} source(s) failed - see the error text above.` : "Scan finished.");
      }
    }
    pollScan._wasRunning = st.running;
  }

  function renderProgress(st) {
    const ul = $("#progress");
    if (!st.sources || !st.sources.length) { ul.hidden = true; return; }
    ul.hidden = false;
    const label = { ok: "ok", fail: "FAIL", running: "…", waiting: "wait", skipped: "skip" };
    ul.innerHTML = st.sources.map((s) => `<li><span class="st ${s.status}">${label[s.status] || s.status}</span>
      <span>${esc(s.name)}</span>
      ${s.error ? `<span class="err" title="Select and copy this text">${esc(s.error)}</span>` : `<span class="msg muted">${esc(s.message)}</span>`}</li>`).join("");
  }

  // --------------------------------------------------------------- settings --
  let cfg = null, saveTimer = null;
  const MAP_FIELDS = {
    json: [["items_path", "Path to the list of items (e.g. data.items)"], ["vuln_id", "ID field"], ["aliases", "CVE / alias field"],
           ["title", "Title field"], ["summary", "Summary field"], ["severity_score", "Score field"], ["severity_label", "Severity field"],
           ["affected", "Affected product field"], ["exploited", "Exploited field"], ["published", "Published date field"],
           ["modified", "Modified date field"], ["url", "Link field"]],
    rss: [],
    web: [["link_pattern", "Also follow links matching (regular expression, optional)"]],
  };
  const SPECIAL = {
    osv: [["packages", "Packages to check, one per line: ecosystem:name@version (e.g. PyPI:requests@2.19.0)", true]],
    oracle: [["sections", "Risk-matrix sections to read, comma separated (e.g. java, mysql). Empty = all"]],
  };

  async function loadSettings() {
    cfg = await api("/api/settings");
    $("#sTitle").value = cfg.app_title;
    $("#sTagline").value = cfg.tagline;
    $("#sDays").value = String(cfg.first_scan_days);
    renderKeys();
    renderSources();
    if (!isPhone) loadPhone();
  }

  function renderKeys() {
    $$(".key-row").forEach((row) => {
      const s = (cfg.secrets || {})[row.dataset.name] || {};
      $(".hint", row).textContent = s.set ? `saved (${s.hint})${s.from_env ? " - from environment variable" : ""}` : "not set";
      $(".clear-key", row).hidden = !s.set || s.from_env;
    });
  }
  $$(".key-row").forEach((row) => {
    $(".save-key", row).addEventListener("click", async () => {
      const input = $("input", row);
      if (!input.value.trim()) { toast("Paste the key first."); return; }
      cfg = await api("/api/secrets", { body: { name: row.dataset.name, value: input.value.trim() } });
      input.value = ""; renderKeys(); toast("Key saved securely.");
    });
    $(".clear-key", row).addEventListener("click", async () => {
      cfg = await api("/api/secrets", { body: { name: row.dataset.name, value: "" } });
      renderKeys(); toast("Key removed.");
    });
  });

  function renderSources() {
    const box = $("#sources");
    box.innerHTML = "";
    cfg.sources.forEach((src, i) => box.appendChild(sourceRow(src, i)));
  }

  function sourceRow(src, i) {
    const el = $("#srcTpl").content.firstElementChild.cloneNode(true);
    const builtin = src.adapter !== "generic";
    el.classList.toggle("off", !src.enabled);
    $(".s-enabled", el).checked = src.enabled;
    $(".s-name", el).value = src.name;
    $(".s-type", el).value = src.type;
    $(".s-type", el).disabled = builtin;
    $(".s-url", el).value = src.url;
    const last = (cfg.last_runs || {})[src.id];
    $(".s-note", el).textContent = [src.note, last ? `Last pulled ${new Date(last + "Z").toLocaleString()}.` : ""].filter(Boolean).join(" ");
    const fields = SPECIAL[src.adapter] || (builtin ? [] : MAP_FIELDS[src.type] || []);
    $(".s-adv", el).hidden = !fields.length;
    const mapBox = $(".s-mapping", el);
    mapBox.innerHTML = fields.map(([k, label, wide]) => `<label class="${wide ? "wide" : ""}">${esc(label)}
      ${wide ? `<textarea data-k="${k}">${esc(src.mapping[k] || "")}</textarea>` : `<input data-k="${k}" value="${esc(src.mapping[k] || "")}">`}</label>`).join("") +
      (src.type === "json" && !builtin ? '<p class="muted small wide">Use dotted paths such as <code>cve.id</code> or <code>metrics.0.score</code>. In the URL, {since} is replaced by the last scan date (YYYY-MM-DD).</p>' : "");

    const update = (fn) => { fn(cfg.sources[i]); queueSave(); };
    $(".s-enabled", el).addEventListener("change", (e) => { update((s) => (s.enabled = e.target.checked)); el.classList.toggle("off", !e.target.checked); });
    $(".s-name", el).addEventListener("input", (e) => update((s) => (s.name = e.target.value)));
    $(".s-url", el).addEventListener("input", (e) => update((s) => (s.url = e.target.value)));
    $(".s-type", el).addEventListener("change", (e) => { update((s) => (s.type = e.target.value)); saveNow().then(renderSources); });
    mapBox.addEventListener("input", (e) => { const k = e.target.dataset.k; if (k) update((s) => (s.mapping[k] = e.target.value)); });
    $(".s-adv", el).addEventListener("click", () => (mapBox.hidden = !mapBox.hidden));
    $(".s-del", el).addEventListener("click", async () => {
      if (!confirm(`Delete the source "${src.name}"? Records already collected from it stay until you reset or clear them.`)) return;
      cfg.sources.splice(i, 1); await saveNow(); renderSources();
    });
    $(".s-test", el).addEventListener("click", async (e) => {
      const btn = e.target, out = $(".s-result", el);
      btn.disabled = true; btn.textContent = "Testing…";
      out.hidden = false; out.className = "s-result small muted"; out.textContent = "Fetching once - this can take up to a minute…";
      try {
        const r = await api("/api/sources/test", { body: { source: cfg.sources[i] } });
        if (r.ok) {
          out.className = "s-result small ok";
          const ex = r.sample.map((s) => s.vuln_id).join(", ");
          out.textContent = `Worked: ${fmt(r.count)} records found in ${r.seconds}s${ex ? ` (e.g. ${ex})` : ""}.`;
        } else {
          out.className = "s-result small fail";
          out.textContent = `Failed: ${r.error}`;
        }
      } catch (err) { out.className = "s-result small fail"; out.textContent = "Failed: " + err.message; }
      btn.disabled = false; btn.textContent = "Test";
    });
    return el;
  }

  $("#addSrc").addEventListener("click", async () => {
    cfg.sources.push({ id: "", name: "New source", type: "json", adapter: "generic", url: "", enabled: false, mapping: {}, note: "" });
    await saveNow(); renderSources();
    const rows = $$("#sources .src"); const last = rows[rows.length - 1];
    $(".s-mapping", last).hidden = false; $(".s-name", last).select();
  });
  $("#resetBtn").addEventListener("click", async () => {
    if (!confirm("Put the source list, app name and description back to the defaults? Your keys and collected data are kept.")) return;
    cfg = await api("/api/settings/reset", { body: {} }); await loadSettings(); await loadInfo(); toast("Settings reset to defaults.");
  });
  [["#sTitle", "app_title"], ["#sTagline", "tagline"]].forEach(([s, k]) => $(s).addEventListener("input", (e) => { cfg[k] = e.target.value; queueSave(); }));
  $("#sDays").addEventListener("change", (e) => { cfg.first_scan_days = Number(e.target.value); queueSave(); });

  function queueSave() {
    $("#saveState").textContent = "Saving…";
    clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 600);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    try {
      const saved = await api("/api/settings", { method: "PUT", body: { app_title: cfg.app_title, tagline: cfg.tagline, first_scan_days: cfg.first_scan_days, sources: cfg.sources } });
      // keep server-assigned IDs for new rows without redrawing what the user is typing in
      saved.sources.forEach((s, i) => { if (cfg.sources[i]) cfg.sources[i].id = s.id; });
      cfg.last_runs = saved.last_runs;
      $("#saveState").textContent = "All changes saved";
      loadInfo();
    } catch (e) { $("#saveState").textContent = "Could not save: " + e.message; }
  }

  // ------------------------------------------------------------------ phone --
  async function loadPhone() {
    const p = await api("/api/phone");
    $("#phoneToggle").checked = p.enabled;
    $("#phoneInfo").hidden = !p.running;
    $("#qr").innerHTML = p.qr_svg || "";
    $("#phoneUrl").textContent = p.url ? `Or type this on your phone: ${p.url}` : "";
    $("#phoneErr").hidden = !p.error; $("#phoneErr").textContent = p.error || "";
  }
  $("#phoneToggle").addEventListener("change", async (e) => {
    await api("/api/settings", { method: "PUT", body: { phone_access: e.target.checked } });
    loadPhone();
  });
  $("#newKey").addEventListener("click", async () => { await api("/api/phone/new-key", { body: {} }); loadPhone(); toast("New link made. Scan the new QR code on your phone."); });

  $("#quitBtn").addEventListener("click", async () => {
    if (!confirm("Quit VulnScan?")) return;
    await api("/api/quit", { body: {} });
    document.body.innerHTML = '<main><p class="empty">VulnScan has closed. You can close this window.</p></main>';
  });

  // ------------------------------------------------------------- heartbeat --
  // Tells the program the window is still open; it quits a few minutes after it closes.
  function beat() { api("/api/heartbeat", { body: {} }).catch(() => {}); }

  // ------------------------------------------------------------------ start --
  (async () => {
    restoreFilters();
    try { await loadInfo(); } catch (e) { toast("Could not reach VulnScan. Is it still running?"); return; }
    if (!isPhone) { beat(); setInterval(beat, 30000); }
    await loadResults();
    pollScan();
    show(location.hash === "#settings" ? "settings" : "main");
  })();
})();
