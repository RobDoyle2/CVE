import { esc, fmtDateTime, relTime, extLink } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import { pageHeader, button, emptyState, boolPill, statCard } from '../ui/components.js';
import { TableController } from '../ui/table.js';
import { openRecordForm } from '../ui/form.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { ADAPTERS, planIngestion, applyIngestion, buildNotifications, saveNotifications, normaliseNvd } from '../services/ingestion.js';
import { daysToFetch, FEED_FORMAT, NVD_ATTRIBUTION } from '../services/nvd-feed.js';
import { buildAliasMaps, buildSoftwareIndex, matchesInventory, trimToRelevantProducts } from '../services/assessment-engine.js';
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
    <div class="notice mb-2"><strong>How sources are checked.</strong> This static site makes no direct calls to external websites. The <strong>NVD</strong> source reads real data from a feed that a scheduled GitHub Actions job fetches from the NVD API and publishes with this site (no API key in the browser). Other sources with a bundled sample feed run a <em>simulated check</em>.<br><span class="small muted">${esc(NVD_ATTRIBUTION)}</span></div>
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
        render: (s) => `${session.can('write') ? `<button class="btn btn-sm" data-check="${esc(s.id)}" ${s.enabled ? '' : 'disabled'} title="${s.type === 'NVD API' && s.feedUrl ? 'Import changes from the published NVD feed' : s.demoFeed ? 'Run simulated check with bundled sample feed' : 'Live checks require the backend'}">${icons.refresh}Check now</button>` : ''}
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
  const adapter = ADAPTERS[src.type];
  if (adapter && src.type === 'NVD API' && src.feedUrl) return runNvdFeedCheck(ctx, src, onDone);
  return runDemoCheck(ctx, src, onDone);
}

const listBlock = (title, items, render, max = 100) => (items.length
  ? `<h4 class="mt-2">${esc(title)} (${items.length})</h4><ul class="mini-list small">${items.slice(0, max).map(render).join('')}${items.length > max ? `<li class="muted">…and ${items.length - max} more</li>` : ''}</ul>` : '');

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/**
 * Real NVD data: read the feed published by the scheduled GitHub Actions job
 * (same origin), keep CVEs relevant to the inventory or already in the
 * register, then show the planned changes for confirmation.
 */
async function runNvdFeedCheck(ctx, src, onDone) {
  const { store } = ctx;
  const indexUrl = new URL(src.feedUrl, window.location.href);
  let index;
  try {
    index = await getJson(indexUrl.href);
    if (index.format !== FEED_FORMAT) throw new Error('the file is not an NVD feed index produced by this application');
  } catch (err) {
    openModal({
      title: `Check ${src.name}`,
      body: `<div class="notice warn"><strong>The published NVD feed could not be read</strong> (${esc(err.message)}).</div>
        <p class="mt-2">The feed at <code>${esc(src.feedUrl)}</code> is produced by the scheduled GitHub Actions workflow <code>Publish site with NVD feed</code>, which fetches recent changes from the NVD API and publishes them with the site. When running locally, create it with <code>npm run fetch:nvd</code>.</p>`,
      actions: [
        { label: 'Close' },
        ...(src.demoFeed ? [{ label: 'Use demonstration feed instead', variant: 'primary', onClick: () => { setTimeout(() => runDemoCheck(ctx, src, onDone), 0); } }] : []),
      ],
    });
    return;
  }

  const sel = daysToFetch(index, src.feedCheckpoint);
  const progress = openModal({ title: `Checking ${src.name}`, size: 'narrow', body: `<p id="nvd-progress">Downloading ${sel.days.length} day file(s)…</p>` });
  const byId = new Map();
  let read = 0;
  try {
    for (const [i, d] of sel.days.entries()) {
      const p = progress.el.querySelector('#nvd-progress');
      if (p) p.textContent = `Downloading ${d.date} (${i + 1} of ${sel.days.length}, ${d.count} CVEs)…`;
      const day = await getJson(new URL(d.file, indexUrl).href);
      if (day.format !== FEED_FORMAT) throw new Error(`${d.file} is not a feed file`);
      for (const rec of normaliseNvd(day)) {
        read += 1;
        const prev = byId.get(rec.id);
        if (!prev || String(rec.lastModified) >= String(prev.lastModified)) byId.set(rec.id, rec);
      }
    }
  } catch (err) {
    progress.close();
    await store.update('monitoringSources', src.id, { lastStatus: `Failed: ${err.message}` }, { validate: false });
    toast(`NVD feed check failed: ${err.message}`, 'error', 8000);
    onDone();
    return;
  }
  progress.close();

  // Keep only CVEs that matter to this organisation, so browser storage stays small.
  const aliases = buildAliasMaps(store.getSettings());
  const index2 = buildSoftwareIndex(store.all('software'), aliases);
  const kept = [];
  const stats = { notRelevant: 0, noProductData: 0, withdrawn: 0 };
  for (const rec of byId.values()) {
    if (store.get('vulnerabilities', rec.id)) { kept.push(trimToRelevantProducts(rec, index2, aliases)); continue; }
    if (rec.nvdStatus === 'Rejected') { stats.withdrawn += 1; continue; }
    if (!rec._hasProductData) { stats.noProductData += 1; continue; }
    if (matchesInventory(rec, index2, aliases)) kept.push(trimToRelevantProducts(rec, index2, aliases)); else stats.notRelevant += 1;
  }
  const plan = planIngestion(kept, store);
  let storageNote = '';
  if (store.provider.usage) {
    const now = store.provider.usage(store.snapshot);
    const added = JSON.stringify(plan.creates).length + JSON.stringify(plan.updates).length;
    const after = (now.used + added) / now.limit;
    const pct = (x) => `${Math.round(x * 100)}%`;
    storageNote = after > 0.8
      ? `<div class="notice ${after > 0.95 ? 'danger' : 'warn'} mb-2"><strong>Browser storage ${pct(after)} full after this import.</strong> This demonstration keeps all data in your browser (about 5 million characters). Export a backup and remove CVEs you no longer need; a shared database removes this limit (see README, AWS migration).</div>`
      : `<p class="small muted">Browser storage: about ${pct(now.fraction)} used now, ${pct(after)} after this import.</p>`;
  }
  const generated = index.generatedAt ? `${fmtDateTime(index.generatedAt)} (${relTime(index.generatedAt)})` : 'unknown';
  openModal({
    title: `NVD feed check: ${src.name}`,
    size: 'wide',
    body: `<div class="notice mb-2">Feed generated ${esc(generated)} by the NVD fetch job (scheduled in GitHub Actions)${index.apiKeyUsed ? ' (NVD API key used)' : ''}. Covers CVEs modified from ${esc(String(index.coverageStart || '').slice(0, 10))}; ${esc(index.retentionDays)} days are kept.<br><span class="small muted">${esc(index.attribution || NVD_ATTRIBUTION)}</span></div>
      ${sel.gap ? `<div class="notice warn mb-2"><strong>Coverage gap:</strong> the last import was before the oldest day still in the feed. Changes made at NVD between ${esc(sel.gapFrom)} and ${esc(sel.gapTo)} are not included. Increase the feed's retention days (workflow setting <code>NVD_RETENTION_DAYS</code>) or check more often.</div>` : ''}
      ${sel.firstImport ? '<div class="notice mb-2">First import from this feed: all retained days are read.</div>' : ''}
      ${storageNote}
      <p>${read} CVE change(s) read from ${sel.days.length} day file(s) (${byId.size} distinct CVEs). Only CVEs that affect a product in your software inventory, or are already in the register, are imported.</p>
      <div class="flex flex-wrap"><span class="pill green">${plan.creates.length} new</span><span class="pill blue">${plan.updates.length} changed</span><span class="pill outline">${plan.unchanged.length} unchanged</span><span class="pill red">${plan.rejected.length} failed validation</span></div>
      <div class="flex flex-wrap mt-1 small muted"><span>${stats.notRelevant} not relevant to inventory</span>·<span>${stats.noProductData} without product data yet (awaiting NVD/CNA)</span>·<span>${stats.withdrawn} withdrawn by NVD</span></div>
      ${listBlock('New CVEs', plan.creates, (c) => `<li><strong>${esc(c.id)}</strong> - ${esc(c.vendor)} ${esc(c.product)} (${esc(c.severity)}${c.cvssScore !== undefined ? ` ${esc(c.cvssScore)}` : ''})${(c.affectedProductsTotal || (c.affectedProducts || []).length) > 1 ? ` <span class="muted">+${(c.affectedProductsTotal || c.affectedProducts.length) - 1} more products</span>` : ''}</li>`)}
      ${listBlock('Changed CVEs', plan.updates, (u) => `<li><strong>${esc(u.id)}</strong>: ${Object.keys(u.changes).map(esc).join(', ')}</li>`)}
      ${listBlock('Failed validation (not imported)', plan.rejected, (r) => `<li>${esc(r.id)} - ${esc(r.errors.join(' '))}</li>`)}`,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Apply changes', variant: 'primary', id: 'apply-ingest',
        onClick: async () => {
          let touched;
          try {
            touched = await applyIngestion(plan, store);
          } catch (err) {
            toast(`Import failed - no changes were saved. ${err.message}`, 'error', 10000);
            return false;
          }
          const notes = buildNotifications(store, touched);
          await saveNotifications(store, notes);
          const now = new Date().toISOString();
          await store.update('monitoringSources', src.id, {
            lastSuccessfulCheck: now,
            feedCheckpoint: index.coverageEnd || index.generatedAt,
            lastDetectedUpdate: touched.length ? now : src.lastDetectedUpdate,
            lastStatus: `OK (NVD feed ${String(index.generatedAt || '').slice(0, 16).replace('T', ' ')}Z): ${plan.creates.length} new, ${plan.updates.length} updated, ${plan.unchanged.length} unchanged`,
          }, { validate: false });
          toast(`${touched.length} CVE(s) imported or updated and re-assessed; ${notes.length} notification(s) raised.`);
          ctx.refreshChrome();
          onDone();
        },
      },
    ],
  });
}

async function runDemoCheck(ctx, src, onDone) {
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
            <div><a class="row-link" href="${esc(/^#\/[\w\-/?=&.]*$/.test(n.link || '') ? n.link : '#/assessments')}">${esc(n.title)}</a> ${n.read ? '' : '<span class="pill red">new</span>'}</div>
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
          'NVD: GitHub Actions every 6 hours; import with "Check now"', 'NVD: real data via scripts/fetch-nvd.mjs (GitHub Actions); others: bundled samples', 'NVD 2.0 (NVD CPE + CNA data) and KEV adapters (js/services/ingestion.js, nvd-feed.js)', 'Implemented and unit-tested',
          'Browser storage (about 2,000 CVEs)', 'Implemented (in browser)', 'Simulated / backend-ready interface (js/services/ai-service.js)', 'In-app notifications only',
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
