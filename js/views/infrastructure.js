import { esc, debounce } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { pageHeader, envTag, envTags, selectFilter, button, emptyState, criticalityPill } from '../ui/components.js';
import { TableController } from '../ui/table.js';
import { openRecordForm } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { ENVIRONMENTS, HOSTING_PLATFORMS, CLUSTER_TYPES } from '../models/lookups.js';
import {
  applicationsForInfrastructure, infrastructureForAccount, applicationsForAccount, clusterSummary,
} from '../services/relationships.js';
import { confirmAndDelete, readOnlyNotice } from './shared.js';

export function render(el, ctx) {
  if (ctx.params.id) return renderDetail(el, ctx);
  return renderTabs(el, ctx);
}

function openInfraForm(ctx, infra, onSaved) {
  const { store } = ctx;
  openRecordForm({
    title: infra ? `Edit ${infra.name}` : 'Add infrastructure',
    collection: 'infrastructure',
    record: infra || { clusterType: 'None', region: 'eu-west-2' },
    store,
    onSubmit: async (data) => {
      if (data.clusterType === 'None') { data.clusterName = ''; data.namespace = data.namespace || ''; }
      const saved = infra ? await store.update('infrastructure', infra.id, data) : await store.create('infrastructure', data);
      toast(`${saved.name} saved.`);
      if (onSaved) onSaved(saved);
    },
  });
}

function openAccountForm(ctx, acct, onSaved) {
  const { store } = ctx;
  openRecordForm({
    title: acct ? `Edit ${acct.accountName}` : 'Add AWS account',
    collection: 'awsAccounts',
    record: acct || {},
    store,
    intro: 'Use fictional account identifiers until the application is approved for corporate data.',
    onSubmit: async (data) => {
      const saved = acct ? await store.update('awsAccounts', acct.id, data) : await store.create('awsAccounts', data);
      toast(`${saved.accountName} saved.`);
      if (onSaved) onSaved(saved);
    },
  });
}

function renderTabs(el, ctx) {
  const { query } = ctx;
  let tab = ['accounts', 'clusters'].includes(query.tab) ? query.tab : 'infra';
  el.innerHTML = `
    ${pageHeader({ title: 'Infrastructure', subtitle: 'Deployment targets across AWS accounts, Kubernetes and OpenShift clusters, and on-premises platforms.' })}
    ${readOnlyNotice(ctx.session)}
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-tab="infra">Infrastructure targets</button>
      <button class="tab" role="tab" data-tab="accounts">AWS accounts</button>
      <button class="tab" role="tab" data-tab="clusters">Clusters</button>
    </div>
    <div id="tab-body"></div>`;
  const body = el.querySelector('#tab-body');
  const show = () => {
    el.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tab);
      t.setAttribute('aria-selected', String(t.dataset.tab === tab));
    });
    const fresh = document.createElement('div');
    body.replaceChildren(fresh);
    if (tab === 'infra') renderInfraList(fresh, ctx);
    else if (tab === 'accounts') renderAccounts(fresh, ctx);
    else renderClusters(fresh, ctx);
  };
  el.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; show(); }));
  show();
}

function renderInfraList(el, ctx) {
  const { store, session, query } = ctx;
  const state = { q: query.q || '', env: '', platform: '', cluster: '', account: query.account || '' };
  const canWrite = session.can('write');
  el.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <input class="input search" type="search" id="q" placeholder="Search name, cluster, namespace, owner…" value="${esc(state.q)}" aria-label="Search infrastructure">
        ${selectFilter('flt-env', 'Environment', ENVIRONMENTS)}
        ${selectFilter('flt-platform', 'Platform', HOSTING_PLATFORMS)}
        ${selectFilter('flt-cluster', 'Cluster type', CLUSTER_TYPES)}
        ${selectFilter('flt-account', 'AWS account', store.all('awsAccounts').map((a) => ({ value: a.id, label: a.accountName })), state.account)}
        ${canWrite ? button('Add infrastructure', { variant: 'primary', icon: 'plus', attrs: 'id="add"' }) : ''}
        <span class="count" id="count"></span>
      </div>
      <div id="table"></div>
    </div>`;
  const filtered = () => {
    const q = state.q.toLowerCase();
    return store.all('infrastructure').filter((i) => {
      const acct = store.get('awsAccounts', i.awsAccountId);
      if (q && ![i.id, i.name, i.clusterName, i.namespace, i.owner, i.hostingPlatform, acct && acct.accountName, acct && acct.accountId].join(' ').toLowerCase().includes(q)) return false;
      if (state.env && i.environment !== state.env) return false;
      if (state.platform && i.hostingPlatform !== state.platform) return false;
      if (state.cluster && i.clusterType !== state.cluster) return false;
      if (state.account && i.awsAccountId !== state.account) return false;
      return true;
    });
  };
  const table = new TableController(el.querySelector('#table'), {
    getRows: filtered,
    initialSort: { key: 'name', dir: 1 },
    columns: [
      { key: 'name', label: 'Name', render: (i) => `<a class="row-link" href="#/infrastructure/${esc(i.id)}">${esc(i.name)}</a><div class="small muted mono">${esc(i.id)}</div>` },
      { key: 'hostingPlatform', label: 'Platform' },
      { key: 'awsAccountId', label: 'AWS account', render: (i) => { const a = store.get('awsAccounts', i.awsAccountId); return a ? `${esc(a.accountName)}<div class="small muted mono">${esc(a.accountId)}</div>` : '<span class="muted">n/a</span>'; }, sort: (i) => (store.get('awsAccounts', i.awsAccountId) || {}).accountName },
      { key: 'region', label: 'Region' },
      { key: 'environment', label: 'Env', render: (i) => envTag(i.environment) },
      { key: 'clusterName', label: 'Cluster / namespace', render: (i) => (i.clusterType !== 'None' ? `<span class="tag grey">${esc(i.clusterType)}</span> ${esc(i.clusterName)}<div class="small mono">${esc(i.namespace || '')}</div>` : '<span class="muted">—</span>') },
      { key: 'apps', label: 'Apps', className: 'text-right', render: (i) => String(applicationsForInfrastructure(store, i.id).length), sort: (i) => applicationsForInfrastructure(store, i.id).length },
      { key: 'owner', label: 'Owner' },
      {
        key: 'actions', label: 'Actions', className: 'actions', sortable: false,
        render: (i) => (canWrite ? `<button class="icon-btn" data-edit="${esc(i.id)}" aria-label="Edit ${esc(i.name)}" title="Edit">${icons.edit}</button>` : '')
          + (session.can('delete') ? `<button class="icon-btn" data-delete="${esc(i.id)}" aria-label="Delete ${esc(i.name)}" title="Delete">${icons.trash}</button>` : ''),
      },
    ],
    expand: (i) => {
      const apps = applicationsForInfrastructure(store, i.id);
      const deps = store.find('deployments', (d) => d.infrastructureId === i.id);
      return `<div class="detail-panel">
        <div><h4>Applications (${apps.length})</h4>${apps.length ? `<ul class="mini-list">${apps.map((a) => `<li><a href="#/applications/${esc(a.id)}">${esc(a.name)}</a> ${criticalityPill(a.criticality)}</li>`).join('')}</ul>` : '<span class="small muted">None linked.</span>'}</div>
        <div><h4>Software deployed (${deps.length})</h4>${deps.length ? `<ul class="mini-list">${deps.map((d) => { const s = store.get('software', d.softwareId); return `<li><a href="#/software/${esc(d.softwareId)}">${esc(s ? `${s.product} ${s.version || '(unknown)'}` : d.softwareId)}</a></li>`; }).join('')}</ul>` : '<span class="small muted">None recorded.</span>'}</div>
        <div><h4>Notes</h4><p class="small">${esc(i.notes || '—')}</p></div>
      </div>`;
    },
  });
  const refresh = () => { const rows = table.render(); el.querySelector('#count').textContent = `${rows.length} of ${store.count('infrastructure')}`; };
  refresh();
  el.querySelector('#q').addEventListener('input', debounce((e) => { state.q = e.target.value; refresh(); }, 150));
  [['#flt-env', 'env'], ['#flt-platform', 'platform'], ['#flt-cluster', 'cluster'], ['#flt-account', 'account']].forEach(([id, k]) => el.querySelector(id).addEventListener('change', (e) => { state[k] = e.target.value; refresh(); }));
  const add = el.querySelector('#add');
  if (add) add.addEventListener('click', () => openInfraForm(ctx, null, refresh));
  el.querySelector('#table').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    if (ed) openInfraForm(ctx, store.get('infrastructure', ed.dataset.edit), refresh);
    if (del) { const i = store.get('infrastructure', del.dataset.delete); if (await confirmAndDelete(store, 'infrastructure', i.id, i.name)) refresh(); }
  });
}

function renderAccounts(el, ctx) {
  const { store, session, query } = ctx;
  const state = { q: query.q || '', env: '' };
  const canWrite = session.can('write');
  el.innerHTML = `
    <div class="notice mb-2">The estate contains approximately 90 AWS accounts; this demonstration lists a fictional subset. Accounts can be bulk-loaded via CSV import.</div>
    <div class="card">
      <div class="toolbar">
        <input class="input search" type="search" id="q" placeholder="Search account name, ID, owner…" value="${esc(state.q)}" aria-label="Search AWS accounts">
        ${selectFilter('flt-env', 'Environment', ENVIRONMENTS)}
        ${canWrite ? button('Add AWS account', { variant: 'primary', icon: 'plus', attrs: 'id="add"' }) : ''}
        <span class="count" id="count"></span>
      </div>
      <div id="table"></div>
    </div>`;
  const filtered = () => store.all('awsAccounts').filter((a) => {
    const q = state.q.toLowerCase();
    if (q && ![a.accountName, a.accountId, a.owner, a.organisationalUnit].join(' ').toLowerCase().includes(q)) return false;
    if (state.env && a.environment !== state.env) return false;
    return true;
  });
  const table = new TableController(el.querySelector('#table'), {
    getRows: filtered,
    initialSort: { key: 'accountName', dir: 1 },
    columns: [
      { key: 'accountName', label: 'Account name', render: (a) => `<strong>${esc(a.accountName)}</strong>` },
      { key: 'accountId', label: 'Account ID', render: (a) => `<span class="mono">${esc(a.accountId)}</span>` },
      { key: 'environment', label: 'Env', render: (a) => envTag(a.environment) },
      { key: 'organisationalUnit', label: 'OU' },
      { key: 'owner', label: 'Owner' },
      { key: 'infra', label: 'Infra', className: 'text-right', render: (a) => String(infrastructureForAccount(store, a.id).length), sort: (a) => infrastructureForAccount(store, a.id).length },
      { key: 'apps', label: 'Apps', className: 'text-right', render: (a) => String(applicationsForAccount(store, a.id).length), sort: (a) => applicationsForAccount(store, a.id).length },
      {
        key: 'actions', label: 'Actions', className: 'actions', sortable: false,
        render: (a) => (canWrite ? `<button class="icon-btn" data-edit="${esc(a.id)}" aria-label="Edit ${esc(a.accountName)}" title="Edit">${icons.edit}</button>` : '')
          + (session.can('delete') ? `<button class="icon-btn" data-delete="${esc(a.id)}" aria-label="Delete ${esc(a.accountName)}" title="Delete">${icons.trash}</button>` : ''),
      },
    ],
    expand: (a) => {
      const infra = infrastructureForAccount(store, a.id);
      const apps = applicationsForAccount(store, a.id);
      return `<div class="detail-panel">
        <div><h4>Infrastructure (${infra.length})</h4>${infra.length ? `<ul class="mini-list">${infra.map((i) => `<li><a href="#/infrastructure/${esc(i.id)}">${esc(i.name)}</a> <span class="small muted">${esc(i.region)}</span></li>`).join('')}</ul>` : '<span class="small muted">None recorded.</span>'}</div>
        <div><h4>Applications (${apps.length})</h4>${apps.length ? `<ul class="mini-list">${apps.map((x) => `<li><a href="#/applications/${esc(x.id)}">${esc(x.name)}</a></li>`).join('')}</ul>` : '<span class="small muted">None.</span>'}</div>
      </div>`;
    },
  });
  const refresh = () => { const rows = table.render(); el.querySelector('#count').textContent = `${rows.length} of ${store.count('awsAccounts')}`; };
  refresh();
  el.querySelector('#q').addEventListener('input', debounce((e) => { state.q = e.target.value; refresh(); }, 150));
  el.querySelector('#flt-env').addEventListener('change', (e) => { state.env = e.target.value; refresh(); });
  const add = el.querySelector('#add');
  if (add) add.addEventListener('click', () => openAccountForm(ctx, null, refresh));
  el.querySelector('#table').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    if (ed) openAccountForm(ctx, store.get('awsAccounts', ed.dataset.edit), refresh);
    if (del) { const a = store.get('awsAccounts', del.dataset.delete); if (await confirmAndDelete(store, 'awsAccounts', a.id, a.accountName)) refresh(); }
  });
}

function renderClusters(el, ctx) {
  const { store } = ctx;
  const clusters = clusterSummary(store);
  el.innerHTML = `
    <div class="notice mb-2">Clusters are derived from infrastructure records - add a namespace/project as an infrastructure target to include it here.</div>
    <div class="card"><div id="table"></div></div>`;
  const table = new TableController(el.querySelector('#table'), {
    rowKey: 'name',
    getRows: () => clusters,
    initialSort: { key: 'name', dir: 1 },
    columns: [
      { key: 'name', label: 'Cluster', render: (c) => `<strong>${esc(c.name)}</strong>` },
      { key: 'type', label: 'Type', render: (c) => `<span class="tag grey">${esc(c.type)}</span>` },
      { key: 'platform', label: 'Platform' },
      { key: 'environments', label: 'Environments', render: (c) => envTags(c.environments), sort: (c) => c.environments.join() },
      { key: 'accounts', label: 'AWS account', render: (c) => c.accounts.map((id) => esc((store.get('awsAccounts', id) || {}).accountName || id)).join(', ') || '<span class="muted">n/a</span>', sort: (c) => c.accounts.join() },
      { key: 'namespaces', label: 'Namespaces', className: 'text-right', render: (c) => String(c.namespaces.length), sort: (c) => c.namespaces.length },
      { key: 'apps', label: 'Apps', className: 'text-right', render: (c) => String(c.apps.length), sort: (c) => c.apps.length },
    ],
    expand: (c) => `<div class="detail-panel"><div><h4>Namespaces / projects</h4><ul class="mini-list">${c.namespaces.map((n) => `<li><a href="#/infrastructure/${esc(n.infraId)}" class="mono">${esc(n.namespace)}</a></li>`).join('')}</ul></div>
      <div><h4>Applications</h4><ul class="mini-list">${c.apps.map((id) => { const a = store.get('applications', id); return `<li><a href="#/applications/${esc(id)}">${esc(a ? a.name : id)}</a></li>`; }).join('') || '<li class="muted">None</li>'}</ul></div></div>`,
  });
  table.render();
}

function renderDetail(el, ctx) {
  const { store, session, params, router } = ctx;
  const i = store.get('infrastructure', params.id);
  if (!i) {
    el.innerHTML = `<div class="card">${emptyState(`Infrastructure ${params.id} was not found.`)}<p class="text-right"><a class="btn" href="#/infrastructure">Back</a></p></div>`;
    return;
  }
  ctx.setTitle(`Infrastructure / ${i.name}`);
  const acct = store.get('awsAccounts', i.awsAccountId);
  const apps = applicationsForInfrastructure(store, i.id);
  const deps = store.find('deployments', (d) => d.infrastructureId === i.id);
  el.innerHTML = `
    ${pageHeader({
      title: i.name, crumbs: `<a href="#/infrastructure">Infrastructure</a> / ${esc(i.id)}`,
      actions: `${session.can('write') ? button('Edit', { icon: 'edit', attrs: 'id="edit"' }) : ''}${session.can('delete') ? button('Delete', { variant: 'danger', icon: 'trash', attrs: 'id="delete"' }) : ''}`,
    })}
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><h3>Details</h3></div>
        <dl class="kv">
          <dt>Infrastructure ID</dt><dd class="mono">${esc(i.id)}</dd>
          <dt>Hosting platform</dt><dd>${esc(i.hostingPlatform)}</dd>
          <dt>AWS account</dt><dd>${acct ? `${esc(acct.accountName)} <span class="mono muted">${esc(acct.accountId)}</span>` : 'Not applicable'}</dd>
          <dt>Region</dt><dd>${esc(i.region)}</dd>
          <dt>Environment</dt><dd>${envTag(i.environment)}</dd>
          <dt>Cluster type</dt><dd>${esc(i.clusterType)}</dd>
          <dt>Cluster</dt><dd>${esc(i.clusterName || '—')}</dd>
          <dt>Namespace / project</dt><dd class="mono">${esc(i.namespace || '—')}</dd>
          <dt>Owner</dt><dd>${esc(i.owner)}</dd>
          <dt>Notes</dt><dd>${esc(i.notes || '—')}</dd>
        </dl>
      </div>
      <div class="card">
        <div class="card-header"><h3>Applications (${apps.length})</h3></div>
        ${apps.length ? `<ul class="mini-list">${apps.map((a) => `<li class="flex"><a href="#/applications/${esc(a.id)}">${esc(a.name)}</a><span class="spacer"></span>${criticalityPill(a.criticality)}</li>`).join('')}</ul>` : emptyState('No applications linked.')}
        <div class="card-header mt-2"><h3>Software deployed (${deps.length})</h3></div>
        ${deps.length ? `<ul class="mini-list">${deps.map((d) => { const s = store.get('software', d.softwareId); const a = store.get('applications', d.applicationId); return `<li><a href="#/software/${esc(d.softwareId)}">${esc(s ? `${s.vendor} ${s.product} ${s.version || '(unknown)'}` : d.softwareId)}</a> <span class="small muted">for ${esc(a ? a.name : d.applicationId)}</span></li>`; }).join('')}</ul>` : emptyState('No software recorded.')}
      </div>
    </div>`;
  const edit = el.querySelector('#edit');
  if (edit) edit.addEventListener('click', () => openInfraForm(ctx, i, () => renderDetail(el, ctx)));
  const del = el.querySelector('#delete');
  if (del) del.addEventListener('click', async () => { if (await confirmAndDelete(store, 'infrastructure', i.id, i.name)) router.go('/infrastructure'); });
}
