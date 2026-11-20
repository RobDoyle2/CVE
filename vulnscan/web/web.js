"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString();
  const DEFAULTS = { q: "", days: "7", severity: "high", source: "", exploited_only: false };
  const PAGE = 200;
  let meta = null, core = [], rest = null, loadingRest = null, shown = PAGE, current = [];

  // Row layout from build_web.py
  const ID = 0, SRC = 1, EXP = 2, SEV = 3, SCORE = 4, AFF = 5, SUM = 6, PUB = 7, MOD = 8, LINK = 9, ALIAS = 10;

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 3500);
  }

  async function getJSON(path) {
    const r = await fetch(path + "?v=" + encodeURIComponent(meta ? meta.generated : Date.now()));
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
    return r.json();
  }

  function filters() {
    return { q: $("#fQ").value.trim(), days: $("#fDays").value, severity: $("#fSev").value,
             source: $("#fSrc").value, exploited_only: $("#fExp").checked };
  }
  function setFilters(f) {
    $("#fQ").value = f.q; $("#fDays").value = f.days; $("#fSev").value = f.severity;
    $("#fSrc").value = f.source; $("#fExp").checked = !!f.exploited_only;
  }
  function save() { try { localStorage.setItem("vs_web_filters", JSON.stringify(filters())); } catch (e) { /* ignore */ } }
  function restore() {
    try { const f = JSON.parse(localStorage.getItem("vs_web_filters") || "null"); if (f) setFilters({ ...DEFAULTS, ...f }); } catch (e) { /* ignore */ }
  }

  // Same rules as the desktop app: in the time window if modified or published in it;
  // known exploited items always count whatever their severity; worst first.
  function apply() {
    const f = filters();
    const cutoff = new Date(Date.now() - Number(f.days) * 864e5).toISOString().slice(0, 10);
    const sevMax = f.severity === "critical" ? 0 : f.severity === "high" ? 1 : 99;
    const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const src = f.source === "" ? -1 : Number(f.source);
    const pool = f.severity === "all" && rest ? core.concat(rest) : core;
    const out = [];
    for (const r of pool) {
      if (!((r[MOD] && r[MOD] >= cutoff) || (r[PUB] && r[PUB] >= cutoff))) continue;
      if (!(r[EXP] || r[SEV] <= sevMax)) continue;
      if (f.exploited_only && !r[EXP]) continue;
      if (src >= 0 && r[SRC] !== src) continue;
      if (words.length) {
        const hay = (r[ID] + " " + r[ALIAS] + " " + r[AFF] + " " + r[SUM]).toLowerCase();
        if (!words.every((w) => hay.includes(w))) continue;
      }
      out.push(r);
    }
    out.sort((a, b) => (b[EXP] - a[EXP]) || (a[SEV] - b[SEV]) || ((b[SCORE] ?? -1) - (a[SCORE] ?? -1)) ||
                       String(b[MOD] || b[PUB]).localeCompare(String(a[MOD] || a[PUB])));
    return out;
  }

  async function refresh() {
    if ($("#fSev").value === "all" && !rest) {
      $("#count").textContent = "Loading all severities…";
      loadingRest = loadingRest || getJSON("data/rest.json").then((d) => (rest = d)).catch((e) => toast("Could not load: " + e.message));
      await loadingRest;
    }
    current = apply();
    shown = PAGE;
    render();
  }

  function render() {
    const total = meta.total;
    $("#count").textContent = `Showing ${fmt(current.length)} of ${fmt(total)}`;
    $("#results tbody").innerHTML = current.slice(0, shown).map(rowHtml).join("");
    $("#moreBtn").hidden = current.length <= shown;
    $("#moreBtn").textContent = `Show more (${fmt(current.length - shown)} left)`;
    const empty = $("#empty");
    empty.hidden = current.length > 0;
    empty.textContent = "No vulnerabilities match these filters. Try a longer time window or Clear filters.";
    $("#csvBtn").disabled = !current.length;
  }

  function linkFor(r) {
    if (r[LINK]) return r[LINK];
    const tmpl = meta.url_templates[meta.source_ids[r[SRC]]];
    return tmpl ? tmpl.replace("{}", r[ID]) : "";
  }

  function rowHtml(r) {
    const sev = meta.severities[r[SEV]];
    const url = linkFor(r);
    return `<tr class="${r[EXP] ? "exploited" : ""}">
      <td class="id">${esc(r[ID])}${r[ALIAS] && r[ALIAS] !== r[ID] ? `<div class="src-tag">${esc(r[ALIAS])}</div>` : ""}</td>
      <td class="srccol src-tag">${esc(meta.source_names[r[SRC]] || "")}</td>
      <td class="exp-cell">${r[EXP] ? '<span class="exp">YES - exploited</span>' : ""}</td>
      <td class="sev">${sev ? `<span class="badge sev-${esc(sev)}">${esc(sev)}</span>` : ""}</td>
      <td class="num score">${r[SCORE] == null ? "" : Number(r[SCORE]).toFixed(1)}</td>
      <td class="aff">${esc(r[AFF])}</td>
      <td class="sum">${esc(r[SUM])}</td>
      <td class="date">${esc(r[PUB] || r[MOD])}</td>
      <td class="link">${/^https?:\/\//i.test(url) ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open</a>` : ""}</td></tr>`;
  }

  function csv() {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["ID", "Source", "Exploited", "Severity", "Score", "Affected product", "Summary", "Published", "Modified", "Link"].map(q).join(",")];
    for (const r of current) {
      lines.push([r[ID], meta.source_names[r[SRC]], r[EXP] ? "YES" : "", meta.severities[r[SEV]], r[SCORE] ?? "",
                  r[AFF], r[SUM], r[PUB], r[MOD], linkFor(r)].map(q).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vulnerabilities-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function ago(iso) {
    const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const h = Math.round(mins / 60);
    return h < 48 ? `${h} hour${h === 1 ? "" : "s"} ago` : `${Math.round(h / 24)} days ago`;
  }

  let deb = null;
  ["#fDays", "#fSev", "#fSrc", "#fExp"].forEach((s) => $(s).addEventListener("change", () => { save(); refresh(); }));
  $("#fQ").addEventListener("input", () => { save(); clearTimeout(deb); deb = setTimeout(refresh, 150); });
  $("#clearBtn").addEventListener("click", () => { setFilters(DEFAULTS); save(); refresh(); });
  $("#moreBtn").addEventListener("click", () => { shown += PAGE * 2; render(); });
  $("#csvBtn").addEventListener("click", csv);

  (async () => {
    try {
      meta = await getJSON("data/meta.json");
      core = await getJSON("data/core.json");
    } catch (e) {
      $("#summary").textContent = "Could not load the results: " + e.message;
      return;
    }
    $("#fSrc").innerHTML = '<option value="">All sources</option>' +
      meta.source_ids.map((id, i) => `<option value="${i}">${esc(meta.source_names[i])}</option>`).join("");
    restore();
    const gen = new Date(meta.generated);
    $("#updated").textContent = `Updated ${ago(meta.generated)} (${gen.toLocaleString()}). Refreshes every 6 hours.`;
    const fails = meta.sources.filter((s) => s.status !== "ok");
    $("#srcState").textContent = fails.length ? `- ${fails.length} failed last time` : "- all ok";
    $("#progress").innerHTML = meta.sources.map((s) => `<li><span class="st ${s.status}">${s.status === "ok" ? "ok" : "FAIL"}</span>
      <span>${esc(s.name)}</span>${s.error ? `<span class="err">${esc(s.error)}</span>` : `<span class="msg muted">${fmt(s.records)} records</span>`}</li>`).join("");
    await refresh();
    const seven = (() => { const save = filters(); setFilters({ ...DEFAULTS }); const n = apply(); setFilters(save); return n; })();
    const exp = seven.filter((r) => r[EXP]).length;
    $("#summary").textContent = `${fmt(meta.total)} records collected. ${fmt(seven.length)} are exploited or critical/high in the last 7 days (${fmt(exp)} known exploited).`;
  })();
})();
