// Impact assessment engine.
//
// Cross-references CVE records against the software inventory using
// deterministic, explainable rules. It produces *findings* with the evidence
// behind them, data-quality gaps and the verification still required.
//
// Design principles (security requirement):
//  - A match is a lead for investigation, never proof of a vulnerability.
//  - The engine never assigns "Confirmed affected"; only a person can.
//  - No probabilities or confidence percentages are produced. Evidence is
//    described qualitatively (strong / moderate / weak) with the reason.
//  - Priorities are rule-based and every rule that fired is listed.

import { evaluateVersion, parseVersion, describeExpression } from './version.js';
import { isProduction, CRITICALITY } from '../models/lookups.js';

export const ENGINE_VERSION = '1.0.0';

export const STATUS_ORDER = [
  'Confirmed affected', 'Potentially affected', 'Requires investigation', 'Unable to determine', 'Not affected',
];
const rank = (s) => {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? 99 : i;
};

export const PRIORITY_LABELS = { P1: 'Immediate', P2: 'High', P3: 'Medium', P4: 'Low' };

// ------------------------------------------------------------ name matching
const normCache = new Map();
export function normaliseName(s) {
  const key = String(s || '');
  let v = normCache.get(key);
  if (v !== undefined) return v;
  v = normaliseNameUncached(key);
  if (normCache.size > 50000) normCache.clear();
  normCache.set(key, v);
  return v;
}

function normaliseNameUncached(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(inc|incorporated|ltd|limited|llc|corp|corporation|co|gmbh|plc|project)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function buildAliasMaps(settings = {}) {
  const vendor = new Map();
  const product = new Map();
  for (const a of settings.productAliases || []) {
    if (a.vendor) vendor.set(normaliseName(a.vendor), normaliseName(a.alias));
    if (a.product) product.set(normaliseName(a.product), normaliseName(a.alias));
  }
  return { vendor, product };
}

const canonical = (map, value) => {
  const n = normaliseName(value);
  return map.get(n) || n;
};

function parseCpe(cpe) {
  const m = String(cpe || '').match(/^cpe:2\.3:[aho]:([^:]+):([^:]+):/);
  return m ? { vendor: normaliseName(m[1].replace(/_/g, ' ')), product: normaliseName(m[2].replace(/_/g, ' ')) } : null;
}

const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);

/**
 * Compare CVE affected vendor/product with a software record.
 * @returns {{type:'exact'|'product'|'partial'|null, strength:'strong'|'moderate'|'weak'|null, evidence:string[]}}
 */
export function matchProduct(cve, sw, aliases = buildAliasMaps()) {
  const cv = canonical(aliases.vendor, cve.vendor);
  const cp = canonical(aliases.product, cve.product);
  const sv = canonical(aliases.vendor, sw.vendor);
  const sp = canonical(aliases.product, sw.product);
  const evidence = [];
  const cpe = parseCpe(sw.cpe);

  const vendorMatch = cv && sv && (cv === sv || (Math.min(cv.length, sv.length) >= 4 && (cv.startsWith(sv) || sv.startsWith(cv))))
    || (cpe && cpe.vendor === cv);
  const productEqual = cp && sp && (cp === sp || (cpe && cpe.product === cp));

  const aliasNote = [];
  if (normaliseName(cve.vendor) !== cv || normaliseName(sw.vendor) !== sv) aliasNote.push('vendor alias');
  if (normaliseName(cve.product) !== cp || normaliseName(sw.product) !== sp) aliasNote.push('product alias');

  if (productEqual && vendorMatch) {
    evidence.push(`Vendor and product match: CVE "${cve.vendor} ${cve.product}" ↔ inventory "${sw.vendor} ${sw.product}"${aliasNote.length ? ` (via ${aliasNote.join(' and ')})` : ''}${cpe && cpe.product === cp ? ' (CPE identifier agrees)' : ''}.`);
    return { type: 'exact', strength: 'strong', evidence };
  }
  if (productEqual) {
    evidence.push(`Product name matches ("${cve.product}") but vendor differs: CVE lists "${cve.vendor}", inventory records "${sw.vendor}".`);
    return { type: 'product', strength: 'moderate', evidence };
  }
  const containment = cp && sp && Math.min(cp.length, sp.length) >= 5 && (cp.includes(sp) || sp.includes(cp));
  const shared = tokens(cve.product).filter((t) => tokens(sw.product).includes(t));
  if (vendorMatch && (containment || shared.length)) {
    evidence.push(`Partial product-name similarity within the same vendor ("${cve.product}" vs "${sw.product}"${shared.length ? `, shared term: ${shared.join(', ')}` : ''}). These may be different products or editions.`);
    return { type: 'partial', strength: 'weak', evidence };
  }
  if (containment && cp.length >= 6) {
    evidence.push(`Product names overlap ("${cve.product}" vs "${sw.product}") but vendors differ. Likely unrelated; listed for completeness.`);
    return { type: 'partial', strength: 'weak', evidence };
  }
  return { type: null, strength: null, evidence };
}

// ------------------------------------------------------------ impact
export function impactForSoftware(store, softwareId, depsBySoftware = null) {
  const deployments = depsBySoftware ? (depsBySoftware.get(softwareId) || []) : store.find('deployments', (d) => d.softwareId === softwareId);
  const appMap = new Map();
  const infra = new Map();
  const accounts = new Map();
  const environments = new Set();
  for (const d of deployments) {
    const app = store.get('applications', d.applicationId);
    const inf = d.infrastructureId ? store.get('infrastructure', d.infrastructureId) : null;
    const acct = inf && inf.awsAccountId ? store.get('awsAccounts', inf.awsAccountId) : null;
    if (d.environment) environments.add(d.environment);
    if (app) {
      if (!appMap.has(app.id)) appMap.set(app.id, { id: app.id, name: app.name, criticality: app.criticality, internetFacing: !!app.internetFacing, reviewStatus: app.reviewStatus, environments: new Set(), deployments: [] });
      const entry = appMap.get(app.id);
      entry.environments.add(d.environment);
      entry.deployments.push({ id: d.id, environment: d.environment, location: d.location, infrastructure: inf ? { id: inf.id, name: inf.name, platform: inf.hostingPlatform, clusterName: inf.clusterName, namespace: inf.namespace, region: inf.region } : null, awsAccount: acct ? { id: acct.id, accountName: acct.accountName, accountId: acct.accountId } : null });
    }
    if (inf) infra.set(inf.id, inf);
    if (acct) accounts.set(acct.id, acct);
  }
  const applications = [...appMap.values()].map((a) => ({
    ...a,
    environments: [...a.environments],
    production: [...a.environments].some(isProduction),
  }));
  const production = [...environments].some(isProduction);
  const prodApps = applications.filter((a) => a.production);
  const critIdx = prodApps.length ? Math.min(...prodApps.map((a) => CRITICALITY.indexOf(a.criticality)).filter((i) => i >= 0)) : -1;
  return {
    deployments,
    applications,
    infrastructure: [...infra.values()],
    awsAccounts: [...accounts.values()],
    environments: [...environments],
    production,
    productionApplications: prodApps.length,
    internetFacingProduction: prodApps.some((a) => a.internetFacing),
    highestProductionCriticality: critIdx >= 0 ? CRITICALITY[critIdx] : null,
  };
}

// ------------------------------------------------------------ data quality
function dataQualityFor(cve, sw, impact, versionEval, settings, now) {
  const dq = [];
  const staleDays = Number(settings.staleReviewDays) || 180;
  if (sw.verificationStatus !== 'Verified') dq.push({ level: 'warning', text: `Software record ${sw.id} is "${sw.verificationStatus || 'unverified'}" - recorded details may be inaccurate.` });
  if (!sw.version) dq.push({ level: 'warning', text: `No version is recorded for ${sw.product} (${sw.id}).` });
  else {
    const pv = parseVersion(sw.version);
    if (!pv) dq.push({ level: 'warning', text: `Version "${sw.version}" could not be interpreted.` });
    else if (pv.nonStandard) dq.push({ level: 'info', text: `Version "${sw.version}" uses a non-standard format; comparison uses heuristics for letter/pre-release suffixes.` });
  }
  if (!sw.lastReviewed) dq.push({ level: 'warning', text: `${sw.id} has never been reviewed.` });
  else {
    const age = Math.floor((now - new Date(`${sw.lastReviewed}T00:00:00Z`).getTime()) / 86400000);
    if (age > staleDays) dq.push({ level: 'warning', text: `${sw.id} was last reviewed ${age} days ago (threshold ${staleDays} days).` });
  }
  if (sw.reviewStatus && sw.reviewStatus !== 'Approved') dq.push({ level: 'info', text: `${sw.id} is a submission with review status "${sw.reviewStatus}".` });
  if (!impact.deployments.length) dq.push({ level: 'warning', text: 'No deployments are recorded for this software, so affected applications are unknown.' });
  const noInfra = impact.deployments.filter((d) => !d.infrastructureId).length;
  if (noInfra) dq.push({ level: 'info', text: `${noInfra} deployment(s) have no infrastructure recorded; AWS account exposure may be incomplete.` });
  for (const a of impact.applications) {
    if (a.reviewStatus && a.reviewStatus !== 'Approved') dq.push({ level: 'info', text: `Application ${a.name} is pending review; its details are unconfirmed.` });
  }
  if (versionEval.result === 'no-range-data') dq.push({ level: 'warning', text: `${cve.id} does not specify affected versions.` });
  if (versionEval.result === 'invalid-range') dq.push({ level: 'warning', text: `${cve.id} affected-versions expression is invalid: ${versionEval.detail}` });
  if (!cve.fixedVersions) dq.push({ level: 'info', text: `${cve.id} has no fixed version recorded.` });
  if (!cve.references || !cve.references.length) dq.push({ level: 'info', text: `${cve.id} has no reference URLs to verify against.` });
  return dq;
}

// ------------------------------------------------------------ status & priority
function computeStatus(match, versionEval) {
  const v = versionEval.result;
  if (match.type === 'exact') {
    if (v === 'in-range') return 'Potentially affected';
    if (v === 'out-of-range') return 'Not affected';
    if (v === 'unknown-version') return 'Unable to determine';
    return 'Requires investigation';
  }
  if (match.type === 'product') {
    if (v === 'out-of-range') return 'Not affected';
    if (v === 'unknown-version') return 'Unable to determine';
    return 'Requires investigation';
  }
  return 'Requires investigation';
}

function verificationFor(status, match, versionEval, cve, sw, impact) {
  const steps = [];
  if (status === 'Potentially affected' || status === 'Confirmed affected') {
    steps.push(`Confirm the installed version of ${sw.product} on each deployment (e.g. container image scan, package manager query, application manifest).`);
    steps.push(`Read the vendor advisory for ${cve.id} and check for configuration or feature preconditions (e.g. module enabled, endpoint exposed).`);
    steps.push('Check whether the vendor or distribution has back-ported a fix into the installed build.');
    if (impact.internetFacingProduction) steps.push('Review compensating controls for internet-facing production exposure (WAF rules, network restrictions).');
  }
  if (status === 'Unable to determine') steps.push(`Record the exact version of ${sw.product} for ${sw.id} in the software inventory, then re-run the assessment.`);
  if (match.type === 'product') steps.push(`Confirm whether the inventory vendor "${sw.vendor}" supplies the same product as "${cve.vendor}" (packaged/redistributed builds are common).`);
  if (match.type === 'partial') steps.push(`Confirm whether "${sw.product}" is the same product/edition as "${cve.product}".`);
  if (versionEval.result === 'no-range-data' || versionEval.result === 'invalid-range') steps.push(`Obtain the affected and fixed versions for ${cve.id} from the vendor advisory and update the CVE record.`);
  if (!impact.deployments.length) steps.push(`Identify which applications use ${sw.product} ${sw.version || ''} and record deployments.`);
  if (status === 'Not affected' && !steps.length) steps.push('No action required unless the recorded version is out of date. Confirm the inventory version is current.');
  if (status !== 'Not affected') steps.push('Record the outcome as an analyst decision (Confirmed affected / Not affected) with supporting evidence.');
  return steps;
}

const EXPLOITED = ['Known exploited (CISA KEV)', 'Exploitation reported'];

export function priorityFor(status, cve, impact) {
  const affected = status === 'Confirmed affected' || status === 'Potentially affected';
  const uncertain = status === 'Requires investigation' || status === 'Unable to determine';
  if (!affected && !uncertain) return { level: null, label: null, reasons: [] };
  const exploited = EXPLOITED.includes(cve.exploitationStatus);
  const sevHigh = cve.severity === 'Critical' || cve.severity === 'High';
  const prod = impact.production;
  const reasons = [];
  const facts = [
    `status: ${status}`,
    `severity: ${cve.severity}`,
    exploited ? `exploitation: ${cve.exploitationStatus}` : 'not known to be exploited',
    prod ? 'production deployment' : 'non-production only',
    impact.internetFacingProduction ? 'internet-facing production application' : null,
  ].filter(Boolean);
  let level;
  if (affected && prod && (exploited || (cve.severity === 'Critical' && impact.internetFacingProduction))) {
    level = 'P1';
    reasons.push(exploited ? 'Rule P1-a: affected + production + exploitation reported/known' : 'Rule P1-b: affected + production + critical severity + internet-facing');
  } else if ((affected && prod && sevHigh) || (exploited && prod && uncertain)) {
    level = 'P2';
    reasons.push(affected ? 'Rule P2-a: affected + production + critical/high severity' : 'Rule P2-b: exploited vulnerability with unresolved production match');
  } else if (affected || (uncertain && prod && (sevHigh || exploited))) {
    level = 'P3';
    reasons.push(affected ? 'Rule P3-a: affected in non-production or lower severity' : 'Rule P3-b: unresolved match on production with high severity');
  } else {
    level = 'P4';
    reasons.push('Rule P4: unresolved match with limited exposure');
  }
  return { level, label: PRIORITY_LABELS[level], reasons, facts };
}

// ------------------------------------------------------------ main API
/**
 * Assess a single CVE against a single software record.
 * Returns null when there is no product relationship worth reporting.
 */
export function assessPair(cve, sw, { store, aliases, settings = {}, reviews = [], now = Date.now(), cache = null }) {
  const match = matchProduct(cve, sw, aliases);
  if (!match.type) return null;
  const versionEval = evaluateVersion(sw.version, cve.affectedVersions);
  if (match.type === 'partial' && versionEval.result === 'out-of-range') return null;
  let impact;
  if (cache) {
    impact = cache.impact.get(sw.id);
    if (!impact) { impact = impactForSoftware(store, sw.id, cache.depsBySoftware); cache.impact.set(sw.id, impact); }
  } else {
    impact = impactForSoftware(store, sw.id);
  }
  const computedStatus = computeStatus(match, versionEval);
  const review = (cache ? cache.reviews.get(`${cve.id}|${sw.id}`) : reviews.find((r) => r.cveId === cve.id && r.softwareId === sw.id)) || null;
  const status = review ? review.status : computedStatus;

  const evidence = [];
  for (const e of match.evidence) evidence.push({ kind: 'match', strength: match.strength, text: e });
  const vText = {
    'in-range': { kind: 'supports', text: versionEval.detail },
    'out-of-range': { kind: 'against', text: versionEval.detail },
    'unknown-version': { kind: 'gap', text: versionEval.detail },
    'no-range-data': { kind: 'gap', text: versionEval.detail },
    'invalid-range': { kind: 'gap', text: versionEval.detail },
  }[versionEval.result];
  evidence.push({ kind: vText.kind, strength: null, text: `Version check: ${vText.text}` });
  if (cve.fixedVersions) evidence.push({ kind: 'info', strength: null, text: `Vendor fixed version(s): ${cve.fixedVersions}.` });
  if (impact.applications.length) {
    evidence.push({ kind: 'info', strength: null, text: `Deployed in ${impact.applications.length} application(s) across ${impact.environments.join(', ') || 'unknown environments'}.` });
  }
  if (review) {
    evidence.push({ kind: 'review', strength: null, text: `Analyst decision by ${review.reviewedBy} on ${String(review.reviewedAt).slice(0, 10)}: ${review.status}. ${review.rationale}` });
  }

  const dataQuality = dataQualityFor(cve, sw, impact, versionEval, settings, now);
  let reviewStale = false;
  if (review && cve.lastModified && String(cve.lastModified) > String(review.reviewedAt).slice(0, 10)) {
    reviewStale = true;
    dataQuality.unshift({ level: 'warning', text: `${cve.id} was modified (${cve.lastModified}) after the analyst decision - re-review recommended.` });
  }

  return {
    cveId: cve.id,
    softwareId: sw.id,
    software: { id: sw.id, vendor: sw.vendor, product: sw.product, version: sw.version, category: sw.category, verificationStatus: sw.verificationStatus },
    match: { type: match.type, strength: match.strength },
    version: versionEval,
    affectedVersions: describeExpression(cve.affectedVersions || ''),
    computedStatus,
    status,
    reviewed: !!review,
    review,
    reviewStale,
    evidence,
    dataQuality,
    verification: verificationFor(status, match, versionEval, cve, sw, impact),
    impact,
    priority: priorityFor(status, cve, impact),
  };
}

/**
 * Index software by canonical vendor/product so each CVE is only compared
 * with plausible candidates instead of the whole inventory.
 */
export function buildSoftwareIndex(software, aliases) {
  const byProduct = new Map();
  const byVendor = new Map();
  const push = (map, k, e) => { if (!k) return; if (!map.has(k)) map.set(k, []); map.get(k).push(e); };
  for (const sw of software) {
    const p = canonical(aliases.product, sw.product);
    const v = canonical(aliases.vendor, sw.vendor);
    const cpe = parseCpe(sw.cpe);
    push(byProduct, p, sw);
    push(byVendor, v, sw);
    if (cpe) { push(byProduct, cpe.product, sw); push(byVendor, cpe.vendor, sw); }
  }
  return { byProduct, byVendor, productKeys: [...byProduct.keys()], vendorKeys: [...byVendor.keys()] };
}

function candidatesFor(cve, index, aliases) {
  const cv = canonical(aliases.vendor, cve.vendor);
  const cp = canonical(aliases.product, cve.product);
  const out = new Set(index.byProduct.get(cp) || []);
  for (const vk of index.vendorKeys) {
    if (vk === cv || (cv && Math.min(vk.length, cv.length) >= 4 && (vk.startsWith(cv) || cv.startsWith(vk)))) {
      for (const sw of index.byVendor.get(vk)) out.add(sw);
    }
  }
  if (cp && cp.length >= 5) {
    for (const pk of index.productKeys) {
      if (pk !== cp && pk.length >= 5 && (pk.includes(cp) || cp.includes(pk))) for (const sw of index.byProduct.get(pk)) out.add(sw);
    }
  }
  return out;
}

function prepareContext(store, opts = {}) {
  const settings = opts.settings || store.getSettings();
  const aliases = opts.aliases || buildAliasMaps(settings);
  const reviewList = opts.reviews || store.all('assessmentReviews');
  const depsBySoftware = new Map();
  for (const d of store.all('deployments')) {
    if (!depsBySoftware.has(d.softwareId)) depsBySoftware.set(d.softwareId, []);
    depsBySoftware.get(d.softwareId).push(d);
  }
  return {
    settings,
    aliases,
    reviews: reviewList,
    now: opts.now || Date.now(),
    index: opts.index || buildSoftwareIndex(store.all('software'), aliases),
    cache: { impact: new Map(), depsBySoftware, reviews: new Map(reviewList.map((r) => [`${r.cveId}|${r.softwareId}`, r])) },
  };
}

/** Assess one CVE against the whole inventory. */
export function assessCve(cve, store, opts = {}) {
  const ctx = opts.cache ? opts : prepareContext(store, opts);
  const findings = [];
  for (const sw of candidatesFor(cve, ctx.index, ctx.aliases)) {
    const f = assessPair(cve, sw, { store, ...ctx });
    if (f) findings.push(f);
  }
  findings.sort((a, b) => rank(a.status) - rank(b.status) || a.softwareId.localeCompare(b.softwareId));
  return { cve, findings, summary: summarise(cve, findings) };
}

function summarise(cve, findings) {
  const relevant = findings.filter((f) => f.status !== 'Not affected');
  const status = findings.length ? findings.reduce((best, f) => (rank(f.status) < rank(best) ? f.status : best), 'Not affected') : 'No inventory match';
  const apps = new Map();
  const accounts = new Map();
  const infra = new Map();
  for (const f of relevant) {
    for (const a of f.impact.applications) {
      const prev = apps.get(a.id);
      if (!prev || rank(f.status) < rank(prev.status)) apps.set(a.id, { ...a, status: f.status });
    }
    for (const ac of f.impact.awsAccounts) accounts.set(ac.id, ac);
    for (const i of f.impact.infrastructure) infra.set(i.id, i);
  }
  const prioritised = relevant.map((f) => f.priority.level).filter(Boolean).sort();
  const appList = [...apps.values()];
  return {
    status,
    priority: prioritised[0] || null,
    priorityLabel: prioritised[0] ? PRIORITY_LABELS[prioritised[0]] : null,
    matchedSoftware: findings.length,
    relevantFindings: relevant.length,
    applications: appList,
    productionApplications: appList.filter((a) => a.production),
    internetFacingProduction: appList.some((a) => a.production && a.internetFacing),
    awsAccounts: [...accounts.values()],
    infrastructure: [...infra.values()],
    dataQualityIssues: relevant.reduce((n, f) => n + f.dataQuality.filter((d) => d.level === 'warning').length, 0),
    unreviewed: relevant.filter((f) => !f.reviewed).length,
    staleReviews: findings.filter((f) => f.reviewStale).length,
  };
}

/** Assess every CVE. Returns an array of {cve, findings, summary}. */
export function assessAll(store, opts = {}) {
  const ctx = prepareContext(store, opts);
  return store.all('vulnerabilities').map((cve) => assessCve(cve, store, ctx));
}

/** Findings that involve a particular application. */
export function findingsForApplication(results, appId) {
  const out = [];
  for (const r of results) {
    for (const f of r.findings) {
      if (f.impact.applications.some((a) => a.id === appId)) out.push({ cve: r.cve, finding: f });
    }
  }
  return out.sort((a, b) => rank(a.finding.status) - rank(b.finding.status));
}

export function findingsForSoftware(results, softwareId) {
  const out = [];
  for (const r of results) for (const f of r.findings) if (f.softwareId === softwareId) out.push({ cve: r.cve, finding: f });
  return out.sort((a, b) => rank(a.finding.status) - rank(b.finding.status));
}

/** Small cache so several widgets on one page do not recompute. */
let cache = { key: null, value: null };
export function cachedAssessAll(store) {
  const key = store.snapshot;
  const stamp = store.all('auditLog').length + ':' + store.all('vulnerabilities').length + ':' + store.all('software').length + ':' + store.all('deployments').length + ':' + store.all('assessmentReviews').length + ':' + (store.snapshot.savedAt || '');
  if (cache.key === key && cache.stamp === stamp) return cache.value;
  const value = assessAll(store);
  cache = { key, stamp, value };
  return value;
}
