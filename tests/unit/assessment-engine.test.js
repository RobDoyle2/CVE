import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataStore, MemoryProvider } from '../../js/core/store.js';
import { buildSampleSnapshot } from '../../js/data/sample-data.js';
import { assessAll, assessCve, matchProduct, buildAliasMaps, findingsForApplication } from '../../js/services/assessment-engine.js';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const newStore = async () => new DataStore(new MemoryProvider({ seed: () => buildSampleSnapshot(1) })).init();
const byId = (results) => Object.fromEntries(results.map((r) => [r.cve.id, r]));
const finding = (r, sw) => r.findings.find((f) => f.softwareId === sw);

test('product matching uses aliases and distinguishes match strength', async () => {
  const store = await newStore();
  const aliases = buildAliasMaps(store.getSettings());
  assert.equal(matchProduct({ vendor: 'Apache', product: 'Tomcat' }, { vendor: 'Apache Software Foundation', product: 'Tomcat' }, aliases).type, 'exact');
  assert.equal(matchProduct({ vendor: 'Red Hat', product: 'Keycloak' }, { vendor: 'Keycloak', product: 'Keycloak' }, aliases).type, 'product');
  assert.equal(matchProduct({ vendor: 'VMware', product: 'Spring Framework' }, { vendor: 'VMware', product: 'Spring Boot' }, aliases).type, 'partial');
  assert.equal(matchProduct({ vendor: 'Example Labs', product: 'httpclient' }, { vendor: 'Oracle', product: 'MySQL' }, aliases).type, null);
  assert.equal(matchProduct({ vendor: 'Apache', product: 'Log4j' }, { vendor: 'Apache', product: 'log4j2' }, aliases).type, 'exact');
});

test('expected outcomes for every fictional sample CVE', async () => {
  const store = await newStore();
  const r = byId(assessAll(store, { now: NOW }));

  // Tomcat: affected version confirmed by analyst; patched staging build not affected
  assert.equal(finding(r['CVE-2099-10001'], 'SW-001').status, 'Confirmed affected');
  assert.equal(finding(r['CVE-2099-10001'], 'SW-001').computedStatus, 'Potentially affected');
  assert.equal(finding(r['CVE-2099-10001'], 'SW-002').status, 'Not affected');
  assert.equal(r['CVE-2099-10001'].summary.status, 'Confirmed affected');
  assert.equal(r['CVE-2099-10001'].summary.priority, 'P1');

  // Log4j: 2.14.1 in dev is potentially affected; 2.17.1 is not
  assert.equal(finding(r['CVE-2099-10002'], 'SW-004').status, 'Potentially affected');
  assert.equal(finding(r['CVE-2099-10002'], 'SW-003').status, 'Not affected');
  assert.equal(finding(r['CVE-2099-10002'], 'SW-004').priority.level, 'P3');

  // OpenSSL letter-suffix version in range
  assert.equal(finding(r['CVE-2099-10003'], 'SW-006').status, 'Potentially affected');
  assert.equal(finding(r['CVE-2099-10003'], 'SW-005').priority.level, 'P2');

  // NGINX outside range; ingress-nginx not confused with nginx
  assert.equal(finding(r['CVE-2099-10004'], 'SW-007').status, 'Not affected');
  assert.equal(finding(r['CVE-2099-10004'], 'SW-008'), undefined);

  // ingress-nginx: exploitation reported + production -> P1
  assert.equal(finding(r['CVE-2099-10005'], 'SW-008').status, 'Potentially affected');
  assert.equal(r['CVE-2099-10005'].summary.priority, 'P1');

  // PostgreSQL: analyst override to Not affected
  assert.equal(r['CVE-2099-10006'].summary.status, 'Not affected');

  // Confluence: version unknown -> unable to determine, KEV -> P2
  assert.equal(finding(r['CVE-2099-10007'], 'SW-019').status, 'Unable to determine');
  assert.equal(finding(r['CVE-2099-10007'], 'SW-019').priority.level, 'P2');

  // Spring Framework matched; Spring Boot partial match excluded because version is out of range
  assert.equal(finding(r['CVE-2099-10008'], 'SW-014').status, 'Potentially affected');
  assert.equal(finding(r['CVE-2099-10008'], 'SW-015'), undefined);

  // No inventory match
  assert.equal(r['CVE-2099-10009'].summary.status, 'No inventory match');

  // Keycloak: vendor mismatch -> requires investigation
  assert.equal(finding(r['CVE-2099-10010'], 'SW-018').status, 'Requires investigation');

  // Elasticsearch: no affected versions published -> requires investigation
  assert.equal(finding(r['CVE-2099-10011'], 'SW-021').status, 'Requires investigation');
});

test('engine never assigns Confirmed affected by itself', async () => {
  const store = await newStore();
  for (const r of store.all('assessmentReviews').map((x) => x.id)) await store.remove('assessmentReviews', r);
  const results = assessAll(store, { now: NOW });
  const confirmed = results.flatMap((r) => r.findings).filter((f) => f.status === 'Confirmed affected');
  assert.equal(confirmed.length, 0);
});

test('findings carry evidence, data quality and verification steps, never probabilities', async () => {
  const store = await newStore();
  const r = assessCve(store.get('vulnerabilities', 'CVE-2099-10003'), store, { now: NOW });
  const f = finding(r, 'SW-006');
  assert.ok(f.evidence.some((e) => e.kind === 'match'));
  assert.ok(f.evidence.some((e) => /Version check/.test(e.text)));
  assert.ok(f.dataQuality.some((d) => /Unverified/.test(d.text)));
  assert.ok(f.dataQuality.some((d) => /last reviewed/.test(d.text)));
  assert.ok(f.verification.length >= 2);
  const json = JSON.stringify(r);
  assert.ok(!/probability|confidence|%/.test(json.replace(/https?:[^"]*/g, '')), 'no probability language');
});

test('impact identifies applications, AWS accounts and production exposure', async () => {
  const store = await newStore();
  const r = assessCve(store.get('vulnerabilities', 'CVE-2099-10001'), store, { now: NOW });
  const apps = r.summary.applications.map((a) => a.id).sort();
  assert.deepEqual(apps, ['APP-001', 'APP-003']);
  const accounts = r.summary.awsAccounts.map((a) => a.accountName).sort();
  assert.deepEqual(accounts, ['corp-prod-digital', 'corp-prod-payments']);
  assert.equal(r.summary.internetFacingProduction, true);
  const portal = r.summary.applications.find((a) => a.id === 'APP-001');
  assert.deepEqual(portal.environments, ['Production']); // staging/dev run the patched version
});

test('stale analyst decisions are flagged when the CVE changes', async () => {
  const store = await newStore();
  await store.update('vulnerabilities', 'CVE-2099-10006', { lastModified: '2026-10-01' });
  const r = assessCve(store.get('vulnerabilities', 'CVE-2099-10006'), store, { now: NOW });
  assert.ok(r.findings[0].reviewStale);
  assert.equal(r.summary.staleReviews, 1);
});

test('application view of findings', async () => {
  const store = await newStore();
  const list = findingsForApplication(assessAll(store, { now: NOW }), 'APP-001');
  assert.ok(list.some((x) => x.cve.id === 'CVE-2099-10001'));
  assert.ok(list.some((x) => x.cve.id === 'CVE-2099-10005'));
});
