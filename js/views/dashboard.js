import { esc, fmtDate, relTime } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import {
  statCard, barChart, severityPill, pageHeader, emptyState, criticalityPill, assessmentPill, priorityPill,
  SEVERITY_COLORS, ASSESSMENT_COLORS,
} from '../ui/components.js';
import { SEVERITIES, CRITICALITY } from '../models/lookups.js';
import { cachedAssessAll, STATUS_ORDER } from '../services/assessment-engine.js';

const AFFECTED = ['Confirmed affected', 'Potentially affected'];

export function render(el, { store, setTitle }) {
  setTitle('Dashboard');
  const vulns = store.all('vulnerabilities');
  const apps = store.all('applications');
  const results = cachedAssessAll(store);
  const critHigh = vulns.filter((v) => v.severity === 'Critical' || v.severity === 'High');
  const kev = vulns.filter((v) => v.exploitationStatus === 'Known exploited (CISA KEV)');

  // Applications with at least one confirmed/potential finding, with their worst status
  const affectedApps = new Map();
  for (const r of results) {
    for (const a of r.summary.applications) {
      if (!AFFECTED.includes(a.status)) continue;
      const prev = affectedApps.get(a.id);
      if (!prev || STATUS_ORDER.indexOf(a.status) < STATUS_ORDER.indexOf(prev.status)) affectedApps.set(a.id, { ...a, cves: [...(prev ? prev.cves : []), r.cve.id] });
      else prev.cves.push(r.cve.id);
    }
  }
  const affectedList = [...affectedApps.values()].sort((a, b) => CRITICALITY.indexOf(a.criticality) - CRITICALITY.indexOf(b.criticality));
  const findings = results.flatMap((r) => r.findings);

  const sevRows = SEVERITIES.filter((s) => s !== 'None').map((s) => ({
    label: s, value: vulns.filter((v) => v.severity === s).length, color: SEVERITY_COLORS[s], href: `#/vulnerabilities?severity=${s}`,
  }));
  const statusRows = STATUS_ORDER.map((s) => ({
    label: s, value: findings.filter((f) => f.status === s).length, color: ASSESSMENT_COLORS[s], href: `#/assessments?status=${encodeURIComponent(s)}`,
  }));
  const priorities = results.filter((r) => r.summary.priority).sort((a, b) => a.summary.priority.localeCompare(b.summary.priority)).slice(0, 6);
  const recent = [...vulns].sort((a, b) => String(b.lastModified || b.published).localeCompare(String(a.lastModified || a.published))).slice(0, 6);

  el.innerHTML = `
    ${pageHeader({ title: 'Security posture overview', subtitle: `Snapshot of the vulnerability inventory for ${store.getSettings().organisationName || 'your organisation'}.` })}
    <div class="grid grid-6">
      ${statCard({ label: 'Applications', value: apps.length, foot: `${apps.filter((a) => a.internetFacing).length} internet-facing`, href: '#/applications' })}
      ${statCard({ label: 'Software components', value: store.count('software'), foot: `${store.count('deployments')} deployments`, color: 'var(--cyan)', href: '#/software' })}
      ${statCard({ label: 'Vulnerabilities tracked', value: vulns.length, foot: `${kev.length} known exploited`, color: 'var(--st-purple)', href: '#/vulnerabilities' })}
      ${statCard({ label: 'Critical & high CVEs', value: critHigh.length, foot: `${vulns.filter((v) => v.severity === 'Critical').length} critical`, color: 'var(--sev-critical)', href: '#/vulnerabilities?severity=Critical' })}
      ${statCard({ label: 'Potentially affected apps', value: affectedApps.size, foot: `${affectedList.filter((a) => a.production).length} with production exposure`, color: 'var(--st-orange)', href: '#/assessments' })}
      ${statCard({ label: 'P1 / P2 investigations', value: results.filter((r) => ['P1', 'P2'].includes(r.summary.priority)).length, foot: 'rule-based priority', color: 'var(--navy-700)', href: '#/assessments' })}
    </div>

    <div class="grid grid-3 mt-2">
      <div class="card">
        <div class="card-header"><h3>Vulnerabilities by severity</h3></div>
        ${barChart(sevRows)}
      </div>
      <div class="card">
        <div class="card-header"><h3>Assessment findings by status</h3></div>
        ${barChart(statusRows)}
        <p class="small muted mt-1">Engine findings are leads for investigation, not proof of exposure.</p>
      </div>
      <div class="card">
        <div class="card-header"><h3>Potentially affected applications</h3></div>
        ${affectedList.length ? `<ul class="mini-list">${affectedList.map((a) => `
          <li class="flex"><a href="#/applications/${esc(a.id)}">${esc(a.name)}</a>${a.production ? '<span class="tag prod">prod</span>' : ''}<span class="spacer"></span>${criticalityPill(a.criticality)}</li>`).join('')}</ul>`
          : emptyState('No potentially affected applications.')}
      </div>
    </div>

    <div class="grid grid-2 mt-2">
      <div class="card">
        <div class="card-header"><h3>Investigation priorities</h3><div class="actions"><a class="btn btn-sm" href="#/assessments">All assessments</a></div></div>
        ${priorities.length ? `<ul class="activity">${priorities.map((r) => `
          <li>
            <div>${priorityPill(r.summary.priority, r.summary.priorityLabel)}</div>
            <div>
              <div><a class="row-link" href="#/assessments/${esc(r.cve.id)}">${esc(r.cve.id)}</a> ${severityPill(r.cve.severity)} ${assessmentPill(r.summary.status)}</div>
              <div class="small muted">${esc(r.cve.vendor)} ${esc(r.cve.product)} · ${r.summary.applications.map((a) => esc(a.name)).join(', ') || 'no applications recorded'}</div>
            </div>
          </li>`).join('')}</ul>` : emptyState('No open investigations.')}
      </div>
      <div class="card">
        <div class="card-header"><h3>Recent vulnerability activity</h3><div class="actions"><a class="btn btn-sm" href="#/vulnerabilities">View all</a></div></div>
        ${recent.length ? `<ul class="activity">${recent.map((v) => `
          <li>
            <div class="icon">${icons.bug}</div>
            <div>
              <div><a href="#/vulnerabilities/${esc(v.id)}" class="row-link">${esc(v.id)}</a> ${severityPill(v.severity)}</div>
              <div class="small">${esc(v.title)}</div>
              <div class="small muted">published ${fmtDate(v.published)}</div>
            </div>
            <div class="when">updated ${esc(relTime(v.lastModified || v.published))}</div>
          </li>`).join('')}</ul>` : emptyState('No vulnerabilities recorded.')}
      </div>
    </div>`;
}
