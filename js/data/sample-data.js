// FICTIONAL SAMPLE DATA ONLY.
// Product names are real, well-known software so that the matching logic can
// be demonstrated realistically, but every CVE identifier (CVE-2099-xxxxx),
// vulnerability, account number, person and application below is invented.

const SAMPLE_NOTE = 'Fictional sample record for demonstration purposes.';

export const SAMPLE_USERS = [
  { id: 'USR-01', name: 'Alex Morgan', email: 'alex.morgan@example.com', role: 'Administrator', team: 'Security Operations' },
  { id: 'USR-02', name: 'Priya Shah', email: 'priya.shah@example.com', role: 'Security Analyst', team: 'Vulnerability Management' },
  { id: 'USR-03', name: 'Jordan Lee', email: 'jordan.lee@example.com', role: 'Contributor', team: 'Digital Channels' },
  { id: 'USR-04', name: 'Sam Taylor', email: 'sam.taylor@example.com', role: 'Viewer', team: 'Risk & Compliance' },
];

const approved = (submittedBy, submittedDate, reviewedBy = 'Priya Shah') => ({
  submittedBy, submittedDate, reviewStatus: 'Approved', reviewedBy,
});

const applications = [
  { id: 'APP-001', name: 'Customer Portal', description: 'Public web portal where customers manage accounts, documents and preferences.', businessOwner: 'Dana Whitfield', technicalOwner: 'Marcus Chen', criticality: 'Critical', environments: ['Production', 'Staging', 'Development'], internetFacing: true, businessFunction: 'Digital Channels', notes: SAMPLE_NOTE, ...approved('Jordan Lee', '2026-03-02') },
  { id: 'APP-002', name: 'Payments Gateway', description: 'Processes card and bank-transfer payments for all customer channels.', businessOwner: 'Helen Okafor', technicalOwner: 'Ravi Patel', criticality: 'Critical', environments: ['Production', 'Test'], internetFacing: true, businessFunction: 'Payments', notes: 'PCI DSS in scope. ' + SAMPLE_NOTE, ...approved('Alex Morgan', '2026-02-11') },
  { id: 'APP-003', name: 'Claims Processing', description: 'Back-office workflow for assessing and settling customer claims.', businessOwner: 'Tom Barker', technicalOwner: 'Lucy Fernandes', criticality: 'High', environments: ['Production'], internetFacing: false, businessFunction: 'Claims', notes: SAMPLE_NOTE, ...approved('Alex Morgan', '2026-02-11') },
  { id: 'APP-004', name: 'Data Analytics Platform', description: 'Batch and streaming analytics used for reporting and pricing models.', businessOwner: 'Grace Lin', technicalOwner: 'Owen Hughes', criticality: 'Medium', environments: ['Production', 'Development'], internetFacing: false, businessFunction: 'Data & Analytics', notes: SAMPLE_NOTE, ...approved('Priya Shah', '2026-04-20', 'Alex Morgan') },
  { id: 'APP-005', name: 'Identity Broker', description: 'Single sign-on and federation service for customers and staff.', businessOwner: 'Nadia Rahman', technicalOwner: 'Ben Carter', criticality: 'Critical', environments: ['Production'], internetFacing: true, businessFunction: 'Identity & Access', notes: SAMPLE_NOTE, ...approved('Alex Morgan', '2026-01-15') },
  { id: 'APP-006', name: 'HR Self-Service', description: 'Employee portal for leave, payslips and personal details.', businessOwner: 'Fiona Grant', technicalOwner: 'Sanjay Mehta', criticality: 'High', environments: ['Production'], internetFacing: false, businessFunction: 'Human Resources', notes: 'Hosted in on-premises data centre. ' + SAMPLE_NOTE, ...approved('Priya Shah', '2026-05-03', 'Alex Morgan') },
  { id: 'APP-007', name: 'Internal Wiki', description: 'Knowledge base used by IT and operations teams.', businessOwner: 'Chris Doyle', technicalOwner: 'Emma Wright', criticality: 'Low', environments: ['Production'], internetFacing: false, businessFunction: 'Collaboration', notes: SAMPLE_NOTE, ...approved('Alex Morgan', '2026-01-15') },
  { id: 'APP-008', name: 'Mobile API', description: 'Back-end API serving the iOS and Android customer apps.', businessOwner: 'Dana Whitfield', technicalOwner: 'Kofi Mensah', criticality: 'High', environments: ['Production'], internetFacing: true, businessFunction: 'Digital Channels', notes: SAMPLE_NOTE, ...approved('Jordan Lee', '2026-06-18') },
  { id: 'APP-009', name: 'Document Management', description: 'Stores and indexes customer correspondence and scanned documents.', businessOwner: 'Tom Barker', technicalOwner: 'Isla Murray', criticality: 'Medium', environments: ['Staging'], internetFacing: false, businessFunction: 'Claims', notes: 'New service - production go-live planned. ' + SAMPLE_NOTE, submittedBy: 'Jordan Lee', submittedDate: '2026-10-28', reviewStatus: 'Pending review', reviewedBy: '' },
  { id: 'APP-010', name: 'Fraud Detection Engine', description: 'Scores transactions for fraud risk in near real time.', businessOwner: 'Helen Okafor', technicalOwner: 'Unassigned', criticality: 'High', environments: ['Development'], internetFacing: false, businessFunction: 'Risk & Fraud', notes: 'Infrastructure not yet recorded. ' + SAMPLE_NOTE, submittedBy: 'Jordan Lee', submittedDate: '2026-11-01', reviewStatus: 'Pending review', reviewedBy: '' },
];

// Fictional 12-digit account numbers. The real estate has ~90 accounts; a
// representative subset is shown.
const awsAccounts = [
  { id: 'AWS-001', accountName: 'corp-prod-payments', accountId: '100000000101', environment: 'Production', organisationalUnit: 'Workloads/Prod', owner: 'Cloud Platform Team', notes: SAMPLE_NOTE },
  { id: 'AWS-002', accountName: 'corp-prod-digital', accountId: '100000000102', environment: 'Production', organisationalUnit: 'Workloads/Prod', owner: 'Cloud Platform Team', notes: SAMPLE_NOTE },
  { id: 'AWS-003', accountName: 'corp-prod-data', accountId: '100000000103', environment: 'Production', organisationalUnit: 'Workloads/Prod', owner: 'Data Engineering', notes: SAMPLE_NOTE },
  { id: 'AWS-004', accountName: 'corp-prod-shared-services', accountId: '100000000104', environment: 'Production', organisationalUnit: 'Infrastructure', owner: 'Cloud Platform Team', notes: SAMPLE_NOTE },
  { id: 'AWS-005', accountName: 'corp-staging-digital', accountId: '100000000201', environment: 'Staging', organisationalUnit: 'Workloads/NonProd', owner: 'Cloud Platform Team', notes: SAMPLE_NOTE },
  { id: 'AWS-006', accountName: 'corp-test-digital', accountId: '100000000301', environment: 'Test', organisationalUnit: 'Workloads/NonProd', owner: 'Cloud Platform Team', notes: SAMPLE_NOTE },
  { id: 'AWS-007', accountName: 'corp-dev-digital', accountId: '100000000401', environment: 'Development', organisationalUnit: 'Sandbox', owner: 'Digital Engineering', notes: SAMPLE_NOTE },
  { id: 'AWS-008', accountName: 'corp-dev-data', accountId: '100000000402', environment: 'Development', organisationalUnit: 'Sandbox', owner: 'Data Engineering', notes: SAMPLE_NOTE },
  { id: 'AWS-009', accountName: 'corp-prod-identity', accountId: '100000000105', environment: 'Production', organisationalUnit: 'Security', owner: 'Identity Team', notes: SAMPLE_NOTE },
  { id: 'AWS-010', accountName: 'corp-nonprod-shared', accountId: '100000000202', environment: 'Staging', organisationalUnit: 'Infrastructure', owner: 'Cloud Platform Team', notes: SAMPLE_NOTE },
  { id: 'AWS-011', accountName: 'corp-security-tooling', accountId: '100000000106', environment: 'Production', organisationalUnit: 'Security', owner: 'Security Operations', notes: 'No workloads recorded yet. ' + SAMPLE_NOTE },
];

const infrastructure = [
  { id: 'INF-001', name: 'Customer Portal - prod EKS namespace', hostingPlatform: 'Amazon EKS', awsAccountId: 'AWS-002', region: 'eu-west-2', environment: 'Production', clusterType: 'Kubernetes', clusterName: 'eks-prod-euw2-01', namespace: 'customer-portal', owner: 'Platform Engineering', notes: SAMPLE_NOTE },
  { id: 'INF-002', name: 'Customer Portal - staging EKS namespace', hostingPlatform: 'Amazon EKS', awsAccountId: 'AWS-005', region: 'eu-west-2', environment: 'Staging', clusterType: 'Kubernetes', clusterName: 'eks-stg-euw2-01', namespace: 'customer-portal', owner: 'Platform Engineering', notes: SAMPLE_NOTE },
  { id: 'INF-003', name: 'Customer Portal - dev EKS namespace', hostingPlatform: 'Amazon EKS', awsAccountId: 'AWS-007', region: 'eu-west-2', environment: 'Development', clusterType: 'Kubernetes', clusterName: 'eks-dev-euw2-01', namespace: 'customer-portal', owner: 'Digital Engineering', notes: SAMPLE_NOTE },
  { id: 'INF-004', name: 'Payments - prod ROSA project', hostingPlatform: 'Red Hat OpenShift Service on AWS (ROSA)', awsAccountId: 'AWS-001', region: 'eu-west-2', environment: 'Production', clusterType: 'OpenShift', clusterName: 'ocp-prod-euw2-01', namespace: 'payments', owner: 'Payments Platform Team', notes: SAMPLE_NOTE },
  { id: 'INF-005', name: 'Payments - test ROSA project', hostingPlatform: 'Red Hat OpenShift Service on AWS (ROSA)', awsAccountId: 'AWS-006', region: 'eu-west-2', environment: 'Test', clusterType: 'OpenShift', clusterName: 'ocp-nonprod-euw2-01', namespace: 'payments-test', owner: 'Payments Platform Team', notes: SAMPLE_NOTE },
  { id: 'INF-006', name: 'Claims - prod EC2 application tier', hostingPlatform: 'Amazon EC2', awsAccountId: 'AWS-001', region: 'eu-west-1', environment: 'Production', clusterType: 'None', clusterName: '', namespace: '', owner: 'Claims Engineering', notes: SAMPLE_NOTE },
  { id: 'INF-007', name: 'Analytics - prod EC2 compute', hostingPlatform: 'Amazon EC2', awsAccountId: 'AWS-003', region: 'eu-west-2', environment: 'Production', clusterType: 'None', clusterName: '', namespace: '', owner: 'Data Engineering', notes: SAMPLE_NOTE },
  { id: 'INF-008', name: 'Analytics - dev EC2 compute', hostingPlatform: 'Amazon EC2', awsAccountId: 'AWS-008', region: 'eu-west-2', environment: 'Development', clusterType: 'None', clusterName: '', namespace: '', owner: 'Data Engineering', notes: SAMPLE_NOTE },
  { id: 'INF-009', name: 'Identity Broker - prod ECS service', hostingPlatform: 'Amazon ECS', awsAccountId: 'AWS-009', region: 'eu-west-2', environment: 'Production', clusterType: 'None', clusterName: '', namespace: '', owner: 'Identity Team', notes: SAMPLE_NOTE },
  { id: 'INF-010', name: 'Shared ingress - prod EKS', hostingPlatform: 'Amazon EKS', awsAccountId: 'AWS-004', region: 'eu-west-2', environment: 'Production', clusterType: 'Kubernetes', clusterName: 'eks-shared-euw2-01', namespace: 'ingress-system', owner: 'Platform Engineering', notes: 'Shared internet ingress for several applications. ' + SAMPLE_NOTE },
  { id: 'INF-011', name: 'HR Self-Service - on-prem OpenShift', hostingPlatform: 'OpenShift (on-premises)', awsAccountId: null, region: 'Not applicable', environment: 'Production', clusterType: 'OpenShift', clusterName: 'ocp-dc1-prod', namespace: 'hr-selfservice', owner: 'Data Centre Services', notes: SAMPLE_NOTE },
  { id: 'INF-012', name: 'Internal Wiki - prod EC2', hostingPlatform: 'Amazon EC2', awsAccountId: 'AWS-004', region: 'eu-west-2', environment: 'Production', clusterType: 'None', clusterName: '', namespace: '', owner: 'IT Operations', notes: SAMPLE_NOTE },
  { id: 'INF-013', name: 'Mobile API - prod EKS namespace', hostingPlatform: 'Amazon EKS', awsAccountId: 'AWS-002', region: 'eu-west-2', environment: 'Production', clusterType: 'Kubernetes', clusterName: 'eks-prod-euw2-01', namespace: 'mobile-api', owner: 'Platform Engineering', notes: SAMPLE_NOTE },
  { id: 'INF-014', name: 'Document Mgmt - staging ROSA project', hostingPlatform: 'Red Hat OpenShift Service on AWS (ROSA)', awsAccountId: 'AWS-010', region: 'eu-west-2', environment: 'Staging', clusterType: 'OpenShift', clusterName: 'ocp-nonprod-euw2-01', namespace: 'docs-stg', owner: 'Claims Engineering', notes: SAMPLE_NOTE },
];

const appInfra = [
  ['APP-001', 'INF-001'], ['APP-001', 'INF-002'], ['APP-001', 'INF-003'], ['APP-001', 'INF-010'],
  ['APP-002', 'INF-004'], ['APP-002', 'INF-005'],
  ['APP-003', 'INF-006'],
  ['APP-004', 'INF-007'], ['APP-004', 'INF-008'],
  ['APP-005', 'INF-009'],
  ['APP-006', 'INF-011'],
  ['APP-007', 'INF-012'],
  ['APP-008', 'INF-013'], ['APP-008', 'INF-010'],
  ['APP-009', 'INF-014'],
];

const sw = (id, vendor, product, category, version, description, verificationStatus, lastReviewed, extra = {}) => ({
  id, vendor, product, category, version, description, cpe: '', verificationStatus, lastReviewed, notes: '',
  submittedBy: 'Priya Shah', submittedDate: '2026-02-20', reviewStatus: 'Approved', reviewedBy: 'Alex Morgan', ...extra,
});

const software = [
  sw('SW-001', 'Apache Software Foundation', 'Tomcat', 'Web server', '9.0.80', 'Java servlet container.', 'Verified', '2026-09-14'),
  sw('SW-002', 'Apache Software Foundation', 'Tomcat', 'Web server', '9.0.86', 'Java servlet container (upgraded build in staging).', 'Verified', '2026-09-14'),
  sw('SW-003', 'Apache Software Foundation', 'Log4j', 'Library / dependency', '2.17.1', 'Java logging library.', 'Verified', '2026-08-02'),
  sw('SW-004', 'Apache Software Foundation', 'Log4j', 'Library / dependency', '2.14.1', 'Java logging library (legacy analytics job).', 'Needs review', '2025-11-30'),
  sw('SW-005', 'OpenSSL Software Foundation', 'OpenSSL', 'Library / dependency', '3.0.7', 'TLS/cryptography library.', 'Verified', '2026-07-21'),
  sw('SW-006', 'OpenSSL Software Foundation', 'OpenSSL', 'Library / dependency', '1.1.1k', 'TLS library bundled in HR container base image.', 'Unverified', '2025-06-12'),
  sw('SW-007', 'F5', 'NGINX', 'Web server', '1.24.0', 'Reverse proxy in front of shared ingress.', 'Verified', '2026-09-30'),
  sw('SW-008', 'Kubernetes', 'ingress-nginx', 'Kubernetes component', '1.9.4', 'Ingress controller for the shared EKS cluster.', 'Verified', '2026-09-30'),
  sw('SW-009', 'PostgreSQL Global Development Group', 'PostgreSQL', 'Database', '14.9', 'Relational database.', 'Verified', '2026-06-10'),
  sw('SW-010', 'Oracle', 'MySQL', 'Database', '8.0.34', 'Relational database for the wiki.', 'Verified', '2026-04-04'),
  sw('SW-011', 'Red Hat', 'OpenShift Container Platform', 'OpenShift component', '4.12.20', 'OpenShift cluster platform version.', 'Verified', '2026-08-19'),
  sw('SW-012', 'Amazon', 'Amazon Linux', 'Operating system', '2023.1', 'EC2 operating system image.', 'Verified', '2026-07-01'),
  sw('SW-013', 'Canonical', 'Ubuntu', 'Operating system', '22.04', 'Analytics compute OS.', 'Verified', '2026-07-01'),
  sw('SW-014', 'VMware', 'Spring Framework', 'Framework', '5.3.27', 'Java application framework.', 'Verified', '2026-05-15'),
  sw('SW-015', 'VMware', 'Spring Boot', 'Framework', '3.1.2', 'Spring Boot runtime for the Mobile API.', 'Verified', '2026-05-15'),
  sw('SW-016', 'Python Software Foundation', 'Python', 'Programming language', '3.9.16', 'Python runtime for analytics jobs.', 'Verified', '2026-03-09'),
  sw('SW-017', 'OpenJS Foundation', 'Node.js', 'Programming language', '18.17.0', 'Node.js runtime for portal front end.', 'Verified', '2026-09-14'),
  sw('SW-018', 'Keycloak', 'Keycloak', 'Security product', '21.1.1', 'Identity and access management server.', 'Verified', '2026-08-25'),
  sw('SW-019', 'Atlassian', 'Confluence Data Center', 'Middleware', '', 'Wiki platform - version not yet confirmed by the owning team.', 'Unverified', '', { submittedBy: 'Jordan Lee', submittedDate: '2026-10-30', reviewStatus: 'Pending review', reviewedBy: '' }),
  sw('SW-020', 'Red Hat', 'UBI 8 OpenJDK 17 image', 'Container image', '1.15', 'Base container image used by the HR application.', 'Verified', '2026-04-22'),
  sw('SW-021', 'Elastic', 'Elasticsearch', 'Database', '7.17.10', 'Search index for document management.', 'Unverified', '2026-10-28', { submittedBy: 'Jordan Lee', submittedDate: '2026-10-28', reviewStatus: 'Pending review', reviewedBy: '' }),
];

const dep = (applicationId, softwareId, infrastructureId, environment, location) => ({ applicationId, softwareId, infrastructureId, environment, location, notes: '' });

const deployments = [
  dep('APP-001', 'SW-001', 'INF-001', 'Production', 'portal-web container: /usr/local/tomcat'),
  dep('APP-001', 'SW-002', 'INF-002', 'Staging', 'portal-web container: /usr/local/tomcat'),
  dep('APP-001', 'SW-002', 'INF-003', 'Development', 'portal-web container: /usr/local/tomcat'),
  dep('APP-001', 'SW-017', 'INF-001', 'Production', 'portal-ui container'),
  dep('APP-001', 'SW-007', 'INF-010', 'Production', 'edge proxy pods'),
  dep('APP-001', 'SW-008', 'INF-010', 'Production', 'ingress-nginx controller'),
  dep('APP-002', 'SW-009', 'INF-004', 'Production', 'payments-db StatefulSet'),
  dep('APP-002', 'SW-011', 'INF-004', 'Production', 'Cluster platform'),
  dep('APP-002', 'SW-011', 'INF-005', 'Test', 'Cluster platform'),
  dep('APP-002', 'SW-005', 'INF-004', 'Production', 'payments-api image'),
  dep('APP-002', 'SW-014', 'INF-004', 'Production', 'payments-api WAR'),
  dep('APP-002', 'SW-014', 'INF-005', 'Test', 'payments-api WAR'),
  dep('APP-003', 'SW-001', 'INF-006', 'Production', '/opt/tomcat on claims-app ASG'),
  dep('APP-003', 'SW-003', 'INF-006', 'Production', 'claims-service.jar'),
  dep('APP-003', 'SW-012', 'INF-006', 'Production', 'AMI'),
  dep('APP-004', 'SW-003', 'INF-007', 'Production', 'spark-jobs.jar'),
  dep('APP-004', 'SW-004', 'INF-008', 'Development', 'legacy-etl.jar'),
  dep('APP-004', 'SW-009', 'INF-007', 'Production', 'analytics warehouse'),
  dep('APP-004', 'SW-013', 'INF-007', 'Production', 'AMI'),
  dep('APP-004', 'SW-016', 'INF-007', 'Production', '/usr/bin/python3.9'),
  dep('APP-005', 'SW-005', 'INF-009', 'Production', 'keycloak task image'),
  dep('APP-005', 'SW-018', 'INF-009', 'Production', 'ECS task: identity-broker'),
  dep('APP-006', 'SW-006', 'INF-011', 'Production', 'hr-app image (base layer)'),
  dep('APP-006', 'SW-020', 'INF-011', 'Production', 'hr-app image'),
  dep('APP-007', 'SW-010', 'INF-012', 'Production', 'wiki-db host'),
  dep('APP-007', 'SW-019', 'INF-012', 'Production', '/opt/atlassian/confluence'),
  dep('APP-008', 'SW-014', 'INF-013', 'Production', 'mobile-api container'),
  dep('APP-008', 'SW-015', 'INF-013', 'Production', 'mobile-api container'),
  dep('APP-008', 'SW-008', 'INF-010', 'Production', 'ingress-nginx controller'),
  dep('APP-009', 'SW-021', 'INF-014', 'Staging', 'docs-search StatefulSet'),
];

const v = (o) => ({
  cvssVector: '', references: [], remediation: '', source: 'Sample data (fictional)', ...o,
});

const vulnerabilities = [
  v({ id: 'CVE-2099-10001', title: 'Remote code execution in Apache Tomcat request handling (fictional)', description: 'A crafted HTTP request can cause the servlet container to execute attacker-supplied code. ' + SAMPLE_NOTE, published: '2026-10-29', lastModified: '2026-11-02', cvssScore: 9.8, severity: 'Critical', vendor: 'Apache', product: 'Tomcat', affectedVersions: '>=9.0.0 <9.0.85 || >=10.1.0 <10.1.18', fixedVersions: '9.0.85, 10.1.18', references: ['https://tomcat.apache.org/security-9.html'], exploitAvailability: 'Public exploit', exploitationStatus: 'Known exploited (CISA KEV)', remediation: 'Upgrade to 9.0.85 / 10.1.18 or later. Restrict access to management endpoints.' }),
  v({ id: 'CVE-2099-10002', title: 'Deserialisation flaw in Log4j socket appender (fictional)', description: 'Untrusted data received by a socket appender may be deserialised. ' + SAMPLE_NOTE, published: '2026-10-21', lastModified: '2026-10-21', cvssScore: 8.1, severity: 'High', vendor: 'Apache', product: 'Log4j', affectedVersions: '>=2.0.0 <2.17.0', fixedVersions: '2.17.0', references: ['https://logging.apache.org/log4j/2.x/security.html'], exploitAvailability: 'Proof of concept', exploitationStatus: 'Not known to be exploited', remediation: 'Upgrade to Log4j 2.17.0 or later; remove socket appender configuration.' }),
  v({ id: 'CVE-2099-10003', title: 'Denial of service in OpenSSL certificate parsing (fictional)', description: 'Processing a malformed X.509 certificate may cause excessive CPU consumption. ' + SAMPLE_NOTE, published: '2026-10-15', lastModified: '2026-10-30', cvssScore: 7.5, severity: 'High', vendor: 'OpenSSL', product: 'OpenSSL', affectedVersions: '>=3.0.0 <3.0.9 || >=1.1.1 <1.1.1u', fixedVersions: '3.0.9, 1.1.1u', references: ['https://www.openssl.org/news/vulnerabilities.html'], exploitAvailability: 'Proof of concept', exploitationStatus: 'Not known to be exploited', remediation: 'Upgrade OpenSSL; rebuild container images that bundle the library.' }),
  v({ id: 'CVE-2099-10004', title: 'HTTP/3 module memory disclosure in NGINX (fictional)', description: 'The experimental HTTP/3 module may disclose memory contents. ' + SAMPLE_NOTE, published: '2026-09-30', lastModified: '2026-09-30', cvssScore: 5.3, severity: 'Medium', vendor: 'F5', product: 'nginx', affectedVersions: '>=1.25.0 <1.25.3', fixedVersions: '1.25.3', references: ['https://nginx.org/en/security_advisories.html'], exploitAvailability: 'No known exploit', exploitationStatus: 'Not known to be exploited', remediation: 'Upgrade or disable the HTTP/3 module.' }),
  v({ id: 'CVE-2099-10005', title: 'Annotation injection in ingress-nginx (fictional)', description: 'Users able to create Ingress objects can inject configuration via annotations. ' + SAMPLE_NOTE, published: '2026-10-08', lastModified: '2026-10-12', cvssScore: 8.8, severity: 'High', vendor: 'Kubernetes', product: 'ingress-nginx', affectedVersions: '<1.10.0', fixedVersions: '1.10.0', references: ['https://github.com/kubernetes/ingress-nginx/security'], exploitAvailability: 'Proof of concept', exploitationStatus: 'Exploitation reported', remediation: 'Upgrade to 1.10.0; enable annotation validation.' }),
  v({ id: 'CVE-2099-10006', title: 'SQL injection via extension script in PostgreSQL (fictional)', description: 'An extension install script may allow privilege escalation. ' + SAMPLE_NOTE, published: '2026-08-10', lastModified: '2026-08-15', cvssScore: 6.5, severity: 'Medium', vendor: 'PostgreSQL', product: 'PostgreSQL', affectedVersions: '>=14.0 <14.10 || >=15.0 <15.5', fixedVersions: '14.10, 15.5', references: ['https://www.postgresql.org/support/security/'], exploitAvailability: 'No known exploit', exploitationStatus: 'Not known to be exploited', remediation: 'Apply the minor release update.' }),
  v({ id: 'CVE-2099-10007', title: 'Authentication bypass in Confluence Data Center (fictional)', description: 'An unauthenticated attacker can create administrator accounts. ' + SAMPLE_NOTE, published: '2026-11-03', lastModified: '2026-11-04', cvssScore: 10.0, severity: 'Critical', vendor: 'Atlassian', product: 'Confluence Data Center', affectedVersions: '>=8.0.0 <8.5.3', fixedVersions: '8.5.3', references: ['https://confluence.atlassian.com/security'], exploitAvailability: 'Public exploit', exploitationStatus: 'Known exploited (CISA KEV)', remediation: 'Upgrade immediately; restrict external network access to the instance.' }),
  v({ id: 'CVE-2099-10008', title: 'Path traversal in Spring Framework static resources (fictional)', description: 'Specially crafted URLs may access files outside the resource root. ' + SAMPLE_NOTE, published: '2026-07-18', lastModified: '2026-07-20', cvssScore: 5.3, severity: 'Medium', vendor: 'VMware', product: 'Spring Framework', affectedVersions: '>=5.3.0 <5.3.30 || >=6.0.0 <6.0.13', fixedVersions: '5.3.30, 6.0.13', references: ['https://spring.io/security'], exploitAvailability: 'Proof of concept', exploitationStatus: 'Not known to be exploited', remediation: 'Upgrade Spring Framework.' }),
  v({ id: 'CVE-2099-10009', title: 'Header smuggling in Example Labs httpclient (fictional)', description: 'Request smuggling through malformed Transfer-Encoding headers. ' + SAMPLE_NOTE, published: '2026-10-02', lastModified: '2026-10-02', cvssScore: 6.1, severity: 'Medium', vendor: 'Example Labs', product: 'httpclient', affectedVersions: '<4.2.0', fixedVersions: '4.2.0', references: [], exploitAvailability: 'Unknown', exploitationStatus: 'Unknown', remediation: 'Upgrade the library.' }),
  v({ id: 'CVE-2099-10010', title: 'Open redirect in Keycloak login flow (fictional)', description: 'A crafted redirect_uri may send users to an attacker-controlled site. ' + SAMPLE_NOTE, published: '2026-09-12', lastModified: '2026-09-20', cvssScore: 6.1, severity: 'Medium', vendor: 'Red Hat', product: 'Keycloak', affectedVersions: '<22.0.5', fixedVersions: '22.0.5', references: ['https://www.keycloak.org/security'], exploitAvailability: 'Proof of concept', exploitationStatus: 'Not known to be exploited', remediation: 'Upgrade Keycloak; enforce exact redirect URI matching.' }),
  v({ id: 'CVE-2099-10011', title: 'Information disclosure in Elasticsearch audit logging (fictional)', description: 'Sensitive request bodies may be written to audit logs. Affected versions have not yet been published by the vendor. ' + SAMPLE_NOTE, published: '2026-11-04', lastModified: '2026-11-04', cvssScore: 4.3, severity: 'Medium', vendor: 'Elastic', product: 'Elasticsearch', affectedVersions: '', fixedVersions: '', references: [], exploitAvailability: 'Unknown', exploitationStatus: 'Unknown', remediation: 'Await vendor advisory.' }),
  v({ id: 'CVE-2099-10012', title: 'Buffer over-read in Python tarfile module (fictional)', description: 'Extracting a crafted archive may read beyond buffer bounds. ' + SAMPLE_NOTE, published: '2026-06-03', lastModified: '2026-06-05', cvssScore: 3.7, severity: 'Low', vendor: 'Python Software Foundation', product: 'Python', affectedVersions: '<3.9.17 || >=3.10.0 <3.10.12', fixedVersions: '3.9.17, 3.10.12', references: ['https://www.python.org/news/security/'], exploitAvailability: 'No known exploit', exploitationStatus: 'Not known to be exploited', remediation: 'Upgrade Python runtime.' }),
];

const assessmentReviews = [
  { id: 'REV-0001', cveId: 'CVE-2099-10001', softwareId: 'SW-001', status: 'Confirmed affected', rationale: 'Container image scan of portal-web (prod) and claims-app AMI confirms Tomcat 9.0.80. Upgrade change raised.', reviewedBy: 'Priya Shah', reviewedAt: '2026-11-03T10:15:00.000Z' },
  { id: 'REV-0002', cveId: 'CVE-2099-10006', softwareId: 'SW-009', status: 'Not affected', rationale: 'Vulnerable extension is not installed on any instance (checked pg_extension on prod payments-db and analytics warehouse).', reviewedBy: 'Priya Shah', reviewedAt: '2026-08-20T14:40:00.000Z' },
];

const monitoringSources = [
  { id: 'SRC-001', name: 'NIST National Vulnerability Database (CVE API 2.0)', url: 'https://services.nvd.nist.gov/rest/json/cves/2.0', type: 'NVD API', frequency: 'Every 6 hours', enabled: true, vendorScope: '', lastSuccessfulCheck: '', lastDetectedUpdate: '', lastStatus: 'Not yet checked', demoFeed: 'data/sample-feeds/nvd-sample.json', feedUrl: 'feeds/nvd/index.json', notes: 'Real NVD data: fetched every 6 hours by the GitHub Actions workflow "Publish site with NVD feed" and published with this site. An optional NVD API key is held as a GitHub Actions secret (NVD_API_KEY), never in the browser.' },
  { id: 'SRC-002', name: 'CISA Known Exploited Vulnerabilities catalogue', url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', type: 'CISA KEV catalogue', frequency: 'Daily', enabled: true, vendorScope: '', lastSuccessfulCheck: '', lastDetectedUpdate: '', lastStatus: 'Not yet checked', demoFeed: 'data/sample-feeds/kev-sample.json', notes: '' },
  { id: 'SRC-003', name: 'Red Hat Security Data API', url: 'https://access.redhat.com/hydra/rest/securitydata/cve.json', type: 'Vendor advisory (JSON/CSAF)', frequency: 'Daily', enabled: true, vendorScope: 'Red Hat', lastSuccessfulCheck: '', lastDetectedUpdate: '', lastStatus: 'Not yet checked', demoFeed: '', notes: 'Covers OpenShift, UBI images and Keycloak.' },
  { id: 'SRC-004', name: 'Apache Tomcat security reports', url: 'https://tomcat.apache.org/security.html', type: 'Vendor advisory (web page)', frequency: 'Weekly', enabled: true, vendorScope: 'Apache Tomcat', lastSuccessfulCheck: '', lastDetectedUpdate: '', lastStatus: 'Not yet checked', demoFeed: '', notes: 'Web page monitoring requires change detection and AI-assisted extraction (future).' },
  { id: 'SRC-005', name: 'OpenSSL vulnerabilities page', url: 'https://www.openssl.org/news/vulnerabilities.html', type: 'Vendor advisory (web page)', frequency: 'Weekly', enabled: false, vendorScope: 'OpenSSL', lastSuccessfulCheck: '', lastDetectedUpdate: '', lastStatus: 'Not yet checked', demoFeed: '', notes: 'Disabled - covered by NVD for now.' },
];

const auditSeed = [
  ['2026-11-04T09:12:00.000Z', 'Priya Shah', 'create', 'vulnerabilities', 'CVE-2099-10007', 'Authentication bypass in Confluence Data Center (fictional)'],
  ['2026-11-03T10:15:00.000Z', 'Priya Shah', 'create', 'assessmentReviews', 'REV-0001', 'CVE-2099-10001 / SW-001 marked Confirmed affected'],
  ['2026-11-01T16:02:00.000Z', 'Jordan Lee', 'create', 'applications', 'APP-010', 'Fraud Detection Engine'],
  ['2026-10-30T11:47:00.000Z', 'Jordan Lee', 'create', 'software', 'SW-019', 'Atlassian Confluence Data Center'],
  ['2026-10-29T08:30:00.000Z', 'system', 'create', 'vulnerabilities', 'CVE-2099-10001', 'Remote code execution in Apache Tomcat request handling (fictional)'],
  ['2026-10-28T13:05:00.000Z', 'Jordan Lee', 'create', 'applications', 'APP-009', 'Document Management'],
].map(([timestamp, user, action, collection, recordId, summary], i) => ({ id: `AUD-seed-${i + 1}`, timestamp, user, action, collection, recordId, summary }));

const settings = [{
  id: 'app',
  organisationName: 'Example Corporation (fictional)',
  staleReviewDays: 180,
  aiProvider: 'disabled',
  aiBackendEndpoint: '',
  monitoringBackendEndpoint: '',
  notifyOnPriorities: ['P1', 'P2'],
  notifyOnKnownExploited: true,
  notificationRecipients: 'vuln-management@example.com',
  productAliases: [
    { vendor: 'apache software foundation', alias: 'apache' },
    { vendor: 'openssl software foundation', alias: 'openssl' },
    { vendor: 'postgresql global development group', alias: 'postgresql' },
    { vendor: 'openjs foundation', alias: 'nodejs' },
    { vendor: 'f5 networks', alias: 'f5' },
    { product: 'nginx', alias: 'nginx' },
    { product: 'apache log4j', alias: 'log4j' },
    { product: 'log4j2', alias: 'log4j' },
    { product: 'apache tomcat', alias: 'tomcat' },
    { product: 'node.js', alias: 'nodejs' },
    { product: 'node', alias: 'nodejs' },
  ],
}];

/** Build a complete fresh dataset (a new object each call). */
export function buildSampleSnapshot(schemaVersion = 1) {
  const created = '2026-01-15T09:00:00.000Z';
  const stamp = (r) => ({ createdAt: created, updatedAt: r.lastModified && r.lastModified.length > 10 ? r.lastModified : created, ...r });
  const workflowStamp = (r) => ({ ...stamp(r), lastModified: `${r.submittedDate || '2026-01-15'}T09:00:00.000Z` });
  return {
    schemaVersion,
    savedAt: null,
    collections: {
      applications: applications.map(workflowStamp),
      awsAccounts: awsAccounts.map(stamp),
      infrastructure: infrastructure.map(stamp),
      applicationInfrastructure: appInfra.map(([applicationId, infrastructureId], i) => stamp({ id: `LNK-${String(i + 1).padStart(4, '0')}`, applicationId, infrastructureId })),
      software: software.map(workflowStamp),
      deployments: deployments.map((d, i) => stamp({ id: `DEP-${String(i + 1).padStart(4, '0')}`, ...d })),
      vulnerabilities: vulnerabilities.map(stamp),
      assessmentReviews: assessmentReviews.map(stamp),
      monitoringSources: monitoringSources.map(stamp),
      notifications: [
        { id: 'NTF-0001', createdAt: '2026-11-04T09:15:00.000Z', level: 'critical', title: 'Known-exploited CVE may affect production', message: 'CVE-2099-10007 (Confluence Data Center) - version of SW-019 unknown; Internal Wiki requires investigation.', link: '#/assessments/CVE-2099-10007', audience: 'Vulnerability Management', read: false },
        { id: 'NTF-0002', createdAt: '2026-11-03T10:16:00.000Z', level: 'info', title: 'Assessment confirmed', message: 'CVE-2099-10001 confirmed affecting Tomcat 9.0.80 (Customer Portal, Claims Processing).', link: '#/assessments/CVE-2099-10001', audience: 'Application owners', read: true },
      ],
      users: SAMPLE_USERS.map(stamp),
      auditLog: auditSeed,
      settings,
    },
  };
}
