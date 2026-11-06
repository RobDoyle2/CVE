import { esc, fmtDateTime, downloadBlob, readFileAsText, todayIso } from '../ui/dom.js';
import { pageHeader, button, emptyState } from '../ui/components.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { ROLES } from '../models/lookups.js';
import { SCHEMAS } from '../models/schemas.js';
import { isHttpsUrl } from '../services/validation.js';

const TABS = [['general', 'General'], ['integrations', 'Integrations & AI'], ['notifications', 'Notification rules'], ['aliases', 'Product aliases'], ['data', 'Data management'], ['users', 'Users & roles'], ['audit', 'Audit log']];

export function render(el, ctx) {
  let tab = TABS.some(([k]) => k === ctx.query.tab) ? ctx.query.tab : 'general';
  el.innerHTML = `
    ${pageHeader({ title: 'Settings', subtitle: 'Application configuration, integrations, data management and audit.' })}
    ${ctx.session.can('admin') ? '' : `<div class="notice mb-2">Settings are read-only for ${esc(ctx.session.user.role)} users. Switch to the Administrator demo user to make changes.</div>`}
    <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab" data-tab="${k}" role="tab">${esc(l)}</button>`).join('')}</div>
    <div id="tab-body"></div>`;
  const show = () => {
    el.querySelectorAll('.tab').forEach((t) => { t.classList.toggle('active', t.dataset.tab === tab); t.setAttribute('aria-selected', String(t.dataset.tab === tab)); });
    const host = document.createElement('div');
    el.querySelector('#tab-body').replaceChildren(host);
    ({ general, integrations, notifications, aliases, data, users, audit })[tab](host, ctx);
  };
  el.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; show(); }));
  show();
}

const dis = (ctx) => (ctx.session.can('admin') ? '' : 'disabled');

function general(el, ctx) {
  const s = ctx.store.getSettings();
  el.innerHTML = `<div class="card" style="max-width:720px">
    <div class="form-grid">
      <div class="form-field full"><label for="org">Organisation name</label><input id="org" class="input" maxlength="120" value="${esc(s.organisationName || '')}" ${dis(ctx)}></div>
      <div class="form-field"><label for="stale">Software review threshold (days)</label><input id="stale" type="number" min="1" max="1825" class="input" value="${esc(s.staleReviewDays || 180)}" ${dis(ctx)}>
        <div class="hint">Records not reviewed within this period are flagged as data-quality issues.</div></div>
    </div>
    <div class="mt-2">${button('Save', { variant: 'primary', attrs: `id="save" ${dis(ctx)}` })}</div></div>`;
  el.querySelector('#save').addEventListener('click', async () => {
    const days = Number(el.querySelector('#stale').value);
    if (!Number.isInteger(days) || days < 1 || days > 1825) { toast('Review threshold must be between 1 and 1825 days.', 'error'); return; }
    await ctx.store.updateSettings({ organisationName: el.querySelector('#org').value.trim(), staleReviewDays: days });
    toast('Settings saved.');
  });
}

function integrations(el, ctx) {
  const s = ctx.store.getSettings();
  el.innerHTML = `
    <div class="notice danger mb-2"><strong>No API keys or credentials are stored in this application.</strong> The browser is not a safe place for secrets. AI and monitoring credentials belong in the backend (e.g. AWS Secrets Manager); this screen only records which backend endpoint to call.</div>
    <div class="card" style="max-width:820px">
      <div class="card-header"><h3>AI assistance</h3></div>
      <div class="form-grid">
        <div class="form-field"><label for="ai-mode">AI provider mode</label>
          <select id="ai-mode" class="select" ${dis(ctx)}>
            ${[['disabled', 'Disabled'], ['simulated', 'Simulated (demonstration - no AI model)'], ['backend', 'Enterprise backend (approved provider)']].map(([v, l]) => `<option value="${v}" ${s.aiProvider === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select></div>
        <div class="form-field"><label for="ai-endpoint">AI backend endpoint</label>
          <input id="ai-endpoint" class="input" placeholder="/api/ai or https://api.example.com/ai" value="${esc(s.aiBackendEndpoint || '')}" ${dis(ctx)}>
          <div class="hint">Must be same-origin or https, and added to the page's Content-Security-Policy <code>connect-src</code>.</div></div>
        <div class="form-field full"><label for="mon-endpoint">Monitoring backend endpoint (future)</label>
          <input id="mon-endpoint" class="input" placeholder="https://api.example.com/monitoring" value="${esc(s.monitoringBackendEndpoint || '')}" ${dis(ctx)}></div>
      </div>
      <div class="mt-2">${button('Save', { variant: 'primary', attrs: `id="save" ${dis(ctx)}` })}</div>
      <h3 class="mt-3">Approved provider examples</h3>
      <ul class="small"><li>Microsoft Azure OpenAI Service (enterprise tenant, data not used for training)</li><li>Amazon Bedrock (within the organisation's AWS account)</li><li>Other enterprise-approved provider behind the same backend contract: <code>POST {endpoint}/{task}</code> → <code>{ "output": string, "model": string }</code></li></ul>
    </div>`;
  el.querySelector('#save').addEventListener('click', async () => {
    const mode = el.querySelector('#ai-mode').value;
    const ep = el.querySelector('#ai-endpoint').value.trim();
    const mon = el.querySelector('#mon-endpoint').value.trim();
    const okEp = (v) => !v || v.startsWith('/') || isHttpsUrl(v);
    if (!okEp(ep) || !okEp(mon)) { toast('Endpoints must be a same-origin path (/api/...) or an https:// URL.', 'error'); return; }
    if (/[?&](key|token|api[-_]?key|secret)=/i.test(ep + mon)) { toast('Endpoints must not contain keys or tokens.', 'error'); return; }
    if (mode === 'backend' && !ep) { toast('Enter the backend endpoint to use backend mode.', 'error'); return; }
    await ctx.store.updateSettings({ aiProvider: mode, aiBackendEndpoint: ep, monitoringBackendEndpoint: mon });
    toast('Integration settings saved.');
  });
}

function notifications(el, ctx) {
  const s = ctx.store.getSettings();
  const pri = s.notifyOnPriorities || [];
  el.innerHTML = `<div class="card" style="max-width:720px">
    <div class="form-grid">
      <div class="form-field full"><label>Notify when an assessment reaches priority</label>
        <div class="flex">${['P1', 'P2', 'P3', 'P4'].map((p) => `<label class="toggle"><input type="checkbox" name="pri" value="${p}" ${pri.includes(p) ? 'checked' : ''} ${dis(ctx)}> ${p}</label>`).join('')}</div></div>
      <div class="form-field full"><label class="toggle"><input type="checkbox" id="kev" ${s.notifyOnKnownExploited ? 'checked' : ''} ${dis(ctx)}> Notify when a known-exploited (KEV) CVE matches the inventory</label></div>
      <div class="form-field full"><label for="rcpt">Default recipients</label><input id="rcpt" class="input" value="${esc(s.notificationRecipients || '')}" ${dis(ctx)}>
        <div class="hint">Separate multiple addresses with ";". Application technical owners are added automatically.</div></div>
    </div>
    <div class="mt-2">${button('Save', { variant: 'primary', attrs: `id="save" ${dis(ctx)}` })}</div></div>`;
  el.querySelector('#save').addEventListener('click', async () => {
    const rcpt = el.querySelector('#rcpt').value.trim();
    const bad = rcpt.split(/[;,]/).map((x) => x.trim()).filter(Boolean).filter((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    if (bad.length) { toast(`Invalid email address: ${bad[0]}`, 'error'); return; }
    await ctx.store.updateSettings({
      notifyOnPriorities: Array.from(el.querySelectorAll('input[name="pri"]:checked')).map((i) => i.value),
      notifyOnKnownExploited: el.querySelector('#kev').checked,
      notificationRecipients: rcpt,
    });
    toast('Notification rules saved.');
  });
}

function aliases(el, ctx) {
  const s = ctx.store.getSettings();
  const rows = s.productAliases || [];
  el.innerHTML = `<div class="card" style="max-width:820px">
    <p class="small">Aliases make the assessment engine treat different spellings as the same vendor or product (e.g. "Apache Software Foundation" = "Apache"). Matching is case- and punctuation-insensitive.</p>
    <div class="table-wrap"><table class="data"><thead><tr><th>Applies to</th><th>Name as written</th><th>Canonical name</th><th></th></tr></thead><tbody>
      ${rows.map((a, i) => `<tr><td>${a.vendor ? 'Vendor' : 'Product'}</td><td>${esc(a.vendor || a.product)}</td><td class="mono">${esc(a.alias)}</td><td class="actions">${ctx.session.can('admin') ? `<button class="btn btn-sm btn-danger" data-del="${i}">Remove</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    ${ctx.session.can('admin') ? `<div class="flex flex-wrap mt-2">
      <select id="a-kind" class="select"><option value="vendor">Vendor</option><option value="product">Product</option></select>
      <input id="a-name" class="input" style="max-width:240px" placeholder="Name as written" maxlength="120">
      <input id="a-alias" class="input" style="max-width:200px" placeholder="Canonical name" maxlength="120">
      ${button('Add alias', { variant: 'primary', attrs: 'id="add"' })}</div>` : ''}
  </div>`;
  const save = async (next) => { await ctx.store.updateSettings({ productAliases: next }); aliases(el, ctx); toast('Aliases saved - assessments recalculated.'); };
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => save(rows.filter((_, i) => i !== Number(b.dataset.del)))));
  const add = el.querySelector('#add');
  if (add) add.addEventListener('click', () => {
    const name = el.querySelector('#a-name').value.trim();
    const alias = el.querySelector('#a-alias').value.trim();
    if (!name || !alias) { toast('Enter both names.', 'error'); return; }
    save([...rows, { [el.querySelector('#a-kind').value]: name, alias }]);
  });
}

function data(el, ctx) {
  const { store, config } = ctx;
  const counts = Object.keys(SCHEMAS).filter((c) => !['settings'].includes(c)).map((c) => [SCHEMAS[c].plural, store.count(c)]);
  el.innerHTML = `
    <div class="notice warn mb-2"><strong>Where is the data?</strong> In this GitHub Pages build all data is held in <em>this browser's</em> local storage (${esc(store.provider.describe())}). It is not shared with colleagues and is lost if browser data is cleared. Use JSON backups to move data between browsers. A shared database replaces this when the application moves to AWS.</div>
    <div class="grid grid-2">
      <div class="card">
        <div class="card-header"><h3>Backup and restore</h3></div>
        <p class="small">A backup is a complete JSON snapshot (schema version ${esc(config.schemaVersion)}) of every collection, including the audit log. The same structure is the basis for migrating into the future database.</p>
        <div class="flex flex-wrap">${button('⬇ Download JSON backup', { variant: 'primary', attrs: 'id="backup"' })}
          <label class="btn ${ctx.session.can('admin') ? '' : 'hidden'}" for="restore-file">⬆ Restore from backup</label>
          <input type="file" id="restore-file" accept=".json,application/json" class="sr-only" ${dis(ctx)}></div>
        <hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
        <h3>Reset</h3>
        <p class="small">Replace all data with the original fictional sample dataset.</p>
        ${button('Reset to sample data', { variant: 'danger', attrs: `id="reset" ${dis(ctx)}` })}
      </div>
      <div class="card">
        <div class="card-header"><h3>Record counts</h3></div>
        <dl class="kv">${counts.map(([l, n]) => `<dt>${esc(l)}</dt><dd>${n}</dd>`).join('')}</dl>
      </div>
    </div>`;
  el.querySelector('#backup').addEventListener('click', () => {
    downloadBlob(JSON.stringify(store.exportSnapshot(), null, 2), `vmt-backup-${todayIso()}.json`, 'application/json');
    toast('Backup downloaded.');
  });
  el.querySelector('#restore-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Backup file is larger than 20 MB.');
      const snap = JSON.parse(await readFileAsText(file));
      const ok = await confirmDialog({ title: 'Restore backup?', message: `<p>This replaces <strong>all</strong> current data in this browser with the contents of <strong>${esc(file.name)}</strong>.</p>`, confirmLabel: 'Restore', danger: true });
      if (!ok) return;
      await store.importSnapshot(snap);
      toast('Backup restored.');
    } catch (err) {
      toast(`Restore failed: ${err.message}`, 'error', 6000);
    } finally {
      e.target.value = '';
    }
  });
  el.querySelector('#reset').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Reset all data?', message: '<p>All changes made in this browser will be lost and the fictional sample data restored. Consider downloading a backup first.</p>', confirmLabel: 'Reset', danger: true });
    if (!ok) return;
    await store.reset();
    toast('Sample data restored.');
  });
}

function users(el, ctx) {
  const perms = ['read', 'submit', 'write', 'delete', 'review', 'import', 'admin'];
  el.innerHTML = `
    <div class="notice warn mb-2"><strong>Demonstration only - not authentication.</strong> Anyone can choose any sample user from the top bar. Production use requires corporate single sign-on (e.g. Microsoft Entra ID via Amazon Cognito) with roles enforced by the backend on every request.</div>
    <div class="grid grid-2">
      <div class="card flush"><div class="card-header"><h3>Sample users</h3></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Role</th><th>Team</th></tr></thead><tbody>
        ${ctx.store.all('users').map((u) => `<tr><td>${esc(u.name)}<div class="small muted">${esc(u.email)}</div></td><td>${esc(u.role)}</td><td>${esc(u.team)}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card flush"><div class="card-header"><h3>Role permissions</h3></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Role</th>${perms.map((p) => `<th>${esc(p)}</th>`).join('')}</tr></thead><tbody>
        ${Object.entries(ROLES).map(([name, r]) => `<tr><td><strong>${esc(name)}</strong></td>${perms.map((p) => `<td>${r.can.includes(p) ? '✔' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div></div>
    </div>`;
}

function audit(el, ctx) {
  const log = [...ctx.store.all('auditLog')].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, 300);
  el.innerHTML = `<div class="card flush">
    <div class="card-header"><h3>Audit log</h3><span class="small muted">latest ${log.length} entries (browser-local; tamper-evident logging requires the backend)</span></div>
    ${log.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Summary</th></tr></thead><tbody>
      ${log.map((a) => `<tr><td class="nowrap small">${fmtDateTime(a.timestamp)}</td><td>${esc(a.user)}</td><td><span class="tag grey">${esc(a.action)}</span></td>
        <td class="small">${esc((SCHEMAS[a.collection] || {}).label || a.collection)} <span class="mono">${esc(a.recordId)}</span></td><td class="small">${esc(a.summary)}</td></tr>`).join('')}
    </tbody></table></div>` : emptyState('No audit entries.')}
  </div>`;
}
