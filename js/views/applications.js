import { esc, debounce, fmtDate, fmtDateTime } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import {
  pageHeader, criticalityPill, envTags, envTag, boolPill, reviewPill, selectFilter, button, emptyState, verificationPill,
} from '../ui/components.js';
import { TableController } from '../ui/table.js';
import { openRecordForm } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { CRITICALITY, ENVIRONMENTS, BUSINESS_FUNCTIONS, REVIEW_STATUSES } from '../models/lookups.js';
import {
  infrastructureForApp, awsAccountsForApp, deploymentsForApp, softwareForApp, syncAppInfrastructure,
} from '../services/relationships.js';
import { onCreate, onEdit } from '../services/workflow.js';
import { confirmAndDelete, openDeploymentForm, readOnlyNotice } from './shared.js';

export function render(el, ctx) {
  if (ctx.params.id) return renderDetail(el, ctx);
  return renderList(el, ctx);
}

// ---------------------------------------------------------------- forms
function infraPicker(store, selected) {
  const rows = store.all('infrastructure');
  return {
    html: `<div class="form-field full" data-field="infrastructureIds">
        <label>Associated infrastructure</label>
        <div class="check-list">${rows.map((i) => {
          const acct = store.get('awsAccounts', i.awsAccountId);
          return `<label><input type="checkbox" name="infrastructureIds" value="${esc(i.id)}" ${selected.includes(i.id) ? 'checked' : ''}>
            ${esc(i.name)} <span class="muted small">· ${esc(i.environment)} · ${esc(acct ? acct.accountName : i.hostingPlatform)}</span></label>`;
        }).join('')}</div>
        <div class="hint">AWS accounts are derived from the selected infrastructure. Software is linked via deployments on the application page.</div>
        <div class="error"></div>
      </div>`,
    read: (form) => ({ infrastructureIds: Array.from(form.querySelectorAll('input[name="infrastructureIds"]:checked')).map((i) => i.value) }),
  };
}

export function openAppForm(ctx, app = null, onSaved) {
  const { store, session } = ctx;
  const selected = app ? infrastructureForApp(store, app.id).map((i) => i.id) : [];
  const contributorNote = !session.can('review')
    ? `As a <strong>${esc(session.user.role)}</strong>, your ${app ? 'changes' : 'submission'} will be marked <strong>Pending review</strong> until approved by a security analyst.` : '';
  openRecordForm({
    title: app ? `Edit ${app.name}` : 'Add application',
    collection: 'applications',
    record: app || { environments: [], internetFacing: false },
    store,
    intro: contributorNote,
    extra: infraPicker(store, selected),
    onSubmit: async (data) => {
      const { infrastructureIds, ...fields } = data;
      let saved;
      await store.transaction(async () => {
        saved = app
          ? await store.update('applications', app.id, onEdit(fields, app, session))
          : await store.create('applications', onCreate(fields, session));
        await syncAppInfrastructure(store, saved.id, infrastructureIds);
      });
      toast(`${saved.name} saved${saved.reviewStatus === 'Pending review' ? ' and submitted for review' : ''}.`);
      if (onSaved) onSaved(saved);
    },
  });
}

// ---------------------------------------------------------------- list
function renderList(el, ctx) {
  const { store, session, query } = ctx;
  const state = {
    q: query.q || '', criticality: query.criticality || '', environment: query.environment || '',
    internet: query.internet || '', fn: query.fn || '', review: query.review || '',
  };
  const canEdit = session.canContribute();

  el.innerHTML = `
    ${pageHeader({
      title: 'Applications',
      subtitle: 'Inventory of applications and services, their owners, environments, infrastructure and software.',
      actions: `${canEdit ? button('Add application', { variant: 'primary', icon: 'plus', attrs: 'id="add-app"' }) : ''}`,
    })}
    ${readOnlyNotice(session)}
    <div class="card">
      <div class="toolbar">
        <input class="input search" type="search" id="q" placeholder="Search name, ID, owner or description…" value="${esc(state.q)}" aria-label="Search applications">
        ${selectFilter('f-crit', 'Criticality', CRITICALITY, state.criticality)}
        ${selectFilter('f-env', 'Environment', ENVIRONMENTS, state.environment)}
        ${selectFilter('f-internet', 'Internet-facing', [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], state.internet)}
        ${selectFilter('f-fn', 'Business function', BUSINESS_FUNCTIONS, state.fn)}
        ${selectFilter('f-review', 'Review status', REVIEW_STATUSES, state.review)}
        <span class="count" id="count"></span>
      </div>
      <div id="table"></div>
    </div>`;

  const filtered = () => {
    const q = state.q.toLowerCase();
    return store.all('applications').filter((a) => {
      if (q && ![a.id, a.name, a.description, a.businessOwner, a.technicalOwner, a.businessFunction].join(' ').toLowerCase().includes(q)) return false;
      if (state.criticality && a.criticality !== state.criticality) return false;
      if (state.environment && !(a.environments || []).includes(state.environment)) return false;
      if (state.internet && (state.internet === 'yes') !== !!a.internetFacing) return false;
      if (state.fn && a.businessFunction !== state.fn) return false;
      if (state.review && a.reviewStatus !== state.review) return false;
      return true;
    });
  };

  const critRank = (c) => CRITICALITY.indexOf(c);
  const table = new TableController(el.querySelector('#table'), {
    caption: 'Applications',
    getRows: filtered,
    initialSort: { key: 'criticality', dir: 1 },
    columns: [
      { key: 'id', label: 'ID', render: (a) => `<span class="mono">${esc(a.id)}</span>` },
      { key: 'name', label: 'Application', render: (a) => `<a class="row-link" href="#/applications/${esc(a.id)}">${esc(a.name)}</a><div class="small muted">${esc(a.businessFunction)}</div>` },
      { key: 'criticality', label: 'Criticality', render: (a) => criticalityPill(a.criticality), sort: (a) => critRank(a.criticality) },
      { key: 'environments', label: 'Environments', render: (a) => envTags(a.environments), sort: (a) => (a.environments || []).join(',') },
      { key: 'internetFacing', label: 'Internet', render: (a) => boolPill(a.internetFacing), sort: (a) => (a.internetFacing ? 0 : 1) },
      { key: 'technicalOwner', label: 'Technical owner' },
      { key: 'infra', label: 'Infra', render: (a) => String(infrastructureForApp(store, a.id).length), sort: (a) => infrastructureForApp(store, a.id).length, className: 'text-right' },
      { key: 'sw', label: 'Software', render: (a) => String(softwareForApp(store, a.id).length), sort: (a) => softwareForApp(store, a.id).length, className: 'text-right' },
      { key: 'reviewStatus', label: 'Review', render: (a) => reviewPill(a.reviewStatus) },
      {
        key: 'actions', label: 'Actions', className: 'actions', sortable: false,
        render: (a) => (canEdit ? `<button class="icon-btn" data-edit="${esc(a.id)}" aria-label="Edit ${esc(a.name)}" title="Edit">${icons.edit}</button>` : '')
          + (session.can('delete') ? `<button class="icon-btn" data-delete="${esc(a.id)}" aria-label="Delete ${esc(a.name)}" title="Delete">${icons.trash}</button>` : ''),
      },
    ],
    expand: (a) => expandedPanel(store, a),
  });

  const refresh = () => {
    const rows = table.render();
    el.querySelector('#count').textContent = `${rows.length} of ${store.count('applications')} applications`;
  };
  refresh();

  el.querySelector('#q').addEventListener('input', debounce((e) => { state.q = e.target.value; refresh(); }, 150));
  const bind = (id, key) => el.querySelector(id).addEventListener('change', (e) => { state[key] = e.target.value; refresh(); });
  bind('#f-crit', 'criticality'); bind('#f-env', 'environment'); bind('#f-internet', 'internet'); bind('#f-fn', 'fn'); bind('#f-review', 'review');

  const addBtn = el.querySelector('#add-app');
  if (addBtn) addBtn.addEventListener('click', () => openAppForm(ctx, null, refresh));
  el.querySelector('#table').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    if (edit) openAppForm(ctx, store.get('applications', edit.dataset.edit), refresh);
    if (del) {
      const app = store.get('applications', del.dataset.delete);
      if (await confirmAndDelete(store, 'applications', app.id, app.name)) refresh();
    }
  });
}

function expandedPanel(store, a) {
  const infra = infrastructureForApp(store, a.id);
  const accounts = awsAccountsForApp(store, a.id);
  const deps = deploymentsForApp(store, a.id);
  return `<div class="detail-panel">
    <div>
      <h4>Infrastructure (${infra.length})</h4>
      ${infra.length ? `<ul class="mini-list">${infra.map((i) => `<li><a href="#/infrastructure/${esc(i.id)}">${esc(i.name)}</a><br><span class="small muted">${esc(i.hostingPlatform)}${i.clusterName ? ` · ${esc(i.clusterName)}/${esc(i.namespace)}` : ''}</span> ${envTag(i.environment)}</li>`).join('')}</ul>` : '<span class="muted small">No infrastructure recorded - needs completing.</span>'}
    </div>
    <div>
      <h4>AWS accounts (${accounts.length})</h4>
      ${accounts.length ? `<ul class="mini-list">${accounts.map((ac) => `<li>${esc(ac.accountName)} <span class="mono small muted">${esc(ac.accountId)}</span></li>`).join('')}</ul>` : '<span class="muted small">None (or non-AWS hosting).</span>'}
    </div>
    <div>
      <h4>Software (${deps.length} deployments)</h4>
      ${deps.length ? `<ul class="mini-list">${deps.map((d) => `<li><a href="#/software/${esc(d.softwareId)}">${esc(d.software ? `${d.software.product} ${d.software.version || '(unknown)'}` : d.softwareId)}</a> ${envTag(d.environment)}</li>`).join('')}</ul>` : '<span class="muted small">No software recorded.</span>'}
    </div>
    <div>
      <h4>Ownership</h4>
      <ul class="mini-list"><li>Business: ${esc(a.businessOwner)}</li><li>Technical: ${esc(a.technicalOwner)}</li><li class="small muted">${esc(a.description || '')}</li></ul>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- detail
function renderDetail(el, ctx) {
  const { store, session, params, router } = ctx;
  const app = store.get('applications', params.id);
  if (!app) {
    el.innerHTML = `<div class="card">${emptyState(`Application ${params.id} was not found.`)}<p class="text-right"><a class="btn" href="#/applications">Back to applications</a></p></div>`;
    return;
  }
  ctx.setTitle(`Applications / ${app.name}`);
  const canEdit = session.canContribute();
  const infra = infrastructureForApp(store, app.id);
  const accounts = awsAccountsForApp(store, app.id);
  const deps = deploymentsForApp(store, app.id).sort((x, y) => ENVIRONMENTS.indexOf(x.environment) - ENVIRONMENTS.indexOf(y.environment));

  el.innerHTML = `
    ${pageHeader({
      title: app.name,
      subtitle: app.description,
      crumbs: '<a href="#/applications">Applications</a> / ' + esc(app.id),
      actions: `${canEdit ? button('Edit', { icon: 'edit', attrs: 'id="edit"' }) : ''}${session.can('delete') ? button('Delete', { variant: 'danger', icon: 'trash', attrs: 'id="delete"' }) : ''}`,
    })}
    <div id="related-vulns"></div>
    <div class="grid grid-3">
      <div class="card span-2">
        <div class="card-header"><h3>Application details</h3></div>
        <dl class="kv">
          <dt>Application ID</dt><dd class="mono">${esc(app.id)}</dd>
          <dt>Business criticality</dt><dd>${criticalityPill(app.criticality)}</dd>
          <dt>Environments</dt><dd>${envTags(app.environments)}</dd>
          <dt>Internet-facing</dt><dd>${boolPill(app.internetFacing)}</dd>
          <dt>Business function</dt><dd>${esc(app.businessFunction)}</dd>
          <dt>Business owner</dt><dd>${esc(app.businessOwner)}</dd>
          <dt>Technical owner</dt><dd>${esc(app.technicalOwner)}</dd>
          <dt>Notes</dt><dd>${esc(app.notes || '—')}</dd>
        </dl>
      </div>
      <div class="card">
        <div class="card-header"><h3>Record governance</h3></div>
        <dl class="kv">
          <dt>Review status</dt><dd>${reviewPill(app.reviewStatus)}</dd>
          <dt>Submitted by</dt><dd>${esc(app.submittedBy || '—')}</dd>
          <dt>Submission date</dt><dd>${fmtDate(app.submittedDate)}</dd>
          <dt>Reviewed by</dt><dd>${esc(app.reviewedBy || '—')}</dd>
          <dt>Last modified</dt><dd>${fmtDateTime(app.lastModified)}</dd>
        </dl>
      </div>
    </div>

    <div class="grid grid-2 mt-2">
      <div class="card flush">
        <div class="card-header"><h3>Infrastructure (${infra.length})</h3></div>
        ${infra.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Platform</th><th>Cluster / namespace</th><th>Env</th></tr></thead><tbody>
          ${infra.map((i) => `<tr><td><a class="row-link" href="#/infrastructure/${esc(i.id)}">${esc(i.name)}</a></td><td>${esc(i.hostingPlatform)}</td><td>${i.clusterName ? `${esc(i.clusterName)} / <span class="mono">${esc(i.namespace)}</span>` : '—'}</td><td>${envTag(i.environment)}</td></tr>`).join('')}
        </tbody></table></div>` : emptyState('No infrastructure linked. Edit the application to add it.')}
      </div>
      <div class="card flush">
        <div class="card-header"><h3>AWS accounts (${accounts.length})</h3></div>
        ${accounts.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Account name</th><th>Account ID</th><th>Environment</th><th>Owner</th></tr></thead><tbody>
          ${accounts.map((a) => `<tr><td><a class="row-link" href="#/infrastructure?tab=accounts&q=${encodeURIComponent(a.accountId)}">${esc(a.accountName)}</a></td><td class="mono">${esc(a.accountId)}</td><td>${envTag(a.environment)}</td><td>${esc(a.owner)}</td></tr>`).join('')}
        </tbody></table></div>` : emptyState('No AWS accounts (derived from infrastructure).')}
      </div>
    </div>

    <div class="card flush mt-2" id="deps">
      <div class="card-header"><h3>Software deployments (${deps.length})</h3>
        <div class="actions">${canEdit ? button('Add deployment', { size: 'sm', icon: 'plus', attrs: 'id="add-dep"' }) : ''}</div>
      </div>
      ${deps.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Software</th><th>Version</th><th>Type</th><th>Environment</th><th>Infrastructure</th><th>Location</th><th>Verification</th><th></th></tr></thead><tbody>
        ${deps.map((d) => `<tr>
          <td><a class="row-link" href="#/software/${esc(d.softwareId)}">${esc(d.software ? `${d.software.vendor} ${d.software.product}` : d.softwareId)}</a></td>
          <td class="mono">${esc(d.software && d.software.version ? d.software.version : 'unknown')}</td>
          <td>${esc(d.software ? d.software.category : '')}</td>
          <td>${envTag(d.environment)}</td>
          <td>${d.infrastructure ? `<a href="#/infrastructure/${esc(d.infrastructure.id)}">${esc(d.infrastructure.name)}</a>` : '<span class="muted">—</span>'}</td>
          <td class="small">${esc(d.location || '')}</td>
          <td>${d.software ? verificationPill(d.software.verificationStatus) : ''}</td>
          <td class="actions">${canEdit ? `<button class="icon-btn" data-edit-dep="${esc(d.id)}" aria-label="Edit deployment" title="Edit">${icons.edit}</button><button class="icon-btn" data-del-dep="${esc(d.id)}" aria-label="Remove deployment" title="Remove">${icons.trash}</button>` : ''}</td>
        </tr>`).join('')}
      </tbody></table></div>` : emptyState('No software recorded for this application.')}
    </div>`;

  const rerender = () => renderDetail(el, ctx);
  const editBtn = el.querySelector('#edit');
  if (editBtn) editBtn.addEventListener('click', () => openAppForm(ctx, app, rerender));
  const delBtn = el.querySelector('#delete');
  if (delBtn) delBtn.addEventListener('click', async () => { if (await confirmAndDelete(store, 'applications', app.id, app.name)) router.go('/applications'); });
  const addDep = el.querySelector('#add-dep');
  if (addDep) addDep.addEventListener('click', () => openDeploymentForm({ store, deployment: { applicationId: app.id }, onSaved: rerender }));
  el.querySelector('#deps').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit-dep]');
    const dd = e.target.closest('[data-del-dep]');
    if (ed) openDeploymentForm({ store, deployment: store.get('deployments', ed.dataset.editDep), title: 'Edit deployment', onSaved: rerender });
    if (dd && await confirmAndDelete(store, 'deployments', dd.dataset.delDep, `deployment ${dd.dataset.delDep}`)) rerender();
  });

  // Hook for related vulnerability summary (assessment engine)
  if (ctx.renderRelatedVulns) ctx.renderRelatedVulns(el.querySelector('#related-vulns'), { applicationId: app.id });
}
