// Report definitions. Each report builds one or more sheets (header row +
// data rows) that can be previewed, exported as CSV (first sheet) or as an
// Excel workbook (all sheets).
import { assessAll, STATUS_ORDER } from './assessment-engine.js';
import { inventoryWorkbook, assessmentRows, exportRows } from './data-exchange.js';
import { CRITICALITY } from '../models/lookups.js';

const OPEN = ['Confirmed affected', 'Potentially affected', 'Requires investigation', 'Unable to determine'];
const join = (a) => a.filter(Boolean).join('; ');

function appExposure(store, results) {
  const header = ['Application ID', 'Application', 'Criticality', 'Internet-facing', 'Environments', 'Business owner', 'Technical owner',
    ...STATUS_ORDER.map((s) => `Findings: ${s}`), 'Highest priority', 'Open CVEs', 'Production exposure'];
  const rows = store.all('applications').map((a) => {
    const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
    const cves = new Set();
    let best = null;
    let prod = false;
    for (const r of results) {
      for (const f of r.findings) {
        const ia = f.impact.applications.find((x) => x.id === a.id);
        if (!ia) continue;
        counts[f.status] += 1;
        if (OPEN.includes(f.status)) {
          cves.add(r.cve.id);
          if (f.priority.level && (!best || f.priority.level < best)) best = f.priority.level;
          if (ia.production && ['Confirmed affected', 'Potentially affected'].includes(f.status)) prod = true;
        }
      }
    }
    return [a.id, a.name, a.criticality, a.internetFacing ? 'yes' : 'no', join(a.environments || []), a.businessOwner, a.technicalOwner,
      ...STATUS_ORDER.map((s) => counts[s]), best || '', join([...cves]), prod ? 'yes' : 'no'];
  });
  rows.sort((x, y) => (x[x.length - 3] || 'P9').localeCompare(y[y.length - 3] || 'P9') || CRITICALITY.indexOf(x[2]) - CRITICALITY.indexOf(y[2]));
  return [header, ...rows];
}

function dataQuality(store) {
  const staleDays = Number(store.getSettings().staleReviewDays) || 180;
  const now = Date.now();
  const header = ['Type', 'Record ID', 'Name', 'Issue', 'Owner / submitted by'];
  const rows = [];
  for (const s of store.all('software')) {
    const name = `${s.vendor} ${s.product} ${s.version || ''}`.trim();
    if (!s.version) rows.push(['Software', s.id, name, 'Version not recorded', s.submittedBy]);
    if (s.verificationStatus !== 'Verified') rows.push(['Software', s.id, name, `Verification status: ${s.verificationStatus}`, s.submittedBy]);
    if (!s.lastReviewed) rows.push(['Software', s.id, name, 'Never reviewed', s.submittedBy]);
    else if ((now - Date.parse(`${s.lastReviewed}T00:00:00Z`)) / 86400000 > staleDays) rows.push(['Software', s.id, name, `Last reviewed ${s.lastReviewed} (older than ${staleDays} days)`, s.submittedBy]);
    if (!store.find('deployments', (d) => d.softwareId === s.id).length) rows.push(['Software', s.id, name, 'Not linked to any application', s.submittedBy]);
    if (s.reviewStatus && s.reviewStatus !== 'Approved') rows.push(['Software', s.id, name, `Review status: ${s.reviewStatus}`, s.submittedBy]);
  }
  for (const a of store.all('applications')) {
    const links = store.find('applicationInfrastructure', (l) => l.applicationId === a.id).length;
    if (!links) rows.push(['Application', a.id, a.name, 'No infrastructure recorded', a.technicalOwner]);
    if (!store.find('deployments', (d) => d.applicationId === a.id).length) rows.push(['Application', a.id, a.name, 'No software recorded', a.technicalOwner]);
    if (a.reviewStatus && a.reviewStatus !== 'Approved') rows.push(['Application', a.id, a.name, `Review status: ${a.reviewStatus}`, a.submittedBy]);
    if (/unassigned/i.test(a.technicalOwner || '')) rows.push(['Application', a.id, a.name, 'Technical owner unassigned', a.businessOwner]);
  }
  for (const d of store.all('deployments')) if (!d.infrastructureId) rows.push(['Deployment', d.id, `${d.applicationId} / ${d.softwareId}`, 'No infrastructure recorded', '']);
  for (const v of store.all('vulnerabilities')) {
    if (!v.affectedVersions) rows.push(['Vulnerability', v.id, v.title, 'Affected versions not specified', v.source]);
    if (!v.references || !v.references.length) rows.push(['Vulnerability', v.id, v.title, 'No reference URLs', v.source]);
  }
  return [header, ...rows];
}

function executiveSummary(store, results) {
  const vulns = store.all('vulnerabilities');
  const affectedApps = new Set();
  const prodApps = new Set();
  for (const r of results) for (const a of r.summary.applications) {
    if (['Confirmed affected', 'Potentially affected'].includes(a.status)) { affectedApps.add(a.id); if (a.production) prodApps.add(a.id); }
  }
  const kpis = [
    ['Measure', 'Value'],
    ['Report generated', new Date().toISOString()],
    ['Organisation', store.getSettings().organisationName || ''],
    ['Applications', store.count('applications')],
    ['Software components', store.count('software')],
    ['AWS accounts recorded', store.count('awsAccounts')],
    ['Vulnerabilities tracked', vulns.length],
    ['Critical severity CVEs', vulns.filter((v) => v.severity === 'Critical').length],
    ['High severity CVEs', vulns.filter((v) => v.severity === 'High').length],
    ['Known exploited CVEs (KEV)', vulns.filter((v) => v.exploitationStatus === 'Known exploited (CISA KEV)').length],
    ['Applications confirmed/potentially affected', affectedApps.size],
    ['…of which with production exposure', prodApps.size],
    ['P1 investigations', results.filter((r) => r.summary.priority === 'P1').length],
    ['P2 investigations', results.filter((r) => r.summary.priority === 'P2').length],
    ['Findings awaiting analyst decision', results.reduce((n, r) => n + r.summary.unreviewed, 0)],
    ['Note', 'Automated findings are leads for investigation, not proof of vulnerability. Priorities are rule-based, not probabilities.'],
  ];
  const priorities = [['Priority', 'CVE', 'Title', 'Severity', 'Exploitation', 'Overall status', 'Applications', 'Production applications', 'AWS accounts', 'Remediation']];
  for (const r of results.filter((x) => x.summary.priority).sort((a, b) => a.summary.priority.localeCompare(b.summary.priority))) {
    priorities.push([r.summary.priority, r.cve.id, r.cve.title, r.cve.severity, r.cve.exploitationStatus, r.summary.status,
      join(r.summary.applications.map((a) => a.name)), join(r.summary.productionApplications.map((a) => a.name)),
      join(r.summary.awsAccounts.map((a) => a.accountName)), r.cve.remediation || '']);
  }
  return [{ name: 'Summary', rows: kpis }, { name: 'Priorities', rows: priorities }, { name: 'Application exposure', rows: appExposure(store, results) }];
}

export const REPORTS = [
  { id: 'executive', title: 'Executive vulnerability summary', description: 'Headline measures, rule-based investigation priorities and application exposure.', build: (store) => executiveSummary(store, assessAll(store)) },
  { id: 'impact', title: 'CVE impact assessment report', description: 'One row per CVE/software finding with evidence, scope, data quality and analyst decisions.', build: (store) => [{ name: 'Assessments', rows: assessmentRows(store) }] },
  { id: 'applications', title: 'Application exposure report', description: 'Findings by application, criticality and environment.', build: (store) => [{ name: 'Application exposure', rows: appExposure(store, assessAll(store)) }] },
  { id: 'quality', title: 'Inventory data quality report', description: 'Missing versions, unverified or stale records, missing relationships and pending reviews.', build: (store) => [{ name: 'Data quality', rows: dataQuality(store) }] },
  { id: 'kev', title: 'Known exploited vulnerabilities', description: 'CVEs flagged as known exploited or exploitation reported, with affected scope.', build: (store) => {
    const results = assessAll(store).filter((r) => ['Known exploited (CISA KEV)', 'Exploitation reported'].includes(r.cve.exploitationStatus));
    return [{ name: 'Exploited CVEs', rows: [['CVE', 'Title', 'Severity', 'Exploitation', 'Status', 'Priority', 'Applications', 'Remediation'],
      ...results.map((r) => [r.cve.id, r.cve.title, r.cve.severity, r.cve.exploitationStatus, r.summary.status, r.summary.priority || '', join(r.summary.applications.map((a) => a.name)), r.cve.remediation || ''])] }];
  } },
  { id: 'inventory', title: 'Full inventory workbook', description: 'All applications, software, deployments, infrastructure, AWS accounts, CVEs and assessments in one Excel workbook.', build: (store) => inventoryWorkbook(store) },
  { id: 'vulnerabilities', title: 'CVE register', description: 'All vulnerability records in import-compatible format.', build: (store) => [{ name: 'Vulnerabilities', rows: exportRows('vulnerabilities', store) }] },
];
