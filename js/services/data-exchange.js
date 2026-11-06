// CSV/Excel import and export.
//
// Column specifications are shared by templates, import and export, so an
// exported file can be edited and re-imported (round trip).
//
// Import rules:
//  - Lists use ";" as separator (e.g. environments, infrastructureIds).
//  - Booleans accept yes/no, true/false, y/n, 1/0.
//  - Duplicates are detected by record ID and by natural key (e.g.
//    application name, vendor+product+version, CVE ID) and within the file.
//  - When updating existing records, empty cells leave the stored value unchanged.
//  - Everything is validated before anything is written; the write is one
//    transaction (all rows or none).

import { SCHEMAS } from '../models/schemas.js';
import { validateRecord } from './validation.js';
import { parseCsvObjects, toCsv } from './csv.js';
import { onCreate, onEdit } from './workflow.js';
import { syncAppInfrastructure } from './relationships.js';
import { assessAll } from './assessment-engine.js';

const list = (s) => String(s || '').split(/[;|\n]/).map((x) => x.trim()).filter(Boolean);
const joinList = (arr) => (arr || []).filter(Boolean).join('; ');

function parseBool(v) {
  const s = String(v).trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return undefined;
}

const col = (header, opts = {}) => ({ header, field: opts.field || header, kind: opts.kind || 'string', ...opts });

const WORKFLOW_EXPORT = [
  col('submittedBy', { exportOnly: true }), col('submittedDate', { exportOnly: true }), col('reviewStatus', { exportOnly: true }),
  col('reviewedBy', { exportOnly: true }), col('lastModified', { exportOnly: true }),
];

export const IMPORT_TYPES = {
  applications: {
    label: 'Applications',
    collection: 'applications',
    columns: [
      col('id'), col('name'), col('description'), col('businessOwner'), col('technicalOwner'), col('criticality'),
      col('environments', { kind: 'list' }), col('internetFacing', { kind: 'bool' }), col('businessFunction'), col('notes'),
      col('infrastructureIds', { kind: 'list', relation: true, export: (store, r) => joinList(store.find('applicationInfrastructure', (l) => l.applicationId === r.id).map((l) => l.infrastructureId)) }),
      col('awsAccounts', { exportOnly: true, export: (store, r) => joinList([...new Set(store.find('applicationInfrastructure', (l) => l.applicationId === r.id).map((l) => (store.get('awsAccounts', (store.get('infrastructure', l.infrastructureId) || {}).awsAccountId) || {}).accountName))]) }),
      col('softwareComponents', { exportOnly: true, export: (store, r) => joinList([...new Set(store.find('deployments', (d) => d.applicationId === r.id).map((d) => { const s = store.get('software', d.softwareId); return s ? `${s.product} ${s.version || '?'} (${d.environment})` : d.softwareId; }))]) }),
      ...WORKFLOW_EXPORT,
    ],
    examples: [
      { id: '', name: 'Example Booking Service', description: 'Fictional example row - delete before importing real data', businessOwner: 'A. Example', technicalOwner: 'B. Example', criticality: 'Medium', environments: 'Production; Test', internetFacing: 'yes', businessFunction: 'Digital Channels', notes: '', infrastructureIds: 'INF-001' },
    ],
  },
  software: {
    label: 'Software inventory',
    collection: 'software',
    columns: [
      col('id'), col('vendor'), col('product'), col('category'), col('version'), col('description'), col('cpe'),
      col('verificationStatus'), col('lastReviewed', { kind: 'date' }), col('notes'),
      col('applicationIds', { kind: 'list', relation: true, export: (store, r) => joinList([...new Set(store.find('deployments', (d) => d.softwareId === r.id).map((d) => d.applicationId))]) }),
      col('environment', { relation: true, export: () => '' }),
      col('infrastructureId', { relation: true, export: () => '' }),
      col('deploymentLocation', { relation: true, export: () => '' }),
      col('environments', { exportOnly: true, export: (store, r) => joinList([...new Set(store.find('deployments', (d) => d.softwareId === r.id).map((d) => d.environment))]) }),
      col('deploymentLocations', { exportOnly: true, export: (store, r) => joinList(store.find('deployments', (d) => d.softwareId === r.id).map((d) => d.location)) }),
      ...WORKFLOW_EXPORT,
    ],
    examples: [
      { id: '', vendor: 'Example Vendor Ltd', product: 'Example Gateway', category: 'Middleware', version: '2.4.1', description: 'Fictional example row', cpe: '', verificationStatus: 'Unverified', lastReviewed: '2026-11-01', notes: '', applicationIds: 'APP-002', environment: 'Production', infrastructureId: 'INF-004', deploymentLocation: 'payments-api image' },
    ],
  },
  vulnerabilities: {
    label: 'Vulnerabilities (CVEs)',
    collection: 'vulnerabilities',
    columns: [
      col('id'), col('title'), col('description'), col('published', { kind: 'date' }), col('lastModified', { kind: 'date' }),
      col('cvssScore', { kind: 'number' }), col('cvssVector'), col('severity'), col('vendor'), col('product'),
      col('affectedVersions'), col('fixedVersions'), col('references', { kind: 'list' }),
      col('exploitAvailability'), col('exploitationStatus'), col('remediation'), col('source', { exportOnly: true }),
    ],
    examples: [
      { id: 'CVE-2099-99001', title: 'Example vulnerability (fictional)', description: 'Fictional example row', published: '2026-11-01', lastModified: '2026-11-01', cvssScore: '7.5', cvssVector: '', severity: 'High', vendor: 'Example Vendor Ltd', product: 'Example Gateway', affectedVersions: '>=2.0.0 <2.4.2', fixedVersions: '2.4.2', references: 'https://example.com/advisory', exploitAvailability: 'Unknown', exploitationStatus: 'Unknown', remediation: 'Upgrade to 2.4.2' },
    ],
  },
  infrastructure: {
    label: 'Infrastructure',
    collection: 'infrastructure',
    columns: [
      col('id'), col('name'), col('hostingPlatform'), col('awsAccountId', { hint: 'Record ID (AWS-001) or 12-digit account number' }), col('region'), col('environment'),
      col('clusterType'), col('clusterName'), col('namespace'), col('owner'), col('notes'),
    ],
    examples: [
      { id: '', name: 'Example - test EKS namespace', hostingPlatform: 'Amazon EKS', awsAccountId: '100000000301', region: 'eu-west-2', environment: 'Test', clusterType: 'Kubernetes', clusterName: 'eks-test-euw2-01', namespace: 'example-app', owner: 'Platform Engineering', notes: '' },
    ],
  },
  awsAccounts: {
    label: 'AWS accounts',
    collection: 'awsAccounts',
    columns: [col('id'), col('accountName'), col('accountId'), col('environment'), col('organisationalUnit'), col('owner'), col('notes')],
    examples: [{ id: '', accountName: 'corp-test-example', accountId: '100000000999', environment: 'Test', organisationalUnit: 'Workloads/NonProd', owner: 'Cloud Platform Team', notes: 'Fictional example row' }],
  },
  deployments: {
    label: 'Deployments (application ↔ software links)',
    collection: 'deployments',
    columns: [col('id'), col('applicationId'), col('softwareId'), col('infrastructureId'), col('environment'), col('location'), col('notes')],
    examples: [{ id: '', applicationId: 'APP-007', softwareId: 'SW-012', infrastructureId: 'INF-012', environment: 'Production', location: 'AMI', notes: 'Fictional example row' }],
  },
};

// ------------------------------------------------------------------ export
export function exportRows(type, store, records = null) {
  const spec = IMPORT_TYPES[type];
  const rows = records || store.all(spec.collection);
  const header = spec.columns.map((c) => c.header);
  const body = rows.map((r) => spec.columns.map((c) => {
    if (c.export) return c.export(store, r);
    const v = r[c.field];
    if (c.kind === 'list') return joinList(v);
    if (c.kind === 'bool') return v ? 'yes' : 'no';
    if (c.kind === 'number') return v === null || v === undefined || v === '' ? '' : Number(v);
    return v ?? '';
  }));
  return [header, ...body];
}

export function templateCsv(type) {
  const spec = IMPORT_TYPES[type];
  const cols = spec.columns.filter((c) => !c.exportOnly);
  return toCsv([cols.map((c) => c.header), ...spec.examples.map((e) => cols.map((c) => e[c.header] ?? ''))]);
}

export function exportCsv(type, store, records) {
  return toCsv(exportRows(type, store, records));
}

/** One row per assessment finding (plus CVEs with no inventory match). */
export function assessmentRows(store, results = assessAll(store)) {
  const header = ['CVE', 'Title', 'Severity', 'CVSS', 'Exploitation', 'Overall CVE status', 'Software ID', 'Vendor', 'Product', 'Version',
    'Match type', 'Version check', 'Engine status', 'Analyst status', 'Final status', 'Priority', 'Priority rule', 'Applications',
    'Environments', 'Production', 'Internet-facing production', 'AWS accounts', 'Data quality warnings', 'Verification required', 'Reviewed by', 'Reviewed at'];
  const rows = [header];
  for (const r of results) {
    if (!r.findings.length) {
      rows.push([r.cve.id, r.cve.title, r.cve.severity, r.cve.cvssScore ?? '', r.cve.exploitationStatus, r.summary.status, '', '', '', '', 'none', '', '', '', 'No inventory match', '', '', '', '', '', '', '', '', '', '', '']);
      continue;
    }
    for (const f of r.findings) {
      rows.push([
        r.cve.id, r.cve.title, r.cve.severity, r.cve.cvssScore ?? '', r.cve.exploitationStatus, r.summary.status,
        f.softwareId, f.software.vendor, f.software.product, f.software.version || '(unknown)',
        `${f.match.type} (${f.match.strength})`, f.version.detail, f.computedStatus, f.review ? f.review.status : '', f.status,
        f.priority.level || '', f.priority.reasons.join(' / '),
        joinList(f.impact.applications.map((a) => a.name)), joinList(f.impact.environments), f.impact.production ? 'yes' : 'no',
        f.impact.internetFacingProduction ? 'yes' : 'no', joinList(f.impact.awsAccounts.map((a) => `${a.accountName} (${a.accountId})`)),
        joinList(f.dataQuality.filter((d) => d.level === 'warning').map((d) => d.text)), joinList(f.verification),
        f.review ? f.review.reviewedBy : '', f.review ? f.review.reviewedAt : '',
      ]);
    }
  }
  return rows;
}

// ------------------------------------------------------------------ import
function coerce(colSpec, raw, errors) {
  if (raw === undefined || raw === '') return undefined;
  switch (colSpec.kind) {
    case 'list': return list(raw);
    case 'bool': {
      const b = parseBool(raw);
      if (b === undefined) errors.push(`${colSpec.header}: "${raw}" is not yes/no.`);
      return b;
    }
    case 'number': {
      const n = Number(raw);
      if (Number.isNaN(n)) { errors.push(`${colSpec.header}: "${raw}" is not a number.`); return undefined; }
      return n;
    }
    default: return raw;
  }
}

/**
 * Parse and validate a CSV file without changing any data.
 * @returns {{type, headerErrors:string[], warnings:string[], rows:Array, summary:{total,create,duplicate,error}}}
 */
export function analyseImport(type, text, store) {
  const spec = IMPORT_TYPES[type];
  if (!spec) throw new Error(`Unknown import type ${type}`);
  const schema = SCHEMAS[spec.collection];
  const result = { type, headerErrors: [], warnings: [], rows: [], summary: { total: 0, create: 0, duplicate: 0, error: 0 } };
  let parsed;
  try {
    parsed = parseCsvObjects(text);
  } catch (err) {
    result.headerErrors.push(err.message);
    return result;
  }
  const importable = spec.columns.filter((c) => !c.exportOnly);
  const known = new Set(spec.columns.map((c) => c.header));
  const required = schema.fields.filter((f) => f.required && importable.some((c) => c.field === f.key)).map((f) => f.key);
  const missing = required.filter((h) => !parsed.headers.includes(h));
  if (missing.length) result.headerErrors.push(`Missing required column(s): ${missing.join(', ')}. Download the template for the expected layout.`);
  const unknown = parsed.headers.filter((h) => h && !known.has(h));
  if (unknown.length) result.warnings.push(`Ignored unrecognised column(s): ${unknown.join(', ')}.`);
  if (!parsed.records.length) result.headerErrors.push('The file contains no data rows.');
  if (result.headerErrors.length) return result;

  const seenKeys = new Map();
  const seenIds = new Map();
  for (const rec of parsed.records) {
    const errors = [];
    const warnings = [];
    const data = {};
    const relations = {};
    for (const c of importable) {
      if (!parsed.headers.includes(c.header)) continue;
      const v = coerce(c, rec[c.header], errors);
      if (v === undefined) continue;
      if (c.relation) relations[c.header] = v; else data[c.field] = v;
    }
    if (rec._extraColumns) warnings.push('Row has more cells than headers; extra cells ignored.');

    // Type-specific normalisation
    if (type === 'vulnerabilities' && data.id) data.id = data.id.toUpperCase();
    if (type === 'infrastructure' && data.awsAccountId && /^\d{12}$/.test(data.awsAccountId)) {
      const acct = store.find('awsAccounts', (a) => a.accountId === data.awsAccountId)[0];
      if (acct) data.awsAccountId = acct.id; else errors.push(`AWS account number ${data.awsAccountId} is not in the inventory.`);
    }

    // Duplicate detection
    let existing = null;
    let dupReason = '';
    if (data.id && store.get(spec.collection, data.id)) { existing = store.get(spec.collection, data.id); dupReason = `ID ${data.id} already exists`; }
    const naturalKey = schema.naturalKey ? schema.naturalKey({ ...(existing || {}), ...data }) : null;
    if (!existing && naturalKey && naturalKey.replace(/\|/g, '')) {
      const clash = store.all(spec.collection).find((r) => schema.naturalKey(r) === naturalKey);
      if (clash) { existing = clash; dupReason = `same ${schema.naturalKeyLabel} as ${clash.id}`; }
    }
    if (naturalKey && seenKeys.has(naturalKey)) errors.push(`Duplicate of row ${seenKeys.get(naturalKey)} in this file (${schema.naturalKeyLabel}).`);
    else if (naturalKey) seenKeys.set(naturalKey, rec._row);
    if (data.id && seenIds.has(data.id)) errors.push(`ID ${data.id} appears more than once in this file (row ${seenIds.get(data.id)}).`);
    else if (data.id) seenIds.set(data.id, rec._row);

    // New records with a supplied ID must follow the ID format
    if (!existing && data.id && type !== 'vulnerabilities' && !new RegExp(`^${schema.idPrefix}-\\d+$`).test(data.id)) {
      errors.push(`ID "${data.id}" must look like ${schema.idPrefix}-001, or be left blank to auto-generate.`);
    }

    // Validate the record as it would be stored
    const candidate = existing ? { ...existing, ...data, id: existing.id } : { ...data };
    if (!existing && type === 'vulnerabilities' && candidate.lastModified === undefined) candidate.lastModified = candidate.published;
    const v = validateRecord(spec.collection, candidate, { store, existingId: existing ? existing.id : undefined });
    if (!v.valid) for (const [k, msg] of Object.entries(v.errors)) if (!(existing && k === '_record')) errors.push(msg);

    // Relationship checks
    if (type === 'applications' && relations.infrastructureIds) {
      const bad = relations.infrastructureIds.filter((id) => !store.get('infrastructure', id));
      if (bad.length) errors.push(`Unknown infrastructure ID(s): ${bad.join(', ')}.`);
    }
    if (type === 'software') {
      // Links that already exist (e.g. re-importing an export) need no new deployment.
      const appIds = (relations.applicationIds || []).filter((id) => !(existing && store.find('deployments', (d) => d.softwareId === existing.id && d.applicationId === id).length));
      if (relations.applicationIds) relations.applicationIds = appIds;
      const bad = appIds.filter((id) => !store.get('applications', id));
      if (bad.length) errors.push(`Unknown application ID(s): ${bad.join(', ')}.`);
      const infra = relations.infrastructureId ? store.get('infrastructure', relations.infrastructureId) : null;
      if (relations.infrastructureId && !infra) errors.push(`Unknown infrastructure ID: ${relations.infrastructureId}.`);
      let env = relations.environment;
      if (!env && infra) env = infra.environment;
      if (appIds.length && !env) {
        const envs = new Set(appIds.flatMap((id) => (store.get('applications', id) || {}).environments || []));
        if (envs.size === 1) env = [...envs][0];
        else errors.push('environment is required when linking software to applications that run in several environments.');
      }
      if (env && infra && infra.environment !== env) errors.push(`environment ${env} does not match infrastructure ${infra.id} (${infra.environment}).`);
      if (env) relations.environment = env;
      if (appIds.length && !existing && !data.version) warnings.push('No version supplied - CVE matching will report "Unable to determine".');
    }

    const action = errors.length ? 'error' : existing ? 'duplicate' : 'create';
    result.summary.total += 1;
    result.summary[action] += 1;
    result.rows.push({ rowNumber: rec._row, data, relations, action, existingId: existing ? existing.id : null, duplicateReason: dupReason, errors, warnings });
  }
  return result;
}

/**
 * Apply a previously analysed import.
 * @param {'skip'|'update'} duplicateMode
 */
export async function applyImport(analysis, { duplicateMode = 'skip', session }, store) {
  const spec = IMPORT_TYPES[analysis.type];
  const coll = spec.collection;
  const counts = { created: 0, updated: 0, skipped: 0, errors: 0, links: 0 };
  const wf = ['applications', 'software'].includes(coll);
  await store.transaction(async () => {
    for (const row of analysis.rows) {
      if (row.action === 'error') { counts.errors += 1; continue; }
      if (row.action === 'duplicate' && duplicateMode === 'skip') { counts.skipped += 1; continue; }
      let saved;
      if (row.action === 'duplicate') {
        const existing = store.get(coll, row.existingId);
        const patch = { ...row.data };
        delete patch.id;
        saved = await store.update(coll, existing.id, wf ? onEdit(patch, existing, session) : patch);
        counts.updated += 1;
      } else {
        let data = { ...row.data };
        if (coll === 'vulnerabilities') data = { lastModified: data.published, references: [], source: 'CSV import', ...data };
        if (coll === 'deployments' && !data.environment && data.infrastructureId) data.environment = (store.get('infrastructure', data.infrastructureId) || {}).environment;
        saved = await store.create(coll, wf ? onCreate(data, session) : data);
        counts.created += 1;
      }
      if (coll === 'applications' && row.relations.infrastructureIds) {
        await syncAppInfrastructure(store, saved.id, row.relations.infrastructureIds);
      }
      if (coll === 'software' && row.relations.applicationIds) {
        for (const appId of row.relations.applicationIds) {
          const dep = { applicationId: appId, softwareId: saved.id, infrastructureId: row.relations.infrastructureId || null, environment: row.relations.environment, location: row.relations.deploymentLocation || '' };
          const key = SCHEMAS.deployments.naturalKey(dep);
          if (!store.all('deployments').some((d) => SCHEMAS.deployments.naturalKey(d) === key)) {
            await store.create('deployments', dep);
            counts.links += 1;
          }
        }
      }
    }
  });
  return counts;
}

/** Full workbook (array of sheets) for Excel export. */
export function inventoryWorkbook(store) {
  const results = assessAll(store);
  return [
    { name: 'Applications', rows: exportRows('applications', store) },
    { name: 'Software', rows: exportRows('software', store) },
    { name: 'Deployments', rows: exportRows('deployments', store) },
    { name: 'Infrastructure', rows: exportRows('infrastructure', store) },
    { name: 'AWS accounts', rows: exportRows('awsAccounts', store) },
    { name: 'Vulnerabilities', rows: exportRows('vulnerabilities', store) },
    { name: 'Assessments', rows: assessmentRows(store, results) },
  ];
}
