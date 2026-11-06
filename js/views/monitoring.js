import { esc, fmtDateTime, relTime, extLink } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { pageHeader, button, emptyState, boolPill, statCard } from '../ui/components.js';
import { TableController } from '../ui/table.js';
import { openRecordForm } from '../ui/form.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { ADAPTERS, planIngestion, applyIngestion, buildNotifications, saveNotifications } from '../services/ingestion.js';
import { confirmAndDelete } from './shared.js';

export function render(el, ctx) {
  let tab = ['notifications', 'architecture'].includes(ctx.query.tab) ? ctx.query.tab : 'sources';
  el.innerHTML = `
    ${pageHeader({ title: 'Monitoring Sources', subtitle: 'Approved vulnerability intelligence sources, monitoring schedule and notifications.' })}
    <div class="tabs" role="tablist">
      <button class="tab" data-tab="sources" role="tab">Sources</button>
      <button class="tab" data-tab="notifications" role="tab">Notifications</button>
      <button class="tab" data-tab="architecture" role="tab">Monitoring architecture</button>
    </div>
    <div id="tab-body"></div>`;
  const show = () => {
    el.querySelectorAll('.tab').forEach((t) => { t.classList.toggle('active', t.dataset.tab === tab); t.setAttribute('aria-selected', String(t.dataset.tab === tab)); });
    const host = document.createElement('div');
    el.querySelector('#tab-body').replaceChildren(host);
    ({ sources: renderSources, notifications: renderNotifications, architecture: renderArchitecture })[tab](host, ctx);
  };
  el.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { tab = t.dataset.tab; show(); }));
  show();
}

function openSourceForm(ctx, src, onSaved) {
  const { store } = ctx;
  openRecordForm({
    title: src ? `Edit ${src.name}` : 'Add monitoring source',
    collection: 'monitoringSources',
    record: src || { enabled: true, frequency: 'Daily' },
    store,
    intro: 'Only add sources approved by the security team. Credentials for sources that need them (e.g. an NVD API key) are held by the backend in a secrets manager - never enter them here.',
    onSubmit: async (data) => {
      const saved = src ? await store.update('monitoringSources', src.id, data) : await store.create('monitoringSources', { ...data, lastStatus: 'Not yet checked' });
      toast(`${saved.name} saved.`);
      onSaved();
    },
  });
}

function renderSources(el, ctx) {
  const { store, session } = ctx;
  const admin = session.can('admin');
  const sources = store.all('monitoringSources');
  el.innerHTML = `
    <div class="notice mb-2"><strong>Demonstration mode.</strong> This static site makes no live calls to external websites (they would be blocked by browser security and must be made by a backend). Sources with a bundled sample feed can run a <em>simulated check</em> that exercises the full pipeline: parse → de-duplicate → update → re-assess → notify.</div>
    <div class="grid grid-4 mb-2">
      ${statCard({ label: 'Configured sources', value: sources.length })}
      ${statCard({ label: 'Enabled', value: sources.filter((s) => s.enabled).length, color: 'var(--st-green)' })}
      ${statCard({ label: 'With simulated feed', value: sources.filter((s) => s.demoFeed).length, color: 'var(--cyan)' })}
      ${statCard({ label: 'Unread notifications', value: store.all('notifications').filter((n) => !n.read).length, color: 'var(--st-red)' })}
    </div>
    <div class="card">
      <div class="toolbar">${admin ? button('Add source', { variant: 'primary', icon: 'plus', attrs: 'id="add"' }) : '<span class="small muted">Only administrators can change monitoring sources.</span>'}</div>
      <div id="table"></div>
    </div>`;
  const table = new TableController(el.querySelector('#table'), {
    getRows: () => store.all('monitoringSources'),
    initialSort: { key: 'name', dir: 1 },
    columns: [
      { key: 'name', label: 'Source', render: (s) => `<strong>${esc(s.name)}</strong><div class="small">${extLink(s.url)}</div>` },
      { key: 'type', label: 'Type' },
      { key: 'frequency', label: 'Frequency' },
      { key: 'enabled', label: 'Enabled', render: (s) => boolPill(s.enabled, 'Enabled', 'Disabled'), sort: (s) => (s.enabled ? 0 : 1) },
      { key: 'lastSuccessfulCheck', label: 'Last successful check', render: (s) => (s.lastSuccessfulCheck ? `${esc(relTime(s.lastSuccessfulCheck))}<div class="small muted">${fmtDateTime(s.lastSuccessfulCheck)}</div>` : '<span class="muted">Never</span>') },
      { key: 'lastDetectedUpdate', label: 'Last detected update', render: (s) => (s.lastDetectedUpdate ? fmtDateTime(s.lastDetectedUpdate) : '<span class="muted">—</span>') },
      { key: 'lastStatus', label: 'Last result', render: (s) => `<span class="small">${esc(s.lastStatus || '—')}</span>` },
      {
        key: 'actions', label: 'Actions', className: 'actions', sortable: false,
        render: (s) => `${session.can('write') ? `<button class="btn btn-sm" data-check="${esc(s.id)}" ${s.enabled ? '' : 'disabled'} title="${s.demoFeed ? 'Run simulated check with bundled sample feed' : 'Live checks require the backend'}">${icons.refresh}Check now</button>` : ''}
          ${admin ? `<button class="icon-btn" data-edit="${esc(s.id)}" aria-label="Edit ${esc(s.name)}" title="Edit">${icons.edit}</button><button class="icon-btn" data-delete="${esc(s.id)}" aria-label="Delete ${esc(s.name)}" title="Delete">${icons.trash}</button>` : ''}`,
      },
    ],
  });
  table.render();
  const rerender = () => renderSources(el, ctx);
  const add = el.querySelector('#add');
  if (add) add.addEventListener('click', () => openSourceForm(ctx, null, rerender));
  el.querySelector('#table').addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-delete]');
    const chk = e.target.closest('[data-check]');
    if (ed) openSourceForm(ctx, store.get('monitoringSources', ed.dataset.edit), rerender);
    if (del) { const s = store.get('monitoringSources', del.dataset.delete); if (await confirmAndDelete(store, 'monitoringSources', s.id, s.name)) rerender(); }
    if (chk) runCheck(ctx, store.get('monitoringSources', chk.dataset.check), rerender);
  });
}

async function runCheck(ctx, src, onDone) {
  const { store } = ctx;
  const adapter = ADAPTERS[src.type];
  if (!src.demoFeed || !adapter) {
    openModal({
      title: `Check ${src.name}`,
      size: 'narrow',
      body: `<p>Live monitoring of <strong>${esc(src.url)}</strong> must be performed by the backend service, which is not part of the GitHub Pages build.</p>
        <p class="small muted">Planned: a scheduled AWS Lambda function fetches the source, the matching adapter (${esc(src.type)}) normalises the content, and the result enters the same de-duplication and assessment pipeline demonstrated by the NVD and CISA KEV sample feeds.</p>`,
      actions: [{ label: 'Close', variant: 'primary' }],
    });
    return;
  }
  let incoming;
  try {
    const res = await fetch(src.demoFeed, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    incoming = adapter(await res.json());
  } catch (err) {
    await store.update('monitoringSources', src.id, { lastStatus: `Failed: ${err.message}` }, { validate: false });
    toast(`Check failed: ${err.message}`, 'error');
    onDone();
    return;
  }
  const plan = planIngestion(incoming, store);
  const list = (title, items, render) => (items.length ? `<h4 class="mt-2">${esc(title)} (${items.length})</h4><ul class="mini-list small">${items.map(render).join('')}</ul>` : '');
  openModal({
    title: `Simulated check: ${src.name}`,
    size: 'wide',
    body: `<p>${incoming.length} record(s) read from the sample feed <code>${esc(src.demoFeed)}</code>. Review the planned changes before applying them.</p>
      <div class="flex flex-wrap"><span class="pill green">${plan.creates.length} new</span><span class="pill blue">${plan.updates.length} changed</span><span class="pill outline">${plan.unchanged.length} unchanged (duplicates)</span><span class="pill grey">${plan.deferred.length} deferred</span><span class="pill red">${plan.rejected.length} rejected</span></div>
      ${list('New CVEs', plan.creates, (c) => `<li><strong>${esc(c.id)}</strong> - ${esc(c.vendor)} ${esc(c.product)} (${esc(c.severity)}) ${esc(c.affectedVersions)}</li>`)}
      ${list('Changed CVEs', plan.updates, (u) => `<li><strong>${esc(u.id)}</strong>: ${Object.entries(u.changes).map(([k, c]) => `${esc(k)}: <span class="muted">${esc(String(c.from ?? '').slice(0, 60))}</span> → ${esc(String(c.to).slice(0, 60))}`).join('; ')}</li>`)}
      ${list('Unchanged (already up to date - not duplicated)', plan.unchanged, (id) => `<li>${esc(id)}</li>`)}
      ${list('Deferred', plan.deferred, (d) => `<li>${esc(d.id)} - ${esc(d.reason)}</li>`)}
      ${list('Rejected (failed validation)', plan.rejected, (r) => `<li>${esc(r.id)} - ${esc(r.errors.join(' '))}</li>`)}`,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Apply changes', variant: 'primary', id: 'apply-ingest',
        onClick: async () => {
          const touched = await applyIngestion(plan, store);
          const notes = buildNotifications(store, touched);
          await saveNotifications(store, notes);
          const now = new Date().toISOString();
          await store.update('monitoringSources', src.id, {
            lastSuccessfulCheck: now,
            lastDetectedUpdate: touched.length ? now : src.lastDetectedUpdate,
            lastStatus: `OK (simulated): ${plan.creates.length} new, ${plan.updates.length} updated, ${plan.unchanged.length} unchanged, ${plan.rejected.length} rejected`,
          }, { validate: false });
          toast(`${touched.length} CVE(s) updated and re-assessed; ${notes.length} notification(s) raised.`);
          ctx.refreshChrome();
          onDone();
        },
      },
    ],
  });
}

function renderNotifications(el, ctx) {
  const { store } = ctx;
  const items = [...store.all('notifications')].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const s = store.getSettings();
  el.innerHTML = `
    <div class="notice mb-2">Notification rules: raise when an assessment reaches priority <strong>${esc((s.notifyOnPriorities || []).join(', ') || 'none')}</strong>${s.notifyOnKnownExploited ? ', or when a known-exploited CVE matches the inventory' : ''}. Recipients: ${esc(s.notificationRecipients || 'not set')} plus technical owners. In production, delivery would use email (Amazon SES) or Microsoft Teams via the backend. Rules are configured in Settings.</div>
    <div class="card flush">
      <div class="card-header"><h3>Notifications (${items.length})</h3><div class="actions">${items.some((n) => !n.read) ? button('Mark all as read', { size: 'sm', attrs: 'id="read-all"' }) : ''}</div></div>
      ${items.length ? `<ul class="activity" style="padding:0 20px">${items.map((n) => `
        <li>
          <div class="icon" style="${n.level === 'critical' ? 'background:#ffe8ec;color:var(--st-red)' : ''}">${n.level === 'info' ? icons.bell : icons.alert}</div>
          <div>
            <div><a class="row-link" href="${esc(n.link || '#/assessments')}">${esc(n.title)}</a> ${n.read ? '' : '<span class="pill red">new</span>'}</div>
            <div class="small">${esc(n.message)}</div>
            <div class="small muted">To: ${esc(n.audience || '—')}</div>
          </div>
          <div class="when">${esc(relTime(n.createdAt))}${n.read ? '' : `<br><button class="btn btn-sm mt-1" data-read="${esc(n.id)}">Mark read</button>`}</div>
        </li>`).join('')}</ul>` : emptyState('No notifications.')}
    </div>`;
  const readAll = el.querySelector('#read-all');
  if (readAll) readAll.addEventListener('click', async () => {
    await store.transaction(async () => { for (const n of store.all('notifications').filter((x) => !x.read)) await store.update('notifications', n.id, { read: true }, { validate: false, audit: false }); });
    renderNotifications(el, ctx);
  });
  el.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', async () => {
    await store.update('notifications', b.dataset.read, { read: true }, { validate: false, audit: false });
    renderNotifications(el, ctx);
  }));
}

function renderArchitecture(el) {
  const steps = [
    ['Schedule', 'Amazon EventBridge Scheduler triggers each enabled source at its configured frequency.'],
    ['Fetch', 'AWS Lambda fetches the source using credentials from AWS Secrets Manager, respecting rate limits (NVD) and conditional requests (ETag / lastModStartDate).'],
    ['Normalise', 'Source-specific adapter (NVD, CISA KEV, CSAF vendor advisories, RSS, web page change detection with AI-assisted extraction) produces canonical CVE records.'],
    ['De-duplicate & merge', 'Records keyed by CVE ID; only supplied fields compared; exploitation status only escalates; invalid records quarantined for review.'],
    ['Store', 'Amazon RDS (PostgreSQL) with change history; raw payloads archived to Amazon S3 for audit.'],
    ['Assess', 'Assessment engine re-runs for new or changed CVEs, and when inventory changes.'],
    ['AI assist (optional)', 'Backend calls an approved AI service with minimised data to summarise and interpret - advisory only.'],
    ['Notify', 'Rules raise notifications via Amazon SES email or Microsoft Teams webhook to the vulnerability team and application owners.'],
  ];
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>Future automated monitoring pipeline</h3></div>
      <div class="diagram">${steps.map(([s], i) => `<span class="step">${i + 1}. ${esc(s)}</span>${i < steps.length - 1 ? '<span class="arrow">→</span>' : ''}`).join('')}</div>
      <div class="table-wrap mt-2"><table class="data"><thead><tr><th>Stage</th><th>Design</th><th>In this build</th></tr></thead><tbody>
        ${steps.map(([s, d], i) => `<tr><td><strong>${esc(s)}</strong></td><td class="small">${esc(d)}</td><td class="small">${esc([
          'Manual "Check now"', 'Reads bundled sample files', 'NVD and KEV adapters implemented (js/services/ingestion.js)', 'Implemented and unit-tested',
          'Browser storage', 'Implemented (in browser)', 'Simulated / backend-ready interface (js/services/ai-service.js)', 'In-app notifications only',
        ][i])}</td></tr>`).join('')}
      </tbody></table></div>
      <h3 class="mt-3">Security principles</h3>
      <ul class="small">
        <li>No API keys, tokens or credentials in browser code. All external and AI calls go through the authenticated backend.</li>
        <li>Only administrator-approved sources are monitored; source URLs are validated as https.</li>
        <li>Feed content is untrusted input: validated, size-limited and rendered with HTML escaping.</li>
        <li>AI output is advisory and never changes an assessment status automatically.</li>
        <li>Every change is attributed and written to the audit log.</li>
      </ul>
    </div>`;
}
