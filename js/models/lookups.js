// Controlled vocabularies. In a database these become reference tables or
// CHECK constraints; keeping them in one place makes that migration simple.

export const ENVIRONMENTS = ['Production', 'Staging', 'Test', 'Development'];
export const PRODUCTION_ENVIRONMENTS = ['Production'];

export const CRITICALITY = ['Critical', 'High', 'Medium', 'Low'];

export const BUSINESS_FUNCTIONS = [
  'Customer Service', 'Payments', 'Claims', 'Finance', 'Human Resources',
  'Identity & Access', 'Data & Analytics', 'Collaboration', 'Risk & Fraud',
  'Digital Channels', 'Shared Platform', 'Other',
];

export const HOSTING_PLATFORMS = [
  'Amazon EKS', 'Amazon ECS', 'Amazon EC2', 'AWS Lambda', 'Amazon RDS',
  'Red Hat OpenShift Service on AWS (ROSA)', 'OpenShift (on-premises)',
  'Kubernetes (self-managed)', 'On-premises server', 'SaaS', 'Other',
];

export const CLUSTER_TYPES = ['None', 'Kubernetes', 'OpenShift'];

export const AWS_REGIONS = [
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ap-southeast-1',
  'ap-southeast-2', 'ap-northeast-1', 'ca-central-1', 'Not applicable',
];

export const SOFTWARE_CATEGORIES = [
  'Operating system', 'Database', 'Middleware', 'Web server', 'Programming language',
  'Framework', 'Container image', 'Library / dependency', 'Kubernetes component',
  'OpenShift component', 'Security product', 'Other',
];

export const VERIFICATION_STATUSES = ['Verified', 'Unverified', 'Needs review'];

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'None'];

export const EXPLOIT_AVAILABILITY = ['Public exploit', 'Proof of concept', 'No known exploit', 'Unknown'];
export const EXPLOITATION_STATUS = ['Known exploited (CISA KEV)', 'Exploitation reported', 'Not known to be exploited', 'Unknown'];

// Assessment statuses (Prompt 3). "Confirmed affected" can only be set by a
// person; the engine never assigns it on its own.
export const ASSESSMENT_STATUSES = [
  'Confirmed affected',
  'Potentially affected',
  'Requires investigation',
  'Unable to determine',
  'Not affected',
];

export const REVIEW_STATUSES = ['Draft', 'Pending review', 'Approved', 'Changes requested', 'Rejected'];

export const SOURCE_TYPES = [
  'NVD API', 'CISA KEV catalogue', 'Vendor advisory (JSON/CSAF)', 'Vendor advisory (web page)',
  'RSS / Atom feed', 'Security bulletin (email/web)', 'Other approved source',
];

export const MONITORING_FREQUENCIES = ['Hourly', 'Every 6 hours', 'Daily', 'Weekly', 'Manual only'];

export const ROLES = {
  Administrator: { label: 'Administrator', can: ['read', 'write', 'delete', 'review', 'admin', 'import'] },
  'Security Analyst': { label: 'Security Analyst', can: ['read', 'write', 'delete', 'review', 'import'] },
  Contributor: { label: 'Contributor', can: ['read', 'submit'] },
  Viewer: { label: 'Viewer', can: ['read'] },
};

export function severityFromScore(score) {
  const s = Number(score);
  if (Number.isNaN(s) || score === '' || score === null || score === undefined) return 'None';
  if (s >= 9) return 'Critical';
  if (s >= 7) return 'High';
  if (s >= 4) return 'Medium';
  if (s > 0) return 'Low';
  return 'None';
}

export function isProduction(env) {
  return PRODUCTION_ENVIRONMENTS.includes(env);
}
