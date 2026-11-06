import { esc, debounce, fmtDate, fmtDateTime, uniq } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import {
  pageHeader, envTags, envTag, selectFilter, button, emptyState, verificationPill, reviewPill, assessmentPill, severityPill, criticalityPill,
} from '../ui/components.js';
import { TableController } from '../ui/table.js';
import { openRecordForm } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { SOFTWARE_CATEGORIES, VERIFICATION_STATUSES, REVIEW_STATUSES, ENVIRONMENTS } from '../models/lookups.js';
import { deploymentsForSoftware, applicationsForSoftware, environmentsForSoftware } from '../services/relationships.js';
import { cachedAssessAll, findingsForSoftware } from '../services/assessment-engine.js';
import { onCreate, onEdit } from '../services/workflow.js';
import { confirmAndDelete, openDeploymentForm, readOnlyNotice } from './shared.js';
import { exportButtons, bindExportButtons, downloadDataset } from './export-helpers.js';

export function render(el, ctx) {
  if (ctx.params.id) return renderDetail(el, ctx);
  return renderList(el, ctx);
}

function isStale(sw, days) {
  if (!sw.lastReviewed) return true;
  return (Date.now() - new Date(`${sw.lastReviewed}T00:00:00Z`).getTime()) / 86400000 > days;
}

function initialDeploymentSection(store) {
  const apps = store.all('applications');
  const infra = store.all('infrastructure');
  return {
    html: `<div class="form-field full"><label>Initial deployment (optional)</label>
      <div class="hint">Link the new software to an application now, or add deployments later from the software page.</div></div>
      <div class="form-field" data-field="dep_applicationId"><label for="dep-app">Associated application</label>
        <select class="select" id="dep-app" name="dep_applicationId"><option value="">(none)</option>${apps.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select><div class="error"></div></div>
      <div class="form-field" data-field="dep_environment"><label for="dep-env">Environment</label>
        <select class="select" id="dep-env" name="dep_environment"><option value="">Select…</option>${ENVIRONMENTS.map((e) => `<option>${esc(e)}</option>`).join('')}</select><div class="error"></div></div>
      <div class="form-field" data-field="dep_infrastructureId"><label for="dep-infra">Infrastructure</label>
        <select class="select" id="dep-infra" name="dep_infrastructureId"><option value="">(none)</option>${infra.map((i) => `<option value="${esc(i.id)}">${esc(i.name)} (${esc(i.environment)})</option>`).join('')}</select><div class="error"></div></div>
      <div class="form-field" data-field="dep_location"><label for="dep-loc">Installation / deployment location</label>
        <input class="input" id="dep-loc" name="dep_location" maxlength="255"><div class="error"></div></div>`,
    read: (form) => ({
      dep_applicationId: form.querySelector('#dep-app').value,
      dep_environment: form.querySelector('#dep-env').value,
      dep_infrastructureId: form.querySelector('#dep-infra').value,
      dep_location: form.querySelector('#dep-loc').value.trim(),
    }),
  };
}

export function openSoftwareForm(ctx, sw, onSaved) {
  const { store, session } = ctx;
  openRecordForm({
    title: sw ? `Edit ${sw.vendor} ${sw.product} ${sw.version}` : 'Add software component',
    collection: 'software',
    record: sw || { verificationStatus: 'Unverified' },
    store,
    intro: `${sw ? '' : 'Each record represents one vendor + product + <strong>version</strong>. Create a separate record for each version in use. '}${!session.can('review') ? `Your ${sw ? 'changes' : 'submission'} will be <strong>Pending review</strong>.` : ''}`,
    extra: sw ? null : initialDeploymentSection(store),
    onSubmit: async (data) => {
      const { dep_applicationId: depApp, dep_environment: depEnv, dep_infrastructureId: depInfra, dep_location: depLoc, ...fields } = data;
      let saved;
      await store.transaction(async () => {
        saved = sw ? await store.update('software', sw.id, onEdit(fields, sw, session)) : await store.create('software', onCreate(fields, session));
        if (!sw && depApp) {
          let env = depEnv;
          if (!env && depInfra) env = (store.get('infrastructure', depInfra) || {}).environment;
          await store.create('deployments', { applicationId: depApp, softwareId: saved.id, infrastructureId: depInfra || null, environment: env, location: depLoc });
        }
      });
      toast(`${saved.product} ${saved.version || ''} saved.`);
      if (onSaved) onSaved(saved);
    },
  });
}

function renderList(el, ctx) {
  const { store, session, query } = ctx;
  const staleDays = Number(store.getSettings().staleReviewDays) || 180;
  const state = { q: query.q || '', category: query.category || '', verification: query.verification || '', review: '', env: '', vendor: '', exposure: query.exposure || '' };
  const canEdit = session.canContribute();
  const results = cachedAssessAll(store);
  const exposure = (id) => findingsForSoftware(results, id).filter((x) => ['Confirmed affected', 'Potentially affected', 'Requires investigation', 'Unable to determine'].includes(x.finding.status));

  el.innerHTML = `
    ${pageHeader({
      title: 'Software Inventory',
      subtitle: 'Software components (vendor, product and version) and where they are deployed.',
      actions: `${exportButtons('software')}${canEdit ? button('Add software', { variant: 'primary', icon: 'plus', attrs: 'id="add"' }) : ''}`,
    })}
    ${readOnlyNotice(session)}
    <div class="card">
      <div class="toolbar">
        <input class="input search" type="search" id="q" placeholder="Search vendor, product, version, ID…" value="${esc(state.q)}" aria-label="Search software">
        ${selectFilter('flt-cat', 'Type', SOFTWARE_CATEGORIES, state.category)}
        ${selectFilter('flt-vendor', 'Vendor', uniq(store.all('software').map((s) => s.vendor)).sort())}
        ${selectFilter('flt-env', 'Environment', ENVIRONMENTS)}
        ${selectFilter('flt-ver', 'Verification', VERIFICATION_STATUSES, state.verification)}
        ${selectFilter('flt-review', 'Review status', REVIEW_STATUSES)}
        ${selectFilter('flt-exposure', 'CVE exposure', [{ value: 'open', label: 'Has open CVE findings' }, { value: 'stale', label: `Review older than ${staleDays} days` }], state.exposure)}
        <span class="count" id="count"></span>
      </div>
      <div id="table"></div>
    </div>`;

  const filtered = () => {
    const q = state.q.toLowerCase();
    return store.all('software').filter((s) => {
      if (q && ![s.id, s.vendor, s.product, s.version, s.description, s.category].join(' ').toLowerCase().includes(q)) return false;
      if (state.category && s.category !== state.category) return false;
      if (state.vendor && s.vendor !== state.vendor) return false;
      if (state.verification && s.verificationStatus !== state.verification) return false;
      if (state.review && s.reviewStatus !== state.review) return false;
      if (state.env && !environmentsForSoftware(store, s.id).includes(state.env)) return false;
      if (state.exposure === 'open' && !exposure(s.id).length) return false;
      if (state.exposure === 'stale' && !isStale(s, staleDays)) return false;
      return true;
    });
  };

  const table = new TableController(el.querySelector('#table'), {
    getRows: filtered,
    initialSort: { key: 'product', dir: 1 },
    columns: [
      { key: 'id', label: 'ID', render: (s) => `<span class="mono">${esc(s.id)}</span>` },
      { key: 'product', label: 'Product', render: (s) => `<a class="row-link" href="#/software/${esc(s.id)}">${esc(s.product)}</a><div class="small muted">${esc(s.vendor)}</div>` },
      { key: 'version', label: 'Version', render: (s) => (s.version ? `<span class="mono">${esc(s.version)}</span>` : '<span class="pill red">Unknown</span>') },
      { key: 'category', label: 'Type' },
      { key: 'apps', label: 'Apps', className: 'text-right', render: (s) => String(applicationsForSoftware(store, s.id).length), sort: (s) => applicationsForSoftware(store, s.id).length },
      { key: 'envs', label: 'Environments', render: (s) => envTags(environmentsForSoftware(store, s.id)), sort: (s) => environmentsForSoftware(store, s.id).join() },
      { key: 'verificationStatus', label: 'Verification', render: (s) => verificationPill(s.verificationStatus) },
      { key: 'lastReviewed', label: 'Last reviewed', render: (s) => `${fmtDate(s.lastReviewed)}${isStale(s, staleDays) ? ' <span class="pill orange" title="Older than review threshold">Stale</span>' : ''}` },
      { key: 'cves', label: 'Open CVEs', className: 'text-right', render: (s) => { const n = exposure(s.id).length; return n ? `<span class="pill orange">${n}</span>` : '0'; }, sort: (s) => exposure(s.id).length },
      { key: 'reviewStatus', label: 'Review', render: (s) => reviewPill(s.reviewStatus) },
      {
        key: 'actions', label: 'Actions', className: 'actions', sortable: false,
        render: (s) => (canEdit ? `<button class="icon-btn" data-edit="${esc(s.id)}" aria-label="Edit ${esc(s.product)}" title="Edit">${icons.edit}</button>` : '')
          + (session.can('delete') ? `<button class="icon-btn" data-delete="${esc(s.id)}" aria-label="Delete ${esc(s.product)}" title="Delete">${icons.trash}</button>` : ''),
      },
    ],
    expand: (s) => {
      const deps = deploymentsForSoftware(store, s.id);
      const f = findingsForSoftware(results, s.id);
      return `<div class="detail-panel">
        <div><h4>Deployments (${deps.length})</h4>${deps.length ? `<ul class="mini-list">${deps.map((d) => `<li><a href="#/applications/${esc(d.applicationId)}">${esc(d.application ? d.application.name : d.applicationId)}</a> ${envTag(d.environment)}<br><span class="small muted">${esc(d.infrastructure ? d.infrastructure.name : 'no infrastructure')} · ${esc(d.location || '')}</span></li>`).join('')}</ul>` : '<span class="small muted">Not linked to any application.</span>'}</div>
        <div><h4>CVE findings (${f.length})</h4>${f.length ? `<ul class="mini-list">${f.map((x) => `<li><a href="#/assessments/${esc(x.cve.id)}">${esc(x.cve.id)}</a> ${assessmentPill(x.finding.status)}</li>`).join('')}</ul>` : '<span class="small muted">No CVE in the register matches this component.</span>'}</div>
        <div><h4>Description</h4><p class="small">${esc(s.description || '—')}</p></div>
      </div>`;
    },
  });
  const refresh = () => { const rows = table.render(); el.querySelector('#count').textContent = `${rows.length} of ${store.count('software')} components`; };
  refresh();
  el.querySelector('#q').addEventListener('input', debounce((e) => { state.q = e.target.value; refresh(); }, 150));
  [['#flt-cat', 'category'], ['#flt-vendor', 'vendor'], ['#flt-env', 'env'], ['#flt-ver', 'verification'], ['#flt-review', 'review'], ['#flt-exposure', 'exposure']]
    .forEach(([id, k]) => el.querySelector(id).addEventListener('change', (e) => { state[k] = e.target.value; refresh(); }));
  bindExportButtons(el, (format) => downloadDataset('software', store, format, 'Software inventory'));
  const add = el.querySelector('#add');
  if (add) add.addEventListener('click', () => openSoftwareForm(ctx, null, refresh));
  el.querySelector('#table').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    if (ed) openSoftwareForm(ctx, store.get('software', ed.dataset.edit), refresh);
    if (del) { const s = store.get('software', del.dataset.delete); if (await confirmAndDelete(store, 'software', s.id, `${s.product} ${s.version}`)) refresh(); }
  });
}

function renderDetail(el, ctx) {
  const { store, session, params, router } = ctx;
  const sw = store.get('software', params.id);
  if (!sw) {
    el.innerHTML = `<div class="card">${emptyState(`Software ${params.id} was not found.`)}<p class="text-right"><a class="btn" href="#/software">Back</a></p></div>`;
    return;
  }
  ctx.setTitle(`Software / ${sw.product} ${sw.version}`);
  const canEdit = session.canContribute();
  const deps = deploymentsForSoftware(store, sw.id);
  const findings = findingsForSoftware(cachedAssessAll(store), sw.id);
  const otherVersions = store.find('software', (s) => s.id !== sw.id && s.vendor === sw.vendor && s.product === sw.product);
  el.innerHTML = `
    ${pageHeader({
      title: `${sw.vendor} ${sw.product} ${sw.version || ''}`,
      subtitle: sw.description,
      crumbs: `<a href="#/software">Software Inventory</a> / ${esc(sw.id)}`,
      actions: `${canEdit ? button('Edit', { icon: 'edit', attrs: 'id="edit"' }) : ''}${session.can('delete') ? button('Delete', { variant: 'danger', icon: 'trash', attrs: 'id="delete"' }) : ''}`,
    })}
    <div class="grid grid-3">
      <div class="card span-2">
        <div class="card-header"><h3>Component details</h3></div>
        <dl class="kv">
          <dt>Software ID</dt><dd class="mono">${esc(sw.id)}</dd>
          <dt>Manufacturer / vendor</dt><dd>${esc(sw.vendor)}</dd>
          <dt>Product</dt><dd>${esc(sw.product)}</dd>
          <dt>Product type</dt><dd>${esc(sw.category)}</dd>
          <dt>Version</dt><dd>${sw.version ? `<span class="mono">${esc(sw.version)}</span>` : '<span class="pill red">Unknown - please record</span>'}</dd>
          <dt>CPE</dt><dd class="mono small">${esc(sw.cpe || '—')}</dd>
          <dt>Verification status</dt><dd>${verificationPill(sw.verificationStatus)}</dd>
          <dt>Last reviewed</dt><dd>${fmtDate(sw.lastReviewed)}</dd>
          <dt>Other versions in use</dt><dd>${otherVersions.length ? otherVersions.map((o) => `<a href="#/software/${esc(o.id)}" class="tag">${esc(o.version || 'unknown')}</a>`).join(' ') : '—'}</dd>
          <dt>Notes</dt><dd>${esc(sw.notes || '—')}</dd>
        </dl>
      </div>
      <div class="card">
        <div class="card-header"><h3>Record governance</h3></div>
        <dl class="kv">
          <dt>Review status</dt><dd>${reviewPill(sw.reviewStatus)}</dd>
          <dt>Submitted by</dt><dd>${esc(sw.submittedBy || '—')}</dd>
          <dt>Submission date</dt><dd>${fmtDate(sw.submittedDate)}</dd>
          <dt>Reviewed by</dt><dd>${esc(sw.reviewedBy || '—')}</dd>
          <dt>Last modified</dt><dd>${fmtDateTime(sw.lastModified)}</dd>
        </dl>
      </div>
    </div>
    <div class="card flush mt-2" id="deps">
      <div class="card-header"><h3>Deployments (${deps.length})</h3><div class="actions">${canEdit ? button('Add deployment', { size: 'sm', icon: 'plus', attrs: 'id="add-dep"' }) : ''}</div></div>
      ${deps.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Application</th><th>Criticality</th><th>Environment</th><th>Infrastructure</th><th>AWS account</th><th>Location</th><th></th></tr></thead><tbody>
        ${deps.map((d) => { const acct = d.infrastructure ? store.get('awsAccounts', d.infrastructure.awsAccountId) : null; return `<tr>
          <td><a class="row-link" href="#/applications/${esc(d.applicationId)}">${esc(d.application ? d.application.name : d.applicationId)}</a></td>
          <td>${d.application ? criticalityPill(d.application.criticality) : ''}</td>
          <td>${envTag(d.environment)}</td>
          <td>${d.infrastructure ? `<a href="#/infrastructure/${esc(d.infrastructure.id)}">${esc(d.infrastructure.name)}</a>` : '<span class="muted">—</span>'}</td>
          <td>${acct ? `${esc(acct.accountName)} <span class="mono small muted">${esc(acct.accountId)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="small">${esc(d.location || '')}</td>
          <td class="actions">${canEdit ? `<button class="icon-btn" data-edit-dep="${esc(d.id)}" aria-label="Edit deployment" title="Edit">${icons.edit}</button><button class="icon-btn" data-del-dep="${esc(d.id)}" aria-label="Remove deployment" title="Remove">${icons.trash}</button>` : ''}</td>
        </tr>`; }).join('')}
      </tbody></table></div>` : emptyState('Not deployed in any recorded application.')}
    </div>
    <div class="card flush mt-2">
      <div class="card-header"><h3>Vulnerability findings (${findings.length})</h3></div>
      ${findings.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>CVE</th><th>Severity</th><th>Assessment</th><th>Match</th><th>Version check</th></tr></thead><tbody>
        ${findings.map(({ cve, finding: f }) => `<tr>
          <td><a class="row-link" href="#/assessments/${esc(cve.id)}">${esc(cve.id)}</a><div class="small muted">${esc(cve.title)}</div></td>
          <td>${severityPill(cve.severity)}</td>
          <td>${assessmentPill(f.status)}${f.reviewed ? ' <span class="tag grey">analyst</span>' : ''}</td>
          <td>${esc(f.match.type)} (${esc(f.match.strength)})</td>
          <td class="small">${esc(f.version.detail)}</td>
        </tr>`).join('')}
      </tbody></table></div>` : emptyState('No CVE in the register matches this component.')}
    </div>`;
  const rerender = () => renderDetail(el, ctx);
  const edit = el.querySelector('#edit');
  if (edit) edit.addEventListener('click', () => openSoftwareForm(ctx, sw, rerender));
  const del = el.querySelector('#delete');
  if (del) del.addEventListener('click', async () => { if (await confirmAndDelete(store, 'software', sw.id, `${sw.product} ${sw.version}`)) router.go('/software'); });
  const addDep = el.querySelector('#add-dep');
  if (addDep) addDep.addEventListener('click', () => openDeploymentForm({ store, deployment: { softwareId: sw.id }, onSaved: rerender }));
  el.querySelector('#deps').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit-dep]');
    const dd = e.target.closest('[data-del-dep]');
    if (ed) openDeploymentForm({ store, deployment: store.get('deployments', ed.dataset.editDep), title: 'Edit deployment', onSaved: rerender });
    if (dd && await confirmAndDelete(store, 'deployments', dd.dataset.delDep, `deployment ${dd.dataset.delDep}`)) rerender();
  });
}
