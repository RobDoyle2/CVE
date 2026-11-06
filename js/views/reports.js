import { esc } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { pageHeader, emptyState } from '../ui/components.js';
import { REPORTS } from '../services/reports.js';
import { downloadSheets } from './export-helpers.js';

const PREVIEW_ROWS = 25;

export function render(el, ctx) {
  const { store, query } = ctx;
  let active = REPORTS.find((r) => r.id === query.report) || REPORTS[0];
  el.innerHTML = `
    ${pageHeader({ title: 'Reports', subtitle: 'Generate management and operational reports. Download as Excel workbooks or CSV, or print to PDF.' })}
    <div class="grid grid-3" id="cards">${REPORTS.map((r) => `
      <div class="card" data-report="${r.id}">
        <div class="card-header"><span class="activity"><span class="icon">${icons.report}</span></span><h3>${esc(r.title)}</h3></div>
        <p class="small muted">${esc(r.description)}</p>
        <div class="flex flex-wrap">
          <button class="btn btn-sm" data-preview="${r.id}">Preview</button>
          <button class="btn btn-sm btn-primary" data-dl="${r.id}" data-format="xlsx">⬇ Excel</button>
          <button class="btn btn-sm" data-dl="${r.id}" data-format="csv" title="CSV of the first sheet">⬇ CSV</button>
        </div>
      </div>`).join('')}
    </div>
    <div class="card mt-2" id="preview-card">
      <div class="card-header"><h3 id="pv-title"></h3><div class="actions"><button class="btn btn-sm" id="print">${icons.print}Print / PDF</button></div></div>
      <div class="tabs" id="pv-tabs"></div>
      <div id="pv-body"></div>
    </div>`;

  const preview = (report, sheetIdx = 0) => {
    active = report;
    const sheets = report.build(store);
    el.querySelector('#pv-title').textContent = `Preview: ${report.title}`;
    el.querySelector('#pv-tabs').innerHTML = sheets.map((s, i) => `<button class="tab ${i === sheetIdx ? 'active' : ''}" data-sheet="${i}">${esc(s.name)} (${s.rows.length - 1})</button>`).join('');
    const rows = sheets[sheetIdx].rows;
    el.querySelector('#pv-body').innerHTML = rows.length > 1 ? `<div class="table-wrap"><table class="data"><thead><tr>${rows[0].map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
      ${rows.slice(1, PREVIEW_ROWS + 1).map((r) => `<tr>${r.map((c) => `<td class="small">${esc(c)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>${rows.length - 1 > PREVIEW_ROWS ? `<p class="small muted mt-1">Showing ${PREVIEW_ROWS} of ${rows.length - 1} rows. Download for the full report.</p>` : ''}` : emptyState('This report has no rows for the current data.');
    el.querySelectorAll('#pv-tabs [data-sheet]').forEach((t) => t.addEventListener('click', () => preview(report, Number(t.dataset.sheet))));
  };
  el.querySelectorAll('[data-preview]').forEach((b) => b.addEventListener('click', () => {
    preview(REPORTS.find((r) => r.id === b.dataset.preview));
    el.querySelector('#preview-card').scrollIntoView({ behavior: 'smooth' });
  }));
  el.querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', () => {
    const r = REPORTS.find((x) => x.id === b.dataset.dl);
    downloadSheets(r.title, r.build(store), b.dataset.format);
  }));
  el.querySelector('#print').addEventListener('click', () => window.print());
  preview(active);
}
