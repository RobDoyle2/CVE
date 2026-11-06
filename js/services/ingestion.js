// Vulnerability feed ingestion pipeline.
//
//   fetch (backend) -> adapter (normalise) -> plan (dedupe/diff) -> apply
//   -> re-assess affected CVEs -> notify
//
// In the GitHub Pages build the "fetch" step reads bundled sample files so the
// pipeline can be demonstrated without live external connections. The adapter,
// planning and notification logic is pure and is intended to run unchanged in
// a scheduled AWS Lambda function later.

import { validateRecord } from './validation.js';
import { severityFromScore } from '../models/lookups.js';
import { describeExpression } from './version.js';
import { normaliseName, assessCve } from './assessment-engine.js';

const KEV = 'Known exploited (CISA KEV)';
const EXPLOIT_RANK = { Unknown: 0, 'Not known to be exploited': 1, 'Exploitation reported': 2, [KEV]: 3 };

// ------------------------------------------------------------- adapters
function titleFrom(description) {
  const first = String(description || '').split(/(?<=\.)\s/)[0].trim();
  return first.length > 150 ? `${first.slice(0, 147)}…` : first;
}

function cpeParts(criteria) {
  const p = String(criteria || '').split(':');
  if (p.length < 6) return null;
  const clean = (s) => s.replace(/\\(.)/g, '$1').replace(/_/g, ' ');
  return { vendor: clean(p[3]), product: clean(p[4]), version: p[5] };
}

/** NVD CVE API 2.0 response -> canonical vulnerability records. */
export function normaliseNvd(json) {
  const out = [];
  for (const item of (json && json.vulnerabilities) || []) {
    const c = item.cve || {};
    const desc = ((c.descriptions || []).find((d) => d.lang === 'en') || {}).value || '';
    const metric = ((c.metrics || {}).cvssMetricV31 || (c.metrics || {}).cvssMetricV30 || [])[0];
    const cvss = metric ? metric.cvssData : null;
    const ranges = [];
    const fixed = [];
    let vendor = '';
    let product = '';
    for (const conf of c.configurations || []) {
      for (const node of conf.nodes || []) {
        for (const m of node.cpeMatch || []) {
          if (!m.vulnerable) continue;
          const parts = cpeParts(m.criteria);
          if (!parts) continue;
          if (!vendor) { vendor = parts.vendor; product = parts.product; }
          if (normaliseName(parts.product) !== normaliseName(product)) continue; // first product only
          const conds = [];
          if (m.versionStartIncluding) conds.push(`>=${m.versionStartIncluding}`);
          if (m.versionStartExcluding) conds.push(`>${m.versionStartExcluding}`);
          if (m.versionEndIncluding) conds.push(`<=${m.versionEndIncluding}`);
          if (m.versionEndExcluding) { conds.push(`<${m.versionEndExcluding}`); fixed.push(m.versionEndExcluding); }
          if (!conds.length && parts.version && parts.version !== '*' && parts.version !== '-') conds.push(`=${parts.version}`);
          if (conds.length) ranges.push(conds.join(' '));
          else ranges.push('*');
        }
      }
    }
    out.push({
      id: String(c.id || '').toUpperCase(),
      title: titleFrom(desc),
      description: desc,
      published: String(c.published || '').slice(0, 10),
      lastModified: String(c.lastModified || '').slice(0, 10),
      cvssScore: cvss ? cvss.baseScore : undefined,
      cvssVector: cvss ? cvss.vectorString : undefined,
      severity: cvss ? (cvss.baseSeverity ? cvss.baseSeverity[0] + cvss.baseSeverity.slice(1).toLowerCase() : severityFromScore(cvss.baseScore)) : undefined,
      vendor,
      product,
      affectedVersions: ranges.includes('*') ? '*' : ranges.join(' || '),
      fixedVersions: fixed.join(', '),
      references: (c.references || []).map((r) => r.url).filter(Boolean),
      _source: 'NVD',
    });
  }
  return out;
}

/** CISA KEV catalogue -> partial updates (exploitation status only). */
export function normaliseKev(json) {
  return ((json && json.vulnerabilities) || []).map((v) => ({
    id: String(v.cveID || '').toUpperCase(),
    exploitationStatus: KEV,
    exploitAvailability: 'Public exploit',
    remediation: v.requiredAction || undefined,
    _kevDateAdded: v.dateAdded,
    _kevVendor: v.vendorProject,
    _kevProduct: v.product,
    _partial: true,
    _source: 'CISA KEV',
  }));
}

export const ADAPTERS = {
  'NVD API': normaliseNvd,
  'CISA KEV catalogue': normaliseKev,
};

// ------------------------------------------------------------- planning
const FIELDS = ['title', 'description', 'published', 'lastModified', 'cvssScore', 'cvssVector', 'severity', 'vendor', 'product', 'affectedVersions', 'fixedVersions', 'references', 'exploitationStatus', 'exploitAvailability', 'remediation'];

function same(field, a, b) {
  if (field === 'vendor' || field === 'product') return normaliseName(a) === normaliseName(b);
  if (field === 'affectedVersions') return describeExpression(a || '') === describeExpression(b || '');
  if (field === 'fixedVersions') return String(a || '').replace(/\s/g, '') === String(b || '').replace(/\s/g, '');
  if (field === 'references') return JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
  if (field === 'cvssScore') return Number(a) === Number(b);
  return (a ?? '') === (b ?? '');
}

/**
 * Compare incoming records with the register.
 * Rules:
 *  - Records are keyed by CVE ID; duplicates within the batch are collapsed.
 *  - Only fields supplied by the source are compared/updated (blank = no information).
 *  - Exploitation status is only ever escalated, never downgraded.
 *  - The existing (human-readable) title, vendor and product are kept when
 *    the source value is equivalent.
 *  - Partial sources (KEV) never create CVEs; unknown IDs are deferred until
 *    a full source (NVD) supplies the record.
 *  - Every resulting record is validated; invalid records are rejected.
 */
export function planIngestion(incoming, store) {
  const plan = { creates: [], updates: [], unchanged: [], deferred: [], rejected: [], duplicatesInBatch: 0 };
  const seen = new Set();
  for (const rec of incoming) {
    if (!rec.id || !/^CVE-\d{4}-\d{4,}$/.test(rec.id)) {
      plan.rejected.push({ id: rec.id || '(missing ID)', errors: ['Missing or invalid CVE identifier.'] });
      continue;
    }
    if (seen.has(rec.id)) { plan.duplicatesInBatch += 1; continue; }
    seen.add(rec.id);
    const existing = store.get('vulnerabilities', rec.id);
    if (!existing) {
      if (rec._partial) { plan.deferred.push({ id: rec.id, reason: `Listed by ${rec._source} (${rec._kevVendor || ''} ${rec._kevProduct || ''}) but not yet in the register; awaiting full record from NVD.` }); continue; }
      const record = {
        exploitAvailability: 'Unknown', exploitationStatus: 'Unknown', remediation: '', cvssVector: '',
        ...Object.fromEntries(FIELDS.filter((f) => rec[f] !== undefined && rec[f] !== '').map((f) => [f, rec[f]])),
        id: rec.id,
        source: rec._source,
      };
      if (!record.lastModified) record.lastModified = record.published;
      const v = validateRecord('vulnerabilities', record, { store });
      if (!v.valid) plan.rejected.push({ id: rec.id, errors: Object.values(v.errors) });
      else plan.creates.push(record);
      continue;
    }
    const changes = {};
    for (const f of FIELDS) {
      const val = rec[f];
      if (val === undefined || val === '' || (Array.isArray(val) && !val.length)) continue;
      if (f === 'exploitationStatus' && (EXPLOIT_RANK[val] ?? 0) <= (EXPLOIT_RANK[existing[f]] ?? 0)) continue;
      if (f === 'exploitAvailability' && existing[f] === 'Public exploit') continue;
      if (f === 'remediation' && existing.remediation) continue;
      if (f === 'title' && existing.title) continue;
      if (!same(f, existing[f], val)) changes[f] = { from: existing[f], to: val };
    }
    if (!Object.keys(changes).length) { plan.unchanged.push(rec.id); continue; }
    const patch = Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, c.to]));
    if (patch.cvssScore !== undefined && patch.severity === undefined) patch.severity = severityFromScore(patch.cvssScore);
    const v = validateRecord('vulnerabilities', { ...existing, ...patch }, { store, existingId: existing.id });
    if (!v.valid) plan.rejected.push({ id: rec.id, errors: Object.values(v.errors) });
    else plan.updates.push({ id: rec.id, patch, changes, source: rec._source });
  }
  return plan;
}

/** Apply a plan atomically; returns the IDs that were created or changed. */
export async function applyIngestion(plan, store) {
  const touched = [];
  await store.transaction(async () => {
    for (const r of plan.creates) { await store.create('vulnerabilities', r); touched.push(r.id); }
    for (const u of plan.updates) { await store.update('vulnerabilities', u.id, u.patch); touched.push(u.id); }
  });
  return touched;
}

// ------------------------------------------------------------- notifications
/**
 * Build notifications for important findings on the given CVEs according to
 * the configured rules. Existing notifications with the same key are not repeated.
 */
export function buildNotifications(store, cveIds, settings = store.getSettings(), now = new Date().toISOString()) {
  const priorities = settings.notifyOnPriorities || ['P1', 'P2'];
  const existingKeys = new Set(store.all('notifications').map((n) => n.key).filter(Boolean));
  const out = [];
  for (const id of cveIds) {
    const cve = store.get('vulnerabilities', id);
    if (!cve) continue;
    const { summary } = assessCve(cve, store);
    const exploited = cve.exploitationStatus === KEV;
    const prodFindings = summary.productionApplications.length > 0;
    const byPriority = summary.priority && priorities.includes(summary.priority);
    const byKev = settings.notifyOnKnownExploited && exploited && summary.relevantFindings > 0;
    if (!byPriority && !byKev) continue;
    const key = `${cve.id}|${summary.priority || 'none'}|${cve.exploitationStatus}`;
    if (existingKeys.has(key)) continue;
    const owners = [...new Set(summary.applications.map((a) => (store.get('applications', a.id) || {}).technicalOwner).filter(Boolean))];
    out.push({
      key,
      createdAt: now,
      level: summary.priority === 'P1' ? 'critical' : 'warning',
      title: `${summary.priority ? `${summary.priority} ` : ''}${cve.id}: ${cve.severity} ${exploited ? 'known-exploited ' : ''}vulnerability may affect ${prodFindings ? 'production' : 'recorded'} applications`,
      message: `${cve.vendor} ${cve.product} - ${summary.status}. Applications: ${summary.applications.map((a) => a.name).join(', ') || 'none recorded'}.`,
      link: `#/assessments/${cve.id}`,
      audience: [settings.notificationRecipients, ...owners].filter(Boolean).join('; '),
      read: false,
    });
  }
  return out;
}

export async function saveNotifications(store, notifications) {
  await store.transaction(async () => {
    for (const n of notifications) await store.create('notifications', n, { validate: false, audit: false });
  });
}
