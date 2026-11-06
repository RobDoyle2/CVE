// Record validation driven by the entity schemas. The same rules should be
// enforced again server-side once a backend exists - browser validation is a
// usability aid, not a security control.
import { SCHEMAS } from '../models/schemas.js';
import { parseRangeExpression } from './version.js';
import { severityFromScore } from '../models/lookups.js';

export class ValidationError extends Error {
  constructor(errors, message = 'Validation failed') {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

function isValidDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function isHttpsUrl(v) {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

const AWS_PLATFORMS = /^(Amazon|AWS|Red Hat OpenShift Service on AWS)/;

/**
 * Validate a record.
 * @param {string} collection
 * @param {object} record
 * @param {{store?: object, existingId?: string}} ctx  store enables reference & uniqueness checks
 * @returns {{valid:boolean, errors:Object<string,string>}}
 */
export function validateRecord(collection, record, ctx = {}) {
  const schema = SCHEMAS[collection];
  if (!schema) throw new Error(`Unknown collection ${collection}`);
  const errors = {};
  const { store, existingId } = ctx;

  for (const f of schema.fields) {
    if (f.system) continue;
    if (f.readonly && !f.userAssignedId) continue;
    const v = record[f.key];
    if (isEmpty(v)) {
      if (f.required) errors[f.key] = `${f.label} is required.`;
      continue;
    }
    switch (f.type) {
      case 'text':
      case 'textarea':
        if (typeof v !== 'string') errors[f.key] = `${f.label} must be text.`;
        else if (f.maxLength && v.length > f.maxLength) errors[f.key] = `${f.label} must be ${f.maxLength} characters or fewer.`;
        else if (f.pattern && !f.pattern.test(v.trim())) errors[f.key] = `${f.label} is not in the expected format. ${f.patternHint || ''}`.trim();
        else if (f.versionExpression) {
          const p = parseRangeExpression(v);
          if (!p.ok) errors[f.key] = `${f.label}: ${p.error}`;
        }
        break;
      case 'select':
        if (!f.options.includes(v)) errors[f.key] = `${f.label} must be one of: ${f.options.join(', ')}.`;
        break;
      case 'multiselect':
        if (!Array.isArray(v)) errors[f.key] = `${f.label} must be a list.`;
        else {
          const bad = v.filter((x) => !f.options.includes(x));
          if (bad.length) errors[f.key] = `${f.label} contains invalid values: ${bad.join(', ')}.`;
        }
        break;
      case 'boolean':
        if (typeof v !== 'boolean') errors[f.key] = `${f.label} must be yes or no.`;
        break;
      case 'number': {
        const n = Number(v);
        if (typeof v === 'boolean' || Number.isNaN(n)) errors[f.key] = `${f.label} must be a number.`;
        else if (f.min !== undefined && n < f.min) errors[f.key] = `${f.label} must be at least ${f.min}.`;
        else if (f.max !== undefined && n > f.max) errors[f.key] = `${f.label} must be at most ${f.max}.`;
        break;
      }
      case 'date':
        if (!isValidDate(v)) errors[f.key] = `${f.label} must be a valid date (YYYY-MM-DD).`;
        break;
      case 'url':
        if (!isHttpsUrl(v)) errors[f.key] = `${f.label} must be a valid https:// URL.`;
        else if (f.maxLength && v.length > f.maxLength) errors[f.key] = `${f.label} is too long.`;
        break;
      case 'urllist': {
        const list = Array.isArray(v) ? v : String(v).split(/\s+/);
        const bad = list.filter((u) => u && !isHttpsUrl(u));
        if (bad.length) errors[f.key] = `Each reference must be an https:// URL (invalid: ${bad.slice(0, 2).join(', ')}).`;
        break;
      }
      case 'ref':
        if (store && !store.get(f.ref, v)) errors[f.key] = `${f.label} "${v}" does not exist.`;
        break;
      default:
        break;
    }
  }

  // Entity-specific business rules
  if (collection === 'infrastructure') {
    if (record.clusterType && record.clusterType !== 'None' && isEmpty(record.clusterName)) {
      errors.clusterName = 'Cluster name is required when a cluster type is selected.';
    }
    if (record.clusterType === 'None' && !isEmpty(record.namespace)) {
      errors.namespace = 'Namespace only applies to Kubernetes or OpenShift infrastructure.';
    }
    if (AWS_PLATFORMS.test(record.hostingPlatform || '')) {
      if (isEmpty(record.awsAccountId)) errors.awsAccountId = 'An AWS account is required for AWS-hosted infrastructure.';
      if (record.region === 'Not applicable') errors.region = 'Select the AWS region for AWS-hosted infrastructure.';
    }
  }
  if (collection === 'vulnerabilities') {
    if (!isEmpty(record.cvssScore) && !errors.cvssScore && record.severity && record.severity !== severityFromScore(record.cvssScore)) {
      errors.severity = `Severity should be ${severityFromScore(record.cvssScore)} for a CVSS score of ${record.cvssScore}.`;
    }
    if (record.published && record.lastModified && !errors.published && !errors.lastModified && record.lastModified < record.published) {
      errors.lastModified = 'Last modified date cannot be before the published date.';
    }
  }

  // Uniqueness of the natural key (e.g. application name, CVE ID)
  if (store && schema.naturalKey && !Object.keys(errors).length) {
    const key = schema.naturalKey(record);
    if (key && key.replace(/\|/g, '') !== '') {
      const clash = store.all(collection).find((r) => r.id !== existingId && schema.naturalKey(r) === key);
      if (clash) {
        errors._record = `A ${schema.label.toLowerCase()} with the same ${schema.naturalKeyLabel || 'key'} already exists (${clash.id}).`;
      }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
