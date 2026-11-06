// Download helpers shared by list pages, Reports and Import/Export.
import { downloadBlob, todayIso } from '../ui/dom.js';
import { toCsv } from '../services/csv.js';
import { buildXlsx, XLSX_MIME } from '../services/xlsx.js';
import { exportRows, assessmentRows } from '../services/data-exchange.js';
import { toast } from '../ui/toast.js';

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function downloadSheets(title, sheets, format) {
  const base = `${slug(title)}-${todayIso()}`;
  if (format === 'csv') {
    downloadBlob(toCsv(sheets[0].rows), `${base}.csv`, 'text/csv;charset=utf-8');
  } else {
    downloadBlob(new Blob([buildXlsx(sheets)], { type: XLSX_MIME }), `${base}.xlsx`, XLSX_MIME);
  }
  toast(`Downloaded ${title} (${format === 'csv' ? 'CSV' : 'Excel'}).`);
}

export function downloadDataset(type, store, format, label, records) {
  const rows = type === 'assessments' ? assessmentRows(store) : exportRows(type, store, records);
  downloadSheets(label || type, [{ name: label || type, rows }], format);
}

/** Two small buttons ("CSV", "Excel") for a page header. */
export function exportButtons(id) {
  return `<span class="flex" role="group" aria-label="Export">
    <button type="button" class="btn" data-export="${id}" data-format="csv" title="Download CSV">⬇ CSV</button>
    <button type="button" class="btn" data-export="${id}" data-format="xlsx" title="Download Excel workbook">⬇ Excel</button>
  </span>`;
}

export function bindExportButtons(el, handler) {
  el.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => handler(b.dataset.format, b.dataset.export)));
}
