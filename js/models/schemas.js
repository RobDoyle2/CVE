// Entity schemas: the single source of truth for field definitions.
// Used by forms, validation, CSV templates/import and documentation, and
// designed to map directly onto relational tables (see docs/DATA_MODEL.md).
import {
  ENVIRONMENTS, CRITICALITY, BUSINESS_FUNCTIONS, HOSTING_PLATFORMS, CLUSTER_TYPES,
  AWS_REGIONS, SOFTWARE_CATEGORIES, VERIFICATION_STATUSES, SEVERITIES,
  EXPLOIT_AVAILABILITY, EXPLOITATION_STATUS, ASSESSMENT_STATUSES, REVIEW_STATUSES,
  SOURCE_TYPES, MONITORING_FREQUENCIES,
} from './lookups.js';

// Workflow / provenance fields shared by records that team members can submit.
const WORKFLOW_FIELDS = [
  { key: 'submittedBy', label: 'Submitted by', type: 'text', system: true },
  { key: 'submittedDate', label: 'Submission date', type: 'date', system: true },
  { key: 'reviewStatus', label: 'Review status', type: 'select', options: REVIEW_STATUSES, system: true },
  { key: 'reviewedBy', label: 'Reviewed by', type: 'text', system: true },
  { key: 'lastModified', label: 'Last modified', type: 'datetime', system: true },
];

export const SCHEMAS = {
  applications: {
    label: 'Application', plural: 'Applications', idPrefix: 'APP', idPad: 3,
    naturalKey: (r) => (r.name || '').trim().toLowerCase(),
    naturalKeyLabel: 'application name',
    fields: [
      { key: 'id', label: 'Application ID', type: 'text', readonly: true, pattern: /^APP-\d{3,}$/, patternHint: 'Format APP-001' },
      { key: 'name', label: 'Application name', type: 'text', required: true, maxLength: 120 },
      { key: 'description', label: 'Description', type: 'textarea', maxLength: 2000, full: true },
      { key: 'businessOwner', label: 'Business owner', type: 'text', required: true, maxLength: 120 },
      { key: 'technicalOwner', label: 'Technical owner', type: 'text', required: true, maxLength: 120 },
      { key: 'criticality', label: 'Business criticality', type: 'select', options: CRITICALITY, required: true },
      { key: 'environments', label: 'Environment classification', type: 'multiselect', options: ENVIRONMENTS, required: true, hint: 'Select every environment the application runs in.' },
      { key: 'internetFacing', label: 'Internet-facing', type: 'boolean' },
      { key: 'businessFunction', label: 'Business function', type: 'select', options: BUSINESS_FUNCTIONS, required: true },
      { key: 'notes', label: 'Notes', type: 'textarea', maxLength: 4000, full: true },
      ...WORKFLOW_FIELDS,
    ],
  },

  awsAccounts: {
    label: 'AWS account', plural: 'AWS accounts', idPrefix: 'AWS', idPad: 3,
    naturalKey: (r) => String(r.accountId || '').trim(),
    naturalKeyLabel: 'AWS account identifier',
    fields: [
      { key: 'id', label: 'Record ID', type: 'text', readonly: true },
      { key: 'accountName', label: 'AWS account name', type: 'text', required: true, maxLength: 80 },
      { key: 'accountId', label: 'AWS account identifier', type: 'text', required: true, pattern: /^\d{12}$/, patternHint: 'Exactly 12 digits (use fictional values)' },
      { key: 'environment', label: 'Environment', type: 'select', options: ENVIRONMENTS, required: true },
      { key: 'organisationalUnit', label: 'Organisational unit', type: 'text', maxLength: 80 },
      { key: 'owner', label: 'Account owner', type: 'text', required: true, maxLength: 120 },
      { key: 'notes', label: 'Notes', type: 'textarea', maxLength: 2000, full: true },
    ],
  },

  infrastructure: {
    label: 'Infrastructure', plural: 'Infrastructure', idPrefix: 'INF', idPad: 3,
    naturalKey: (r) => (r.name || '').trim().toLowerCase(),
    naturalKeyLabel: 'infrastructure name',
    fields: [
      { key: 'id', label: 'Infrastructure ID', type: 'text', readonly: true },
      { key: 'name', label: 'Name', type: 'text', required: true, maxLength: 120, hint: 'A deployment target, e.g. a cluster namespace, EC2 estate or ECS service.' },
      { key: 'hostingPlatform', label: 'Hosting platform', type: 'select', options: HOSTING_PLATFORMS, required: true },
      { key: 'awsAccountId', label: 'AWS account', type: 'ref', ref: 'awsAccounts', hint: 'Leave blank for non-AWS hosting.' },
      { key: 'region', label: 'AWS region', type: 'select', options: AWS_REGIONS, required: true },
      { key: 'environment', label: 'Environment', type: 'select', options: ENVIRONMENTS, required: true },
      { key: 'clusterType', label: 'Cluster type', type: 'select', options: CLUSTER_TYPES, required: true },
      { key: 'clusterName', label: 'Kubernetes / OpenShift cluster', type: 'text', maxLength: 80 },
      { key: 'namespace', label: 'Namespace / project', type: 'text', maxLength: 63, pattern: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, patternHint: 'Lower-case letters, digits and hyphens (Kubernetes naming rules)' },
      { key: 'owner', label: 'Infrastructure owner', type: 'text', required: true, maxLength: 120 },
      { key: 'notes', label: 'Notes', type: 'textarea', maxLength: 2000, full: true },
    ],
  },

  // Join table: application <-> infrastructure (many-to-many).
  applicationInfrastructure: {
    label: 'Application infrastructure link', plural: 'Application infrastructure links', idPrefix: 'LNK', idPad: 4,
    naturalKey: (r) => `${r.applicationId}|${r.infrastructureId}`,
    fields: [
      { key: 'id', label: 'Link ID', type: 'text', readonly: true },
      { key: 'applicationId', label: 'Application', type: 'ref', ref: 'applications', required: true },
      { key: 'infrastructureId', label: 'Infrastructure', type: 'ref', ref: 'infrastructure', required: true },
    ],
  },

  // A software component is a vendor + product + *version*. Different versions
  // are separate records so each application/environment can reference the
  // exact version it runs.
  software: {
    label: 'Software component', plural: 'Software components', idPrefix: 'SW', idPad: 3,
    naturalKey: (r) => [r.vendor, r.product, r.version].map((v) => String(v || '').trim().toLowerCase()).join('|'),
    naturalKeyLabel: 'vendor + product + version',
    fields: [
      { key: 'id', label: 'Software ID', type: 'text', readonly: true },
      { key: 'vendor', label: 'Manufacturer / vendor', type: 'text', required: true, maxLength: 120 },
      { key: 'product', label: 'Product name', type: 'text', required: true, maxLength: 120 },
      { key: 'category', label: 'Product type', type: 'select', options: SOFTWARE_CATEGORIES, required: true },
      { key: 'version', label: 'Version', type: 'text', maxLength: 60, hint: 'Exact version string. Leave blank only if genuinely unknown - this will be flagged.' },
      { key: 'description', label: 'Software description', type: 'textarea', maxLength: 2000, full: true },
      { key: 'cpe', label: 'CPE identifier (optional)', type: 'text', maxLength: 255, pattern: /^cpe:2\.3:[aho]:/, patternHint: 'CPE 2.3 format, e.g. cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*' },
      { key: 'verificationStatus', label: 'Verification status', type: 'select', options: VERIFICATION_STATUSES, required: true },
      { key: 'lastReviewed', label: 'Last reviewed date', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea', maxLength: 2000, full: true },
      ...WORKFLOW_FIELDS,
    ],
  },

  // Join table: application <-> software, optionally pinned to infrastructure.
  // Captures "same application, different version per environment".
  deployments: {
    label: 'Deployment', plural: 'Deployments', idPrefix: 'DEP', idPad: 4,
    naturalKey: (r) => `${r.applicationId}|${r.softwareId}|${r.infrastructureId || ''}|${r.environment || ''}`,
    fields: [
      { key: 'id', label: 'Deployment ID', type: 'text', readonly: true },
      { key: 'applicationId', label: 'Application', type: 'ref', ref: 'applications', required: true },
      { key: 'softwareId', label: 'Software component', type: 'ref', ref: 'software', required: true },
      { key: 'infrastructureId', label: 'Infrastructure', type: 'ref', ref: 'infrastructure' },
      { key: 'environment', label: 'Environment', type: 'select', options: ENVIRONMENTS, required: true },
      { key: 'location', label: 'Installation / deployment location', type: 'text', maxLength: 255, hint: 'e.g. container image path, host group, install directory' },
      { key: 'notes', label: 'Notes', type: 'textarea', maxLength: 1000, full: true },
    ],
  },

  vulnerabilities: {
    label: 'Vulnerability', plural: 'Vulnerabilities', idPrefix: 'CVE', idField: 'id',
    naturalKey: (r) => String(r.id || '').trim().toUpperCase(),
    naturalKeyLabel: 'CVE identifier',
    fields: [
      { key: 'id', label: 'CVE identifier', type: 'text', required: true, pattern: /^CVE-\d{4}-\d{4,}$/, patternHint: 'Format CVE-YYYY-NNNN', userAssignedId: true },
      { key: 'title', label: 'Vulnerability title', type: 'text', required: true, maxLength: 200 },
      { key: 'description', label: 'Description', type: 'textarea', required: true, maxLength: 8000, full: true },
      { key: 'published', label: 'Published date', type: 'date', required: true },
      { key: 'lastModified', label: 'Last modified date', type: 'date' },
      { key: 'cvssScore', label: 'CVSS score', type: 'number', min: 0, max: 10, step: 0.1 },
      { key: 'cvssVector', label: 'CVSS vector', type: 'text', maxLength: 200 },
      { key: 'severity', label: 'CVSS severity', type: 'select', options: SEVERITIES, required: true },
      { key: 'vendor', label: 'Affected manufacturer', type: 'text', required: true, maxLength: 120 },
      { key: 'product', label: 'Affected product', type: 'text', required: true, maxLength: 120 },
      { key: 'affectedVersions', label: 'Affected versions', type: 'text', maxLength: 500, versionExpression: true, hint: 'Ranges e.g. ">=2.0.0 <2.17.1 || =1.2.3". Use "*" for all versions; leave blank if unknown.' },
      { key: 'fixedVersions', label: 'Fixed versions', type: 'text', maxLength: 300, hint: 'Comma-separated, e.g. 2.17.1, 2.12.4' },
      { key: 'references', label: 'Reference URLs', type: 'urllist', full: true, hint: 'One https:// URL per line' },
      { key: 'exploitAvailability', label: 'Exploit availability', type: 'select', options: EXPLOIT_AVAILABILITY, required: true },
      { key: 'exploitationStatus', label: 'Known exploitation status', type: 'select', options: EXPLOITATION_STATUS, required: true },
      { key: 'remediation', label: 'Remediation information', type: 'textarea', maxLength: 4000, full: true },
      { key: 'source', label: 'Source', type: 'text', maxLength: 120, system: true },
      { key: 'nvdStatus', label: 'NVD analysis status', type: 'text', system: true },
      { key: 'affectedProducts', label: 'Affected products relevant to the inventory', type: 'json', system: true },
      { key: 'affectedProductsTotal', label: 'Total affected products listed by NVD', type: 'number', system: true },
    ],
  },

  // Analyst decisions on engine findings. The engine computes; people decide.
  assessmentReviews: {
    label: 'Assessment review', plural: 'Assessment reviews', idPrefix: 'REV', idPad: 4,
    naturalKey: (r) => `${r.cveId}|${r.softwareId}`,
    fields: [
      { key: 'id', label: 'Review ID', type: 'text', readonly: true },
      { key: 'cveId', label: 'CVE', type: 'ref', ref: 'vulnerabilities', required: true },
      { key: 'softwareId', label: 'Software component', type: 'ref', ref: 'software', required: true },
      { key: 'status', label: 'Assessment status', type: 'select', options: ASSESSMENT_STATUSES, required: true },
      { key: 'rationale', label: 'Rationale / evidence', type: 'textarea', required: true, maxLength: 4000, full: true },
      { key: 'reviewedBy', label: 'Reviewed by', type: 'text', system: true },
      { key: 'reviewedAt', label: 'Reviewed at', type: 'datetime', system: true },
    ],
  },

  monitoringSources: {
    label: 'Monitoring source', plural: 'Monitoring sources', idPrefix: 'SRC', idPad: 3,
    naturalKey: (r) => String(r.url || '').trim().toLowerCase(),
    naturalKeyLabel: 'website URL',
    fields: [
      { key: 'id', label: 'Source ID', type: 'text', readonly: true },
      { key: 'name', label: 'Source name', type: 'text', required: true, maxLength: 120 },
      { key: 'url', label: 'Website / feed URL', type: 'url', required: true, maxLength: 500 },
      { key: 'type', label: 'Source type', type: 'select', options: SOURCE_TYPES, required: true },
      { key: 'frequency', label: 'Monitoring frequency', type: 'select', options: MONITORING_FREQUENCIES, required: true },
      { key: 'enabled', label: 'Enabled', type: 'boolean' },
      { key: 'vendorScope', label: 'Vendor / product scope', type: 'text', maxLength: 200, hint: 'Optional - limit to these vendors/products (comma-separated)' },
      { key: 'lastSuccessfulCheck', label: 'Last successful check', type: 'datetime', system: true },
      { key: 'lastDetectedUpdate', label: 'Last detected update', type: 'datetime', system: true },
      { key: 'lastStatus', label: 'Last check result', type: 'text', system: true },
      { key: 'feedUrl', label: 'Published feed file (same site)', type: 'text', maxLength: 200, pattern: /^(?!.*\.\.)[a-z0-9][a-z0-9_\-./]*\.json$/i, patternHint: 'Relative path to a JSON file on this site, e.g. feeds/nvd/index.json', hint: 'For NVD: the index produced by the scheduled GitHub Actions fetch. Leave blank to use the bundled demonstration feed.' },
      { key: 'demoFeed', label: 'Demonstration feed file', type: 'text', system: true },
      { key: 'feedCheckpoint', label: 'Feed imported up to', type: 'datetime', system: true },
      { key: 'notes', label: 'Notes', type: 'textarea', maxLength: 2000, full: true },
    ],
  },

  notifications: {
    label: 'Notification', plural: 'Notifications', idPrefix: 'NTF', idPad: 4,
    fields: [
      { key: 'id', label: 'ID', type: 'text', readonly: true },
      { key: 'createdAt', label: 'Created', type: 'datetime' },
      { key: 'level', label: 'Level', type: 'text' },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'message', label: 'Message', type: 'text' },
      { key: 'link', label: 'Link', type: 'text' },
      { key: 'audience', label: 'Audience', type: 'text' },
      { key: 'read', label: 'Read', type: 'boolean' },
    ],
  },

  users: {
    label: 'User', plural: 'Users', idPrefix: 'USR', idPad: 2,
    fields: [
      { key: 'id', label: 'User ID', type: 'text', readonly: true },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'role', label: 'Role', type: 'text', required: true },
      { key: 'team', label: 'Team', type: 'text' },
    ],
  },

  auditLog: {
    label: 'Audit entry', plural: 'Audit log', idPrefix: 'AUD', idPad: 6,
    fields: [
      { key: 'id', label: 'ID', type: 'text', readonly: true },
      { key: 'timestamp', label: 'Timestamp', type: 'datetime' },
      { key: 'user', label: 'User', type: 'text' },
      { key: 'action', label: 'Action', type: 'text' },
      { key: 'collection', label: 'Collection', type: 'text' },
      { key: 'recordId', label: 'Record', type: 'text' },
      { key: 'summary', label: 'Summary', type: 'text' },
    ],
  },

  settings: {
    label: 'Settings', plural: 'Settings', idPrefix: 'SET',
    fields: [{ key: 'id', label: 'ID', type: 'text', readonly: true }],
  },
};

// Referential integrity rules (become FOREIGN KEY constraints in a database).
export const RELATIONS = [
  { collection: 'applicationInfrastructure', field: 'applicationId', target: 'applications', onDelete: 'cascade' },
  { collection: 'applicationInfrastructure', field: 'infrastructureId', target: 'infrastructure', onDelete: 'cascade' },
  { collection: 'deployments', field: 'applicationId', target: 'applications', onDelete: 'cascade' },
  { collection: 'deployments', field: 'softwareId', target: 'software', onDelete: 'cascade' },
  { collection: 'deployments', field: 'infrastructureId', target: 'infrastructure', onDelete: 'nullify' },
  { collection: 'infrastructure', field: 'awsAccountId', target: 'awsAccounts', onDelete: 'restrict' },
  { collection: 'assessmentReviews', field: 'softwareId', target: 'software', onDelete: 'cascade' },
  { collection: 'assessmentReviews', field: 'cveId', target: 'vulnerabilities', onDelete: 'cascade' },
];

export const COLLECTIONS = Object.keys(SCHEMAS);

export function fieldsFor(collection, { includeSystem = false } = {}) {
  const schema = SCHEMAS[collection];
  if (!schema) throw new Error(`Unknown collection: ${collection}`);
  return schema.fields.filter((f) => includeSystem || !f.system);
}
