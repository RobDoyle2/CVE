import { esc, downloadBlob, readFileAsText } from '../ui/dom.js';
import { pageHeader, button, emptyState } from '../ui/components.js';
import { toast } from '../ui/toast.js';
import { IMPORT_TYPES, analyseImport, applyImport, templateCsv } from '../services/data-exchange.js';
import { SCHEMAS } from '../models/schemas.js';
import { downloadDataset, downloadSheets } from './export-helpers.js';
import { inventoryWorkbook } from '../services/data-exchange.js';

const MAX_BYTES = 5 * 1024 * 1024;
const CONTRIBUTOR_TYPES = ['applications', 'software'];

export function render(el, ctx) {
  const { query } = ctx;
  let tab = query.tab === 'export' ? 'export' : 'import';
  el.innerHTML = `
    ${pageHeader({ title: 'Import / Export', subtitle: 'Bulk-load inventory and vulnerability records from CSV, and export data for Excel.' })}
    <div class="tabs" role="tablist">
      <button class="tab" data-tab="import" role="tab">Import CSV</button>
      <button class="tab" data-tab="export" role="tab">Export</button>
    </div>
    <div id="tab-body"></div>`;
  const show = () => {
    el.querySelectorAll('.tab').forEach((t) => { t.classList.toggle('active', t.dataset.tab === tab); t.setAttribute('aria-selected', String(t.dataset.tab === tab)); });
    const host = document.createElement('div');
    el.querySelector('#tab-body').replaceChildren(host);
    if (tab === 'import') renderImport(host, ctx); else renderExport(host, ctx);
  };
  el.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; show(); }));
  show();
}

function allowedTypes(session) {
  if (session.can('import')) return Object.keys(IMPORT_TYPES);
  if (session.can('submit')) return CONTRIBUTOR_TYPES;
  return [];
}

function columnGuide(type) {
  const spec = IMPORT_TYPES[type];
  const schema = SCHEMAS[spec.collection];
  return `<div class="table-wrap"><table class="data"><thead><tr><th>Column</th><th>Required</th><th>Format / allowed values</th></tr></thead><tbody>
    ${spec.columns.filter((c) => !c.exportOnly).map((c) => {
      const f = schema.fields.find((x) => x.key === c.field);
      let fmt = c.hint || (f && f.hint) || '';
      if (f && f.options) fmt = `One of: ${f.options.join(', ')}`;
      if (c.kind === 'list') fmt = `${f && f.options ? `${fmt}. ` : ''}Separate multiple values with ";"`;
      if (c.kind === 'bool') fmt = 'yes / no';
      if (f && f.type === 'date') fmt = 'YYYY-MM-DD';
      if (c.header === 'id') fmt = type === 'vulnerabilities' ? 'CVE-YYYY-NNNN (required)' : `Leave blank to auto-generate, or ${schema.idPrefix}-001 to match existing`;
      if (c.relation) fmt = `${fmt || ''} (relationship)`.trim();
      return `<tr><td class="mono">${esc(c.header)}</td><td>${f && f.required ? '<span class="pill red">Required</span>' : '<span class="muted">Optional</span>'}</td><td class="small">${esc(fmt)}</td></tr>`;
    }).join('')}
  </tbody></table></div>`;
}

function renderImport(el, ctx) {
  const { store, session } = ctx;
  const types = allowedTypes(session);
  if (!types.length) {
    el.innerHTML = `<div class="notice">Your role (${esc(session.user.role)}) cannot import data. Switch to a Contributor, Security Analyst or Administrator demo user.</div>`;
    return;
  }
  let type = types[0];
  let analysis = null;
  el.innerHTML = `
    ${!session.can('import') ? '<div class="notice mb-2">As a Contributor you can import <strong>applications</strong> and <strong>software</strong>. Imported records are marked <strong>Pending review</strong>.</div>' : ''}
    <div class="grid grid-3">
      <div class="card">
        <div class="card-header"><h3>1. Choose data type</h3></div>
        <label for="imp-type" class="small muted">Record type</label>
        <select id="imp-type" class="select" style="width:100%">${types.map((t) => `<option value="${t}">${esc(IMPORT_TYPES[t].label)}</option>`).join('')}</select>
        <p class="small mt-2">Download the template, fill it in using Excel or a text editor, save as <strong>CSV (UTF-8)</strong> and upload it.</p>
        <button class="btn" id="tpl">⬇ Download template</button>
      </div>
      <div class="card">
        <div class="card-header"><h3>2. Upload CSV file</h3></div>
        <input type="file" id="file" accept=".csv,text/csv" class="input" aria-label="CSV file to import">
        <p class="small muted mt-1">Nothing is saved until you review and confirm. Maximum file size 5 MB.</p>
        <div id="dup-mode" class="hidden mt-2">
          <div class="small" style="font-weight:600">Existing records (duplicates)</div>
          <label class="toggle small"><input type="radio" name="dup" value="skip" checked> Skip - keep existing data</label><br>
          <label class="toggle small"><input type="radio" name="dup" value="update"> Update existing records (empty cells leave values unchanged)</label>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>3. Review and confirm</h3></div>
        <div id="summary" class="small muted">Upload a file to see the validation results.</div>
        <button class="btn btn-primary mt-2" id="confirm" disabled>Confirm import</button>
      </div>
    </div>
    <div class="card mt-2" id="preview-card"><div class="card-header"><h3>Validation preview</h3></div><div id="preview">${emptyState('No file loaded yet.')}</div></div>
    <details class="card mt-2"><summary><strong>Column reference</strong> <span class="small muted">(click to expand)</span></summary><div id="guide" class="mt-2"></div></details>`;

  const guide = () => { el.querySelector('#guide').innerHTML = columnGuide(type); };
  guide();
  const reset = () => {
    analysis = null;
    el.querySelector('#file').value = '';
    el.querySelector('#preview').innerHTML = emptyState('No file loaded yet.');
    el.querySelector('#summary').textContent = 'Upload a file to see the validation results.';
    el.querySelector('#confirm').disabled = true;
    el.querySelector('#dup-mode').classList.add('hidden');
  };
  el.querySelector('#imp-type').addEventListener('change', (e) => { type = e.target.value; guide(); reset(); });
  el.querySelector('#tpl').addEventListener('click', () => downloadBlob(templateCsv(type), `template-${type}.csv`, 'text/csv;charset=utf-8'));

  el.querySelector('#file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_BYTES) { toast('File is larger than 5 MB.', 'error'); reset(); return; }
    try {
      const text = await readFileAsText(file);
      analysis = analyseImport(type, text, store);
      showAnalysis(el, analysis, type);
    } catch (err) {
      toast(`Could not read file: ${err.message}`, 'error');
      reset();
    }
  });

  el.querySelector('#confirm').addEventListener('click', async () => {
    if (!analysis) return;
    const mode = el.querySelector('input[name="dup"]:checked').value;
    el.querySelector('#confirm').disabled = true;
    try {
      const r = await applyImport(analysis, { duplicateMode: mode, session }, store);
      el.querySelector('#summary').innerHTML = `<div class="notice success"><strong>Import complete.</strong> ${r.created} created, ${r.updated} updated, ${r.skipped} skipped, ${r.errors} rows with errors not imported${r.links ? `, ${r.links} deployment link(s) created` : ''}.</div>`;
      toast(`Import complete: ${r.created} created, ${r.updated} updated.`);
      analysis = null;
      ctx.refreshChrome();
    } catch (err) {
      toast(`Import failed - no changes were saved. ${err.message}`, 'error', 8000);
      el.querySelector('#confirm').disabled = false;
    }
  });
}

function rowLabel(type, d) {
  switch (type) {
    case 'applications': return d.name;
    case 'software': return [d.vendor, d.product, d.version].filter(Boolean).join(' ');
    case 'vulnerabilities': return `${d.id || ''} ${d.title || ''}`;
    case 'awsAccounts': return `${d.accountName || ''} ${d.accountId || ''}`;
    case 'deployments': return `${d.applicationId || '?'} → ${d.softwareId || '?'}`;
    default: return d.name || d.id;
  }
}

function showAnalysis(el, a, type) {
  const s = a.summary;
  const importable = s.create + s.duplicate;
  el.querySelector('#dup-mode').classList.toggle('hidden', !s.duplicate);
  el.querySelector('#confirm').disabled = !!a.headerErrors.length || importable === 0;
  el.querySelector('#summary').innerHTML = a.headerErrors.length
    ? `<div class="notice danger">${a.headerErrors.map(esc).join('<br>')}</div>`
    : `<div class="flex flex-wrap"><span class="pill green">${s.create} new</span><span class="pill yellow">${s.duplicate} duplicates</span><span class="pill red">${s.error} with errors</span></div>
       <p class="mt-1">${s.total} rows read. ${s.error ? 'Rows with errors will <strong>not</strong> be imported - fix them and re-upload, or import the valid rows now.' : 'All rows are valid.'}</p>
       ${a.warnings.map((w) => `<div class="notice warn mt-1">${esc(w)}</div>`).join('')}`;
  if (a.headerErrors.length) { el.querySelector('#preview').innerHTML = emptyState('Fix the file structure and upload again.'); return; }
  el.querySelector('#preview').innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Row</th><th>Result</th><th>Record</th><th>Details</th></tr></thead><tbody>
    ${a.rows.map((r) => `<tr class="${r.action === 'error' ? 'import-row-error' : r.action === 'duplicate' ? 'import-row-dup' : ''}">
      <td>${r.rowNumber}</td>
      <td>${r.action === 'create' ? '<span class="pill green">New</span>' : r.action === 'duplicate' ? '<span class="pill yellow">Duplicate</span>' : '<span class="pill red">Error</span>'}</td>
      <td>${esc(rowLabel(type, r.data))}</td>
      <td class="small">${[
        r.duplicateReason ? `Matches existing record: ${esc(r.duplicateReason)}` : '',
        ...r.errors.map((e) => `<span style="color:var(--st-red)">✖ ${esc(e)}</span>`),
        ...r.warnings.map((w) => `⚠ ${esc(w)}`),
        r.relations && r.relations.applicationIds && r.relations.applicationIds.length ? `Links to ${esc(r.relations.applicationIds.join(', '))}` : '',
        r.relations && r.relations.infrastructureIds ? `Infrastructure: ${esc(r.relations.infrastructureIds.join(', '))}` : '',
      ].filter(Boolean).join('<br>') || '—'}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function renderExport(el, ctx) {
  const { store } = ctx;
  const sets = [
    ['applications', 'Applications', 'All application records with infrastructure links, derived AWS accounts and software.'],
    ['software', 'Software inventory', 'All software components with associated applications and environments.'],
    ['assessments', 'Vulnerability assessments', 'One row per CVE/software finding with evidence and scope.'],
    ['vulnerabilities', 'Vulnerabilities (CVEs)', 'The CVE register in import-compatible format.'],
    ['infrastructure', 'Infrastructure', 'Deployment targets, clusters and namespaces.'],
    ['awsAccounts', 'AWS accounts', 'AWS account records.'],
    ['deployments', 'Deployments', 'Application ↔ software ↔ infrastructure links.'],
  ];
  el.innerHTML = `
    <div class="notice mb-2">CSV files include a UTF-8 marker so Excel opens them correctly. Cells that look like spreadsheet formulas are prefixed with an apostrophe to prevent formula injection. Excel downloads are genuine <code>.xlsx</code> workbooks.</div>
    <div class="card mb-2"><div class="card-header"><h3>Complete workbook</h3><div class="actions">${button('⬇ Excel workbook (all data)', { variant: 'primary', attrs: 'id="all-xlsx"' })}</div></div>
      <p class="small muted mb-0">One .xlsx file with a sheet for each dataset plus the assessment results.</p></div>
    <div class="grid grid-3">${sets.map(([id, label, desc]) => `
      <div class="card"><div class="card-header"><h3>${esc(label)}</h3></div><p class="small muted">${esc(desc)}</p>
        <div class="flex"><button class="btn btn-sm" data-ds="${id}" data-format="csv">⬇ CSV</button><button class="btn btn-sm" data-ds="${id}" data-format="xlsx">⬇ Excel</button></div></div>`).join('')}
    </div>`;
  el.querySelector('#all-xlsx').addEventListener('click', () => downloadSheets('vulnerability-management-inventory', inventoryWorkbook(store), 'xlsx'));
  el.querySelectorAll('[data-ds]').forEach((b) => b.addEventListener('click', () => {
    const [, label] = sets.find((s) => s[0] === b.dataset.ds);
    downloadDataset(b.dataset.ds, store, b.dataset.format, label);
  }));
}
