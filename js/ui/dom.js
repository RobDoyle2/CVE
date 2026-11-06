// Small DOM and formatting helpers. All untrusted text MUST pass through esc()
// before being placed into HTML strings.

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (c) => ESC_MAP[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Only allow http(s) links to be rendered as anchors. */
export function safeUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

export function extLink(url, label) {
  const safe = safeUrl(url);
  if (!safe) return esc(label || url || '');
  return `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label || safe)}</a>`;
}

export function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return esc(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return esc(value);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function relTime(value, now = Date.now()) {
  if (!value) return '—';
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return '—';
  const diff = Math.round((now - d) / 1000);
  const abs = Math.abs(diff);
  const fmt = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ${diff >= 0 ? 'ago' : 'from now'}`;
  if (abs < 60) return 'just now';
  if (abs < 3600) return fmt(Math.round(abs / 60), 'minute');
  if (abs < 86400) return fmt(Math.round(abs / 3600), 'hour');
  if (abs < 86400 * 45) return fmt(Math.round(abs / 86400), 'day');
  return fmtDate(value);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function downloadBlob(content, filename, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function pluralise(n, word, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`;
}

export function uniq(arr) {
  return Array.from(new Set(arr.filter((v) => v !== null && v !== undefined && v !== '')));
}
