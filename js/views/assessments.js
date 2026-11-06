import { esc } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import {
  pageHeader, severityPill, assessmentPill, priorityPill, selectFilter, statCard, barChart, emptyState, envTag,
  criticalityPill, ASSESSMENT_COLORS,
} from '../ui/components.js';
import { TableController } from '../ui/table.js';
import { openRecordForm } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { SEVERITIES } from '../models/lookups.js';
import { cachedAssessAll, STATUS_ORDER, PRIORITY_LABELS, ENGINE_VERSION } from '../services/assessment-engine.js';
import { exportButtons, bindExportButtons, downloadDataset } from './export-helpers.js';

export function render(el, ctx) {
  if (ctx.params.id) return renderDetail(el, ctx);
  return renderOverview(el, ctx);
}

const SAFETY_NOTICE = `<div class="notice warn mb-2"><strong>Decision support, not proof.</strong> Findings are produced by deterministic matching of vendor, product and version data. A match means "investigate", not "vulnerable". Only an analyst can mark a finding <em>Confirmed affected</em>. No probabilities or confidence scores are calculated; evidence, data quality and outstanding verification are shown instead.</div>`;

function renderOverview(el, ctx) {
  const { store, query } = ctx;
  const results = cachedAssessAll(store);
  const state = { status: query.status || '', priority: query.priority || '', severity: '', prodOnly: '' };
  const findings = results.flatMap((r) => r.findings);
  const open = results.filter((r) => ['Confirmed affected', 'Potentially affected', 'Requires investigation', 'Unable to determine'].includes(r.summary.status));
  const appsAffected = new Set(results.flatMap((r) => r.summary.applications.filter((a) => ['Confirmed affected', 'Potentially affected'].includes(a.status)).map((a) => a.id)));
  const prodExposed = results.filter((r) => r.summary.productionApplications.some((a) => ['Confirmed affected', 'Potentially affected'].includes(a.status)));
  const unreviewed = results.reduce((n, r) => n + r.summary.unreviewed, 0);
  const dq = results.reduce((n, r) => n + r.summary.dataQualityIssues, 0);

  const statusRows = STATUS_ORDER.map((s) => ({ label: s, value: findings.filter((f) => f.status === s).length, color: ASSESSMENT_COLORS[s], href: `#/assessments?status=${encodeURIComponent(s)}` }));

  el.innerHTML = `
    ${pageHeader({ title: 'Impact Assessments', subtitle: 'Cross-reference of every CVE in the register against the software inventory, applications and infrastructure.', actions: exportButtons('assessments') })}
    ${SAFETY_NOTICE}
    <div class="grid grid-6">
      ${statCard({ label: 'CVEs needing attention', value: open.length, foot: `of ${results.length} in register`, color: 'var(--st-orange)' })}
      ${statCard({ label: 'Apps potentially affected', value: appsAffected.size, foot: 'confirmed or potential', color: 'var(--st-red)' })}
      ${statCard({ label: 'CVEs exposing production', value: prodExposed.length, foot: 'confirmed or potential', color: 'var(--sev-critical)' })}
      ${statCard({ label: 'P1 / P2 priorities', value: results.filter((r) => ['P1', 'P2'].includes(r.summary.priority)).length, foot: 'rule-based', color: 'var(--navy-700)' })}
      ${statCard({ label: 'Findings awaiting analyst', value: unreviewed, foot: 'no recorded decision', color: 'var(--st-purple)' })}
      ${statCard({ label: 'Data quality warnings', value: dq, foot: 'on open findings', color: 'var(--st-yellow)' })}
    </div>
    <div class="grid grid-3 mt-2">
      <div class="card">
        <div class="card-header"><h3>Findings by assessment status</h3></div>
        ${barChart(statusRows)}
      </div>
      <div class="card span-2">
        <div class="card-header"><h3>How the engine works</h3><span class="small muted">engine v${esc(ENGINE_VERSION)}</span></div>
        <div class="diagram">
          <span class="step">1. Match vendor + product<br><span class="small muted">exact / product-only / partial</span></span><span class="arrow">→</span>
          <span class="step">2. Compare version with affected ranges</span><span class="arrow">→</span>
          <span class="step">3. Trace deployments → apps → infra → AWS</span><span class="arrow">→</span>
          <span class="step">4. Flag data-quality gaps</span><span class="arrow">→</span>
          <span class="step">5. Rule-based priority (P1-P4)</span><span class="arrow">→</span>
          <span class="step">6. Analyst decision</span>
        </div>
        <ul class="mini-list mt-2 small">
          <li><strong>Potentially affected</strong>: vendor and product match and the recorded version is inside an affected range.</li>
          <li><strong>Requires investigation</strong>: vendor differs, product only partially matches, or the CVE has no version data.</li>
          <li><strong>Unable to determine</strong>: product matches but the inventory has no usable version.</li>
          <li><strong>Not affected</strong>: version outside all affected ranges (or an analyst decision).</li>
          <li><strong>Confirmed affected</strong>: set only by an analyst with recorded evidence.</li>
        </ul>
      </div>
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Impact by CVE</h3></div>
      <div class="toolbar">
        ${selectFilter('flt-status', 'Status', [...STATUS_ORDER, 'No inventory match'], state.status)}
        ${selectFilter('flt-priority', 'Priority', Object.keys(PRIORITY_LABELS).map((p) => ({ value: p, label: `${p} - ${PRIORITY_LABELS[p]}` })), state.priority)}
        ${selectFilter('flt-sev', 'Severity', SEVERITIES)}
        ${selectFilter('flt-prod', 'Production', [{ value: 'yes', label: 'Affects production' }])}
        <span class="count" id="count"></span>
      </div>
      <div id="table"></div>
    </div>`;

  const filtered = () => results.filter((r) => {
    if (state.status && r.summary.status !== state.status) return false;
    if (state.priority && r.summary.priority !== state.priority) return false;
    if (state.severity && r.cve.severity !== state.severity) return false;
    if (state.prodOnly && !r.summary.productionApplications.length) return false;
    return true;
  });
  const table = new TableController(el.querySelector('#table'), {
    rowKey: 'key',
    getRows: () => filtered().map((r) => ({ ...r, key: r.cve.id })),
    initialSort: { key: 'priority', dir: 1 },
    columns: [
      { key: 'cve', label: 'CVE', render: (r) => `<a class="row-link mono" href="#/assessments/${esc(r.cve.id)}">${esc(r.cve.id)}</a><div class="small muted">${esc(r.cve.vendor)} ${esc(r.cve.product)}</div>`, sort: (r) => r.cve.id },
      { key: 'severity', label: 'Severity', render: (r) => `${severityPill(r.cve.severity)}${r.cve.exploitationStatus === 'Known exploited (CISA KEV)' ? ' <span class="pill red">KEV</span>' : ''}`, sort: (r) => SEVERITIES.indexOf(r.cve.severity) },
      { key: 'status', label: 'Assessment', render: (r) => assessmentPill(r.summary.status), sort: (r) => (STATUS_ORDER.indexOf(r.summary.status) + 1) || 9 },
      { key: 'priority', label: 'Priority', render: (r) => priorityPill(r.summary.priority, r.summary.priorityLabel), sort: (r) => r.summary.priority || 'P9' },
      { key: 'software', label: 'Software', className: 'text-right', render: (r) => `${r.summary.relevantFindings}/${r.summary.matchedSoftware}`, sort: (r) => r.summary.relevantFindings },
      { key: 'apps', label: 'Applications', render: (r) => (r.summary.applications.length ? r.summary.applications.map((a) => `<a href="#/applications/${esc(a.id)}" class="tag ${a.production ? 'prod' : 'grey'}">${esc(a.name)}</a>`).join('') : '<span class="muted">—</span>'), sort: (r) => r.summary.applications.length },
      { key: 'prod', label: 'Prod', render: (r) => (r.summary.productionApplications.length ? `<span class="pill red">${r.summary.productionApplications.length}</span>` : '0'), sort: (r) => r.summary.productionApplications.length },
      { key: 'aws', label: 'AWS accts', className: 'text-right', render: (r) => String(r.summary.awsAccounts.length), sort: (r) => r.summary.awsAccounts.length },
      { key: 'dq', label: 'Data gaps', className: 'text-right', render: (r) => (r.summary.dataQualityIssues ? `<span class="pill yellow">${r.summary.dataQualityIssues}</span>` : '0'), sort: (r) => r.summary.dataQualityIssues },
    ],
    expand: (r) => (r.findings.length ? `<div class="detail-panel">${r.findings.map((f) => `<div>
        <h4>${esc(f.software.product)} ${esc(f.software.version || '(unknown)')} · ${esc(f.softwareId)}</h4>
        ${assessmentPill(f.status)} ${priorityPill(f.priority.level)}
        <div class="small mt-1">${esc(f.version.detail)}</div>
        <div class="small muted">${f.impact.applications.map((a) => esc(a.name)).join(', ') || 'No applications recorded'}</div>
      </div>`).join('')}</div>` : '<div class="detail-panel"><div class="small muted">No software in the inventory matches this CVE\'s vendor/product. This reflects the inventory as recorded; incomplete inventory may hide exposure.</div></div>'),
  });
  bindExportButtons(el, (format) => downloadDataset('assessments', store, format, 'Vulnerability assessments'));
  const refresh = () => { const rows = table.render(); el.querySelector('#count').textContent = `${rows.length} of ${results.length} CVEs`; };
  refresh();
  [['#flt-status', 'status'], ['#flt-priority', 'priority'], ['#flt-sev', 'severity'], ['#flt-prod', 'prodOnly']]
    .forEach(([id, k]) => el.querySelector(id).addEventListener('change', (e) => { state[k] = e.target.value; refresh(); }));
}

const EVIDENCE_LABEL = {
  match: (s) => `<span class="pill ${s === 'strong' ? 'blue' : s === 'moderate' ? 'purple' : 'grey'}">${esc(s)} match</span>`,
  supports: () => '<span class="pill orange">supports</span>',
  against: () => '<span class="pill green">against</span>',
  gap: () => '<span class="pill yellow">gap</span>',
  info: () => '<span class="pill outline">info</span>',
  review: () => '<span class="pill teal">analyst</span>',
};

function findingCard(f, cve, canReview) {
  const impactRows = f.impact.applications.flatMap((a) => a.deployments.map((d) => `<tr>
      <td><a href="#/applications/${esc(a.id)}">${esc(a.name)}</a> ${criticalityPill(a.criticality)}${a.internetFacing ? ' <span class="tag">internet</span>' : ''}</td>
      <td>${envTag(d.environment)}</td>
      <td>${d.infrastructure ? `<a href="#/infrastructure/${esc(d.infrastructure.id)}">${esc(d.infrastructure.name)}</a>${d.infrastructure.clusterName ? `<div class="small muted">${esc(d.infrastructure.clusterName)}/${esc(d.infrastructure.namespace)}</div>` : ''}` : '<span class="muted">not recorded</span>'}</td>
      <td>${d.awsAccount ? `${esc(d.awsAccount.accountName)}<div class="small mono muted">${esc(d.awsAccount.accountId)}</div>` : '<span class="muted">—</span>'}</td>
      <td class="small">${esc(d.location || '')}</td>
    </tr>`)).join('');
  return `<div class="card mt-2" data-finding="${esc(f.softwareId)}">
    <div class="card-header">
      <h3><a href="#/software/${esc(f.softwareId)}">${esc(f.software.vendor)} ${esc(f.software.product)} ${esc(f.software.version || '(version unknown)')}</a></h3>
      ${assessmentPill(f.status)}
      ${f.reviewed ? `<span class="small muted">engine: ${esc(f.computedStatus)}</span>` : '<span class="tag grey">engine result - not yet reviewed</span>'}
      ${f.reviewStale ? '<span class="pill orange">re-review</span>' : ''}
      <div class="actions">${priorityPill(f.priority.level, f.priority.label)}${canReview ? `<button class="btn btn-sm" data-review="${esc(f.softwareId)}">${icons.check}Record decision</button>` : ''}</div>
    </div>
    <div class="grid grid-2">
      <div>
        <h4 class="small muted">EVIDENCE</h4>
        <ul class="evidence-list">${f.evidence.map((e) => `<li><span class="marker">${EVIDENCE_LABEL[e.kind](e.strength)}</span><span>${esc(e.text)}</span></li>`).join('')}</ul>
        ${f.priority.level ? `<h4 class="small muted mt-2">WHY THIS PRIORITY</h4><ul class="mini-list small">${f.priority.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}<li class="muted">Facts: ${esc(f.priority.facts.join('; '))}</li></ul>` : ''}
      </div>
      <div>
        <h4 class="small muted">DATA QUALITY</h4>
        ${f.dataQuality.length ? `<ul class="evidence-list">${f.dataQuality.map((d) => `<li><span class="marker"><span class="pill ${d.level === 'warning' ? 'yellow' : 'outline'}">${esc(d.level)}</span></span><span>${esc(d.text)}</span></li>`).join('')}</ul>` : '<p class="small muted">No data quality issues detected.</p>'}
        <h4 class="small muted mt-2">VERIFICATION REQUIRED</h4>
        <ol class="small" style="padding-left:18px;margin:0">${f.verification.map((v) => `<li>${esc(v)}</li>`).join('')}</ol>
      </div>
    </div>
    <h4 class="small muted mt-2">AFFECTED SCOPE - ${f.impact.applications.length} application(s), ${f.impact.awsAccounts.length} AWS account(s)${f.impact.production ? ' · <span class="pill red">production</span>' : ''}</h4>
    ${impactRows ? `<div class="table-wrap"><table class="data"><thead><tr><th>Application</th><th>Environment</th><th>Infrastructure</th><th>AWS account</th><th>Location</th></tr></thead><tbody>${impactRows}</tbody></table></div>` : '<p class="small muted">No deployments recorded.</p>'}
  </div>`;
}

function renderDetail(el, ctx) {
  const { store, session, params } = ctx;
  const result = cachedAssessAll(store).find((r) => r.cve.id === params.id);
  if (!result) {
    el.innerHTML = `<div class="card">${emptyState(`${params.id} is not in the vulnerability register.`)}<p class="text-right"><a class="btn" href="#/assessments">Back</a></p></div>`;
    return;
  }
  const { cve, findings, summary: s } = result;
  ctx.setTitle(`Impact Assessments / ${cve.id}`);
  const canReview = session.can('review');
  const notAffected = findings.filter((f) => f.status === 'Not affected');
  const active = findings.filter((f) => f.status !== 'Not affected');

  el.innerHTML = `
    ${pageHeader({
      title: `${cve.id} impact assessment`,
      subtitle: cve.title,
      crumbs: `<a href="#/assessments">Impact Assessments</a> / <a href="#/vulnerabilities/${esc(cve.id)}">${esc(cve.id)}</a>`,
      actions: '<button class="btn" id="print">Print / PDF</button>',
    })}
    ${SAFETY_NOTICE}
    <div class="grid grid-6">
      <div class="card stat-card" style="--stat-color:var(--sev-critical)"><div class="stat-label">Severity</div><div class="stat-value">${esc(cve.cvssScore ?? '—')}</div><div class="stat-foot">${severityPill(cve.severity)}</div></div>
      <div class="card stat-card" style="--stat-color:var(--st-orange)"><div class="stat-label">Overall status</div><div class="mt-1">${assessmentPill(s.status)}</div><div class="stat-foot">worst finding</div></div>
      <div class="card stat-card" style="--stat-color:var(--navy-700)"><div class="stat-label">Investigation priority</div><div class="mt-1">${priorityPill(s.priority, s.priorityLabel)}</div><div class="stat-foot">rule-based</div></div>
      ${statCard({ label: 'Applications in scope', value: s.applications.length, foot: `${s.productionApplications.length} in production`, color: 'var(--st-red)' })}
      ${statCard({ label: 'AWS accounts', value: s.awsAccounts.length, foot: `${s.infrastructure.length} infrastructure targets`, color: 'var(--cyan)' })}
      ${statCard({ label: 'Exploitation', value: cve.exploitationStatus === 'Known exploited (CISA KEV)' ? 'KEV' : cve.exploitAvailability === 'Public exploit' ? 'Public' : '—', foot: cve.exploitationStatus, color: 'var(--st-purple)' })}
    </div>
    <div class="card mt-2">
      <div class="card-header"><h3>Vulnerability</h3></div>
      <p>${esc(cve.description)}</p>
      <dl class="kv"><dt>Affected</dt><dd>${esc(cve.vendor)} ${esc(cve.product)} <span class="mono">${esc(result.findings[0] ? result.findings[0].affectedVersions : (cve.affectedVersions || 'not specified'))}</span></dd>
      <dt>Fixed in</dt><dd class="mono">${esc(cve.fixedVersions || '—')}</dd><dt>Remediation</dt><dd>${esc(cve.remediation || '—')}</dd></dl>
    </div>
    <div id="ai-panel"></div>
    ${active.length ? `<h2 class="mt-3">Findings requiring attention (${active.length})</h2>${active.map((f) => findingCard(f, cve, canReview)).join('')}` : ''}
    ${notAffected.length ? `<h2 class="mt-3">Not affected (${notAffected.length})</h2>${notAffected.map((f) => findingCard(f, cve, canReview)).join('')}` : ''}
    ${!findings.length ? `<div class="card mt-2">${emptyState('No software in the inventory matches this vulnerability. This is based on the inventory as recorded - incomplete or inaccurate inventory may hide exposure.')}</div>` : ''}`;

  el.querySelector('#print').addEventListener('click', () => window.print());
  el.querySelectorAll('[data-review]').forEach((btn) => btn.addEventListener('click', () => {
    const f = findings.find((x) => x.softwareId === btn.dataset.review);
    openReviewForm(ctx, cve, f, () => renderDetail(el, ctx));
  }));
  if (ctx.renderAiPanel) ctx.renderAiPanel(el.querySelector('#ai-panel'), result);
}

function openReviewForm(ctx, cve, f, onSaved) {
  const { store, session } = ctx;
  const existing = f.review;
  openRecordForm({
    title: `Analyst decision: ${cve.id} / ${f.software.product} ${f.software.version || ''}`,
    collection: 'assessmentReviews',
    record: existing || { status: f.computedStatus === 'Potentially affected' ? '' : f.computedStatus, rationale: '' },
    include: ['status', 'rationale'],
    store,
    intro: `Engine result: <strong>${esc(f.computedStatus)}</strong>. Record the outcome of your verification and the evidence relied on (e.g. scan output, config check, vendor confirmation). Your decision is attributed to <strong>${esc(session.user.name)}</strong> and audit-logged.`,
    onSubmit: async (data) => {
      const record = { ...data, cveId: cve.id, softwareId: f.softwareId, reviewedBy: session.user.name, reviewedAt: new Date().toISOString() };
      if (existing) await store.update('assessmentReviews', existing.id, record);
      else await store.create('assessmentReviews', record);
      toast('Decision recorded.');
      onSaved();
    },
  });
}

