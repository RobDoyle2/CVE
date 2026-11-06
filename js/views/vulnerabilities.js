import { esc, debounce, fmtDate, extLink, uniq } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import {
  pageHeader, severityPill, assessmentPill, priorityPill, selectFilter, button, emptyState, envTags,
} from '../ui/components.js';
import { TableController } from '../ui/table.js';
import { openRecordForm } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { SEVERITIES, EXPLOITATION_STATUS, severityFromScore } from '../models/lookups.js';
import { cachedAssessAll, STATUS_ORDER } from '../services/assessment-engine.js';
import { describeExpression } from '../services/version.js';
import { confirmAndDelete } from './shared.js';

export function render(el, ctx) {
  if (ctx.params.id) return renderDetail(el, ctx);
  return renderList(el, ctx);
}

export function openCveForm(ctx, cve, onSaved) {
  const { store } = ctx;
  openRecordForm({
    title: cve ? `Edit ${cve.id}` : 'Add vulnerability',
    collection: 'vulnerabilities',
    record: cve || { exploitAvailability: 'Unknown', exploitationStatus: 'Unknown', references: [] },
    store,
    intro: 'Severity is derived from the CVSS score if left blank. Affected versions drive the automated impact assessment.',
    onSubmit: async (data) => {
      if (!data.severity && data.cvssScore !== null && data.cvssScore !== undefined) data.severity = severityFromScore(data.cvssScore);
      if (!data.lastModified) data.lastModified = data.published;
      const saved = cve
        ? await store.update('vulnerabilities', cve.id, data)
        : await store.create('vulnerabilities', { ...data, source: 'Manual entry' });
      toast(`${saved.id} saved.`);
      if (onSaved) onSaved(saved);
    },
  });
}

function renderList(el, ctx) {
  const { store, session, query } = ctx;
  const results = cachedAssessAll(store);
  const byCve = new Map(results.map((r) => [r.cve.id, r]));
  const state = { q: query.q || '', severity: query.severity || '', exploitation: query.exploitation || '', status: query.status || '', vendor: '' };
  const canWrite = session.can('write');

  el.innerHTML = `
    ${pageHeader({
      title: 'Vulnerabilities (CVEs)',
      subtitle: 'Register of vulnerabilities under monitoring, with automated cross-reference against the inventory.',
      actions: canWrite ? button('Add vulnerability', { variant: 'primary', icon: 'plus', attrs: 'id="add"' }) : '',
    })}
    <div class="card">
      <div class="toolbar">
        <input class="input search" type="search" id="q" placeholder="Search CVE ID, title, vendor, product…" value="${esc(state.q)}" aria-label="Search vulnerabilities">
        ${selectFilter('flt-sev', 'Severity', SEVERITIES, state.severity)}
        ${selectFilter('flt-exp', 'Exploitation', EXPLOITATION_STATUS, state.exploitation)}
        ${selectFilter('flt-status', 'Assessment', [...STATUS_ORDER, 'No inventory match'], state.status)}
        ${selectFilter('flt-vendor', 'Vendor', uniq(store.all('vulnerabilities').map((v) => v.vendor)).sort())}
        <span class="count" id="count"></span>
      </div>
      <div id="table"></div>
    </div>`;

  const filtered = () => {
    const q = state.q.toLowerCase();
    return store.all('vulnerabilities').filter((v) => {
      if (q && ![v.id, v.title, v.vendor, v.product, v.description].join(' ').toLowerCase().includes(q)) return false;
      if (state.severity && v.severity !== state.severity) return false;
      if (state.exploitation && v.exploitationStatus !== state.exploitation) return false;
      if (state.vendor && v.vendor !== state.vendor) return false;
      if (state.status && byCve.get(v.id).summary.status !== state.status) return false;
      return true;
    });
  };
  const sevRank = (s) => SEVERITIES.indexOf(s);
  const table = new TableController(el.querySelector('#table'), {
    getRows: filtered,
    initialSort: { key: 'published', dir: -1 },
    columns: [
      { key: 'id', label: 'CVE', render: (v) => `<a class="row-link mono" href="#/vulnerabilities/${esc(v.id)}">${esc(v.id)}</a><div class="small muted">${esc(v.title)}</div>` },
      { key: 'severity', label: 'Severity', render: (v) => `${severityPill(v.severity)} <span class="small muted">${esc(v.cvssScore ?? '')}</span>`, sort: (v) => sevRank(v.severity) },
      { key: 'product', label: 'Affected product', render: (v) => `${esc(v.product)}<div class="small muted">${esc(v.vendor)}</div>` },
      { key: 'affectedVersions', label: 'Affected versions', render: (v) => `<span class="small mono">${esc(describeExpression(v.affectedVersions || ''))}</span>` },
      { key: 'exploitationStatus', label: 'Exploitation', render: (v) => (v.exploitationStatus === 'Known exploited (CISA KEV)' ? '<span class="pill red">KEV</span>' : v.exploitationStatus === 'Exploitation reported' ? '<span class="pill orange">Reported</span>' : `<span class="small muted">${esc(v.exploitationStatus)}</span>`) },
      { key: 'published', label: 'Published', render: (v) => fmtDate(v.published) },
      { key: 'assessment', label: 'Impact', render: (v) => { const s = byCve.get(v.id).summary; return `${assessmentPill(s.status)}${s.applications.length ? `<div class="small muted">${s.applications.length} app(s)</div>` : ''}`; }, sort: (v) => STATUS_ORDER.indexOf(byCve.get(v.id).summary.status) },
      { key: 'priority', label: 'Priority', render: (v) => priorityPill(byCve.get(v.id).summary.priority), sort: (v) => byCve.get(v.id).summary.priority || 'P9' },
      {
        key: 'actions', label: 'Actions', className: 'actions', sortable: false,
        render: (v) => `<a class="icon-btn" href="#/assessments/${esc(v.id)}" title="Impact assessment" aria-label="Impact assessment for ${esc(v.id)}">${icons.target}</a>`
          + (canWrite ? `<button class="icon-btn" data-edit="${esc(v.id)}" aria-label="Edit ${esc(v.id)}" title="Edit">${icons.edit}</button>` : '')
          + (session.can('delete') ? `<button class="icon-btn" data-delete="${esc(v.id)}" aria-label="Delete ${esc(v.id)}" title="Delete">${icons.trash}</button>` : ''),
      },
    ],
  });
  const refresh = () => { const rows = table.render(); el.querySelector('#count').textContent = `${rows.length} of ${store.count('vulnerabilities')} CVEs`; };
  refresh();
  el.querySelector('#q').addEventListener('input', debounce((e) => { state.q = e.target.value; refresh(); }, 150));
  [['#flt-sev', 'severity'], ['#flt-exp', 'exploitation'], ['#flt-status', 'status'], ['#flt-vendor', 'vendor']]
    .forEach(([id, k]) => el.querySelector(id).addEventListener('change', (e) => { state[k] = e.target.value; refresh(); }));
  const add = el.querySelector('#add');
  if (add) add.addEventListener('click', () => openCveForm(ctx, null, () => renderList(el, ctx)));
  el.querySelector('#table').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    if (ed) openCveForm(ctx, store.get('vulnerabilities', ed.dataset.edit), () => renderList(el, ctx));
    if (del && await confirmAndDelete(store, 'vulnerabilities', del.dataset.delete, del.dataset.delete)) renderList(el, ctx);
  });
}

function renderDetail(el, ctx) {
  const { store, session, params, router } = ctx;
  const v = store.get('vulnerabilities', params.id);
  if (!v) {
    el.innerHTML = `<div class="card">${emptyState(`Vulnerability ${params.id} is not in the register.`)}<p class="text-right"><a class="btn" href="#/vulnerabilities">Back</a></p></div>`;
    return;
  }
  ctx.setTitle(`Vulnerabilities / ${v.id}`);
  const result = cachedAssessAll(store).find((r) => r.cve.id === v.id);
  const s = result.summary;
  el.innerHTML = `
    ${pageHeader({
      title: v.id,
      subtitle: v.title,
      crumbs: '<a href="#/vulnerabilities">Vulnerabilities</a>',
      actions: `<a class="btn btn-primary" href="#/assessments/${esc(v.id)}">${icons.target}View impact assessment</a>${session.can('write') ? button('Edit', { icon: 'edit', attrs: 'id="edit"' }) : ''}${session.can('delete') ? button('Delete', { variant: 'danger', icon: 'trash', attrs: 'id="delete"' }) : ''}`,
    })}
    <div class="grid grid-3">
      <div class="card span-2">
        <div class="card-header"><h3>Vulnerability record</h3>${severityPill(v.severity)}</div>
        <p>${esc(v.description)}</p>
        <dl class="kv">
          <dt>CVSS score</dt><dd>${esc(v.cvssScore ?? '—')} ${v.cvssVector ? `<span class="mono small muted">${esc(v.cvssVector)}</span>` : ''}</dd>
          <dt>Affected manufacturer</dt><dd>${esc(v.vendor)}</dd>
          <dt>Affected product</dt><dd>${esc(v.product)}</dd>
          <dt>Affected versions</dt><dd class="mono">${esc(describeExpression(v.affectedVersions || ''))}</dd>
          <dt>Fixed versions</dt><dd class="mono">${esc(v.fixedVersions || '—')}</dd>
          <dt>Published</dt><dd>${fmtDate(v.published)}</dd>
          <dt>Last modified</dt><dd>${fmtDate(v.lastModified)}</dd>
          <dt>Exploit availability</dt><dd>${esc(v.exploitAvailability)}</dd>
          <dt>Known exploitation</dt><dd>${esc(v.exploitationStatus)}</dd>
          <dt>Remediation</dt><dd>${esc(v.remediation || '—')}</dd>
          <dt>References</dt><dd>${(v.references || []).length ? v.references.map((r) => `<div>${extLink(r)}</div>`).join('') : '—'}</dd>
          <dt>Source</dt><dd>${esc(v.source || '—')}</dd>
        </dl>
      </div>
      <div class="card">
        <div class="card-header"><h3>Impact summary</h3></div>
        <dl class="kv">
          <dt>Overall status</dt><dd>${assessmentPill(s.status)}</dd>
          <dt>Investigation priority</dt><dd>${priorityPill(s.priority, s.priorityLabel)}</dd>
          <dt>Matched software</dt><dd>${s.matchedSoftware}</dd>
          <dt>Applications</dt><dd>${s.applications.length ? s.applications.map((a) => `<div><a href="#/applications/${esc(a.id)}">${esc(a.name)}</a> ${envTags(a.environments)}</div>`).join('') : '—'}</dd>
          <dt>AWS accounts</dt><dd>${s.awsAccounts.map((a) => esc(a.accountName)).join(', ') || '—'}</dd>
        </dl>
        <p class="small muted mt-2">Automated matching indicates where to investigate. It is not proof that the vulnerability is present.</p>
      </div>
    </div>`;
  const edit = el.querySelector('#edit');
  if (edit) edit.addEventListener('click', () => openCveForm(ctx, v, () => renderDetail(el, ctx)));
  const del = el.querySelector('#delete');
  if (del) del.addEventListener('click', async () => { if (await confirmAndDelete(store, 'vulnerabilities', v.id, v.id)) router.go('/vulnerabilities'); });
}

