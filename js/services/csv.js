// RFC 4180 CSV parsing and generation (no dependencies).

const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Neutralise spreadsheet formula injection (CWE-1236): cells beginning with
 * = + - @ are prefixed with an apostrophe so Excel treats them as text.
 * Plain numbers (e.g. -1.5) are left untouched.
 */
export function safeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const s = String(value);
  if (FORMULA_START.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) return `'${s}`;
  return s;
}

/** Reverse safeCell on import. */
export function unsafeCell(s) {
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

function quote(s) {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Convert rows (array of arrays) to CSV text with a UTF-8 BOM so Excel detects the encoding. */
export function toCsv(rows, { bom = true } = {}) {
  const body = rows.map((r) => r.map((c) => quote(safeCell(c))).join(',')).join('\r\n');
  return (bom ? '﻿' : '') + body + '\r\n';
}

/** Convert objects to CSV using column definitions [{header, value:(obj)=>any}] */
export function objectsToCsv(objects, columns) {
  return toCsv([columns.map((c) => c.header), ...objects.map((o) => columns.map((c) => c.value(o)))]);
}

/** Parse CSV text into an array of rows (arrays of strings). */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"' && field === '') { inQuotes = true; i += 1; continue; }
    if (c === ',') { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r' || c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      i += 1; continue;
    }
    field += c; i += 1;
  }
  if (inQuotes) throw new Error('CSV parse error: unterminated quoted field.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Drop fully empty lines
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Parse CSV with a header row into {headers, records:[{_row, ...}]} */
export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r, idx) => {
    const o = { _row: idx + 2 };
    headers.forEach((h, i) => { o[h] = unsafeCell((r[i] ?? '').trim()); });
    if (r.length > headers.length && r.slice(headers.length).some((x) => x.trim())) o._extraColumns = true;
    return o;
  });
  return { headers, records };
}
