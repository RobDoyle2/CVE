import { esc, fmtDate, relTime } from '../ui/dom.js';
import { icons } from '../ui/icons.js';
import {
  statCard, barChart, severityPill, pageHeader, emptyState, criticalityPill, SEVERITY_COLORS,
} from '../ui/components.js';
import { SEVERITIES, CRITICALITY } from '../models/lookups.js';

// Stage 1: a simple product-name lookup used for illustration only.
// Replaced by the assessment engine in a later stage.
function preliminaryExposure(store) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const apps = new Set();
  for (const cve of store.all('vulnerabilities')) {
    const sws = store.all('software').filter((s) => norm(s.product) === norm(cve.product));
    for (const s of sws) {
      for (const d of store.all('deployments').filter((x) => x.softwareId === s.id)) apps.add(d.applicationId);
    }
  }
  return { affectedApps: apps };
}

export function render(el, { store, setTitle }) {
  setTitle('Dashboard');
  const vulns = store.all('vulnerabilities');
  const apps = store.all('applications');
  const critHigh = vulns.filter((v) => v.severity === 'Critical' || v.severity === 'High');
  const kev = vulns.filter((v) => v.exploitationStatus === 'Known exploited (CISA KEV)');
  const { affectedApps } = preliminaryExposure(store);

  const sevRows = SEVERITIES.filter((s) => s !== 'None').map((s) => ({
    label: s, value: vulns.filter((v) => v.severity === s).length, color: SEVERITY_COLORS[s], href: `#/vulnerabilities?severity=${s}`,
  }));
  const critRows = CRITICALITY.map((c) => ({
    label: c, value: apps.filter((a) => a.criticality === c).length, color: 'var(--accent)', href: `#/applications?criticality=${c}`,
  }));

  const recent = [...vulns].sort((a, b) => String(b.lastModified || b.published).localeCompare(String(a.lastModified || a.published))).slice(0, 6);

  el.innerHTML = `
    ${pageHeader({ title: 'Security posture overview', subtitle: `Snapshot of the vulnerability inventory for ${store.getSettings().organisationName || 'your organisation'}.` })}
    <div class="grid grid-6">
      ${statCard({ label: 'Applications', value: apps.length, foot: `${apps.filter((a) => a.internetFacing).length} internet-facing`, href: '#/applications' })}
      ${statCard({ label: 'Software components', value: store.count('software'), foot: `${store.count('deployments')} deployments`, color: 'var(--cyan)', href: '#/software' })}
      ${statCard({ label: 'Vulnerabilities tracked', value: vulns.length, foot: 'CVE register', color: 'var(--st-purple)', href: '#/vulnerabilities' })}
      ${statCard({ label: 'Critical & high CVEs', value: critHigh.length, foot: `${vulns.filter((v) => v.severity === 'Critical').length} critical`, color: 'var(--sev-critical)', href: '#/vulnerabilities?severity=Critical' })}
      ${statCard({ label: 'Potentially affected apps', value: affectedApps.size, foot: 'Preliminary name match', color: 'var(--st-orange)', href: '#/assessments' })}
      ${statCard({ label: 'Known exploited CVEs', value: kev.length, foot: 'CISA KEV listed', color: 'var(--navy-700)', href: '#/vulnerabilities' })}
    </div>

    <div class="grid grid-3 mt-2">
      <div class="card">
        <div class="card-header"><h3>Vulnerabilities by severity</h3></div>
        ${barChart(sevRows)}
      </div>
      <div class="card">
        <div class="card-header"><h3>Applications by business criticality</h3></div>
        ${barChart(critRows)}
      </div>
      <div class="card">
        <div class="card-header"><h3>Potentially affected applications</h3></div>
        ${affectedApps.size ? `<ul class="mini-list">${[...affectedApps].map((id) => store.get('applications', id)).filter(Boolean).map((a) => `
          <li class="flex"><a href="#/applications/${esc(a.id)}">${esc(a.name)}</a><span class="spacer"></span>${criticalityPill(a.criticality)}</li>`).join('')}</ul>`
          : emptyState('No potentially affected applications.')}
      </div>
    </div>

    <div class="card mt-2">
      <div class="card-header"><h3>Recent vulnerability activity</h3><div class="actions"><a class="btn btn-sm" href="#/vulnerabilities">View all</a></div></div>
      ${recent.length ? `<ul class="activity">${recent.map((v) => `
        <li>
          <div class="icon">${icons.bug}</div>
          <div>
            <div><a href="#/vulnerabilities/${esc(v.id)}" class="row-link">${esc(v.id)}</a> ${severityPill(v.severity)}</div>
            <div class="small">${esc(v.title)}</div>
            <div class="small muted">${esc(v.vendor)} ${esc(v.product)} · published ${fmtDate(v.published)}</div>
          </div>
          <div class="when">updated ${esc(relTime(v.lastModified || v.published))}</div>
        </li>`).join('')}</ul>` : emptyState('No vulnerabilities recorded.')}
    </div>`;
}
