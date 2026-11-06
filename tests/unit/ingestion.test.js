import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DataStore, MemoryProvider } from '../../js/core/store.js';
import { buildSampleSnapshot } from '../../js/data/sample-data.js';
import { normaliseNvd, normaliseKev, planIngestion, applyIngestion, buildNotifications, saveNotifications } from '../../js/services/ingestion.js';
import { assessCve } from '../../js/services/assessment-engine.js';

const feed = (name) => JSON.parse(readFileSync(new URL(`../../data/sample-feeds/${name}`, import.meta.url)));
const newStore = async () => new DataStore(new MemoryProvider({ seed: () => buildSampleSnapshot(1) })).init();

test('NVD adapter extracts vendor/product, version ranges, fixed versions and CVSS', () => {
  const recs = normaliseNvd(feed('nvd-sample.json'));
  const node = recs.find((r) => r.id === 'CVE-2099-10013');
  assert.equal(node.vendor, 'nodejs');
  assert.equal(node.product, 'node.js');
  assert.equal(node.affectedVersions, '>=18.0.0 <18.18.2 || >=20.0.0 <20.8.1');
  assert.equal(node.fixedVersions, '18.18.2, 20.8.1');
  assert.equal(node.severity, 'High');
  assert.equal(node.cvssScore, 7.5);
});

test('NVD plan: unchanged duplicate, update, create and reject', async () => {
  const store = await newStore();
  const incoming = normaliseNvd(feed('nvd-sample.json'));
  const plan = planIngestion([...incoming, incoming[2]], store); // include an in-batch duplicate
  assert.deepEqual(plan.unchanged, ['CVE-2099-10001']);
  assert.deepEqual(plan.updates.map((u) => u.id), ['CVE-2099-10006']);
  assert.deepEqual(Object.keys(plan.updates[0].changes).sort(), ['cvssScore', 'cvssVector', 'description', 'lastModified', 'severity']);
  assert.deepEqual(plan.creates.map((c) => c.id), ['CVE-2099-10013']);
  assert.deepEqual(plan.rejected.map((r) => r.id), ['CVE-2099-10014']);
  assert.equal(plan.duplicatesInBatch, 1);
});

test('KEV plan escalates exploitation, defers unknown CVEs and never downgrades', async () => {
  const store = await newStore();
  const plan = planIngestion(normaliseKev(feed('kev-sample.json')), store);
  assert.deepEqual(plan.updates.map((u) => u.id), ['CVE-2099-10003']);
  assert.equal(plan.updates[0].patch.exploitationStatus, 'Known exploited (CISA KEV)');
  assert.equal(plan.updates[0].patch.remediation, undefined, 'existing remediation kept');
  assert.deepEqual(plan.unchanged, ['CVE-2099-10001']);
  assert.deepEqual(plan.deferred.map((d) => d.id), ['CVE-2099-10099']);
  // A weaker status from a source is ignored
  const p2 = planIngestion([{ id: 'CVE-2099-10001', exploitationStatus: 'Not known to be exploited', _source: 'x' }], store);
  assert.deepEqual(p2.unchanged, ['CVE-2099-10001']);
});

test('apply, re-assess and notify; re-running is idempotent', async () => {
  const store = await newStore();
  const nvd = planIngestion(normaliseNvd(feed('nvd-sample.json')), store);
  const kev = planIngestion(normaliseKev(feed('kev-sample.json')), store);
  const touched = [...await applyIngestion(nvd, store), ...await applyIngestion(kev, store)];
  assert.deepEqual(touched.sort(), ['CVE-2099-10003', 'CVE-2099-10006', 'CVE-2099-10013']);

  const node = assessCve(store.get('vulnerabilities', 'CVE-2099-10013'), store);
  assert.equal(node.findings[0].softwareId, 'SW-017');
  assert.equal(node.summary.status, 'Potentially affected');
  // Analyst decision on PostgreSQL is now stale because the CVE changed
  const pg = assessCve(store.get('vulnerabilities', 'CVE-2099-10006'), store);
  assert.equal(pg.findings[0].reviewStale, true);
  // OpenSSL becomes P1 after KEV listing
  assert.equal(assessCve(store.get('vulnerabilities', 'CVE-2099-10003'), store).summary.priority, 'P1');

  const notes = buildNotifications(store, touched);
  assert.ok(notes.some((n) => n.title.includes('CVE-2099-10003') && n.level === 'critical'));
  assert.ok(notes.some((n) => n.title.includes('CVE-2099-10013')));
  assert.ok(notes.every((n) => n.audience.includes('vuln-management@example.com')));
  await saveNotifications(store, notes);
  assert.equal(buildNotifications(store, touched).length, 0, 'no duplicate notifications');

  const again = planIngestion(normaliseNvd(feed('nvd-sample.json')), store);
  assert.equal(again.creates.length + again.updates.length, 0, 'second run makes no changes');
});
