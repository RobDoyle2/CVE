import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  selectMetric, compactNvdItem, productsFromAffected, productsFromConfigurations, dayWindows, daysToFetch,
  buildDayFile, FEED_FORMAT,
} from '../../js/services/nvd-feed.js';
import { normaliseNvd, planIngestion, applyIngestion } from '../../js/services/ingestion.js';
import { assessCve, buildAliasMaps, buildSoftwareIndex, matchesInventory } from '../../js/services/assessment-engine.js';
import { DataStore, MemoryProvider } from '../../js/core/store.js';
import { buildSampleSnapshot } from '../../js/data/sample-data.js';
import { run, createClient, parseArgs } from '../../scripts/fetch-nvd.mjs';

// Real NVD API 2.0 responses (public data) captured for testing.
const REAL = JSON.parse(readFileSync(new URL('../fixtures/nvd/real-sample.json', import.meta.url)));
const byId = (id) => REAL.vulnerabilities.find((v) => v.cve.id === id);
const newStore = async () => new DataStore(new MemoryProvider({ seed: () => buildSampleSnapshot(1) })).init();

test('CVSS selection prefers v3.x, then v4.0, then v2, and NVD over CNA', () => {
  assert.equal(selectMetric(byId('CVE-2021-44228').cve.metrics).version, '3.1');
  assert.equal(selectMetric(byId('CVE-2021-44228').cve.metrics).score, 10);
  const v4only = REAL.vulnerabilities.find((v) => v.cve.metrics && v.cve.metrics.cvssMetricV40 && !v.cve.metrics.cvssMetricV31);
  assert.equal(selectMetric(v4only.cve.metrics).key, 'cvssMetricV40');
  assert.equal(selectMetric({}), null);
  assert.equal(selectMetric({ cvssMetricV31: [{ type: 'Secondary', cvssData: { baseScore: 5, baseSeverity: 'MEDIUM' } }, { type: 'Primary', cvssData: { baseScore: 7, baseSeverity: 'HIGH' } }] }).score, 7);
});

test('CNA affected data with status changes becomes version ranges (Log4Shell)', () => {
  const products = productsFromAffected(byId('CVE-2021-44228').cve.affected);
  assert.equal(products[0].vendor, 'Apache Software Foundation');
  assert.equal(products[0].source, 'CNA');
  assert.equal(products[0].affectedVersions, '>=2.0-beta9 <2.3.1 || >=2.4 <2.12.2 || >=2.13.0 <2.15.0');
  const rpm = productsFromAffected([{ affectedData: [{ vendor: 'Example', product: 'Example Server', versions: [{ version: '0', lessThan: '0:1.2.3-4.el9', versionType: 'rpm', status: 'affected' }] }] }]);
  assert.equal(rpm[0].affectedVersions, '<1.2.3-4.el9', 'RPM epoch removed');
  // Red Hat style: release in the product name, fixed package builds, explicitly unaffected products skipped
  const rh = productsFromAffected([{ affectedData: [
    { vendor: 'Red Hat', product: 'Red Hat OpenShift Container Platform 4.12', defaultStatus: 'affected', versions: [{ version: '3:4.4.1-3.2.rhaos4.12.el8', lessThan: '*', versionType: 'rpm', status: 'unaffected' }] },
    { vendor: 'Red Hat', product: 'Red Hat OpenShift Container Platform 4.13', defaultStatus: 'affected', versions: [] },
    { vendor: 'Red Hat', product: 'Red Hat Enterprise Linux 7', defaultStatus: 'unaffected', versions: [] },
  ] }]);
  assert.equal(rh.length, 1);
  assert.equal(rh[0].product, 'Red Hat OpenShift Container Platform');
  assert.equal(rh[0].affectedVersions, '4.12.x || 4.13.x');
  assert.equal(rh[0].fixedVersions, '4.4.1-3.2.rhaos4.12.el8');
  const git = productsFromAffected([{ affectedData: [{ vendor: 'X', product: 'Y', versions: [{ version: 'abc123', lessThan: 'def456', versionType: 'git', status: 'affected' }] }] }]);
  assert.equal(git[0].affectedVersions, '', 'git hashes are not guessed');
});

test('NVD CPE configurations keep every vulnerable product', () => {
  const products = productsFromConfigurations(byId('CVE-2021-44228').cve.configurations);
  assert.ok(products.length > 100);
  const log4j = products.find((p) => p.vendor === 'apache' && p.product === 'log4j');
  assert.ok(log4j && /<2\.15\.0/.test(log4j.affectedVersions));
});

test('explicit CPE versions: release lines become wildcards, full versions stay exact', () => {
  const conf = [{ nodes: [{ cpeMatch: [
    { vulnerable: true, criteria: 'cpe:2.3:a:redhat:openshift_container_platform:4.12:*:*:*:*:*:*:*' },
    { vulnerable: true, criteria: 'cpe:2.3:a:redhat:openshift_container_platform:4.13:*:*:*:*:*:*:*' },
    { vulnerable: true, criteria: 'cpe:2.3:a:apache:log4j:2.0:beta9:*:*:*:*:*:*' },
    { vulnerable: true, criteria: 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*' },
  ] }] }];
  const [ocp, log4j] = productsFromConfigurations(conf);
  assert.equal(ocp.affectedVersions, '4.12.x || 4.13.x');
  assert.equal(log4j.affectedVersions, '2.0.x || =2.14.1');
});

test('compact feed items are smaller and still normalise identically', () => {
  for (const item of REAL.vulnerabilities) {
    const compact = compactNvdItem(item);
    assert.ok(JSON.stringify(compact).length < JSON.stringify(item).length);
    assert.equal(compact.cve.configurations, undefined);
    assert.equal(compact.cve.affected, undefined);
    const [a] = normaliseNvd({ vulnerabilities: [item] });
    const [b] = normaliseNvd({ vulnerabilities: [compact] });
    for (const k of ['id', 'vendor', 'product', 'affectedVersions', 'severity', 'cvssScore', 'nvdStatus', 'published']) assert.deepEqual(b[k], a[k], `${item.cve.id} ${k}`);
    assert.deepEqual(b.affectedProducts, a.affectedProducts);
    assert.ok(b.references.every((u) => u.startsWith('https://')));
  }
  assert.equal(compactNvdItem(byId('CVE-2021-44228')).cve.cisaExploitAdd, '2021-12-10', 'KEV fields kept for the later KEV step');
});

test('normalised real records: primary product, CNA fallback, rejected and unscored CVEs', () => {
  const recs = normaliseNvd(REAL);
  const log4shell = recs.find((r) => r.id === 'CVE-2021-44228');
  assert.equal(`${log4shell.vendor}/${log4shell.product}`, 'apache/log4j', 'primary is the CNA product, not the first CPE listed (a Siemens firmware)');
  assert.equal(log4shell.severity, 'Critical');
  const cnaOnly = recs.find((r) => r.affectedProducts && r.affectedProducts[0].source === 'CNA');
  assert.ok(cnaOnly, 'a record using CNA data');
  assert.ok(recs.some((r) => r.nvdStatus === 'Rejected'));
  for (const r of recs) assert.ok(r.affectedVersions.length <= 500 && r.fixedVersions.length <= 300);
});

test('real Log4Shell record is relevant to the inventory and assessed correctly', async () => {
  const store = await newStore();
  const aliases = buildAliasMaps(store.getSettings());
  const index = buildSoftwareIndex(store.all('software'), aliases);
  const recs = normaliseNvd(REAL);
  const log4shell = recs.find((r) => r.id === 'CVE-2021-44228');
  assert.equal(matchesInventory(log4shell, index, aliases), true);
  const unrelated = recs.filter((r) => r.id !== 'CVE-2021-44228' && !matchesInventory(r, index, aliases));
  assert.ok(unrelated.length >= 8, 'most unrelated real CVEs are filtered out');

  const plan = planIngestion([log4shell], store);
  assert.deepEqual(plan.creates.map((c) => c.id), ['CVE-2021-44228']);
  await applyIngestion(plan, store);
  const r = assessCve(store.get('vulnerabilities', 'CVE-2021-44228'), store);
  const f = (sw) => r.findings.find((x) => x.softwareId === sw);
  assert.equal(f('SW-004').status, 'Potentially affected', 'Log4j 2.14.1');
  assert.equal(f('SW-003').status, 'Not affected', 'Log4j 2.17.1');
  assert.ok(r.summary.applications.some((a) => a.name === 'Data Analytics Platform'));
  // Re-importing the same data changes nothing
  const again = planIngestion(normaliseNvd(REAL).filter((x) => x.id === 'CVE-2021-44228'), store);
  assert.deepEqual(again.unchanged, ['CVE-2021-44228']);
});

test('withdrawn (Rejected) CVEs are not added', async () => {
  const store = await newStore();
  const rejected = normaliseNvd(REAL).filter((r) => r.nvdStatus === 'Rejected');
  const plan = planIngestion(rejected, store);
  assert.equal(plan.creates.length, 0);
  assert.equal(plan.withdrawn.length, rejected.length);
});

test('day windows and incremental selection', () => {
  const w = dayWindows(new Date('2026-11-06T13:00:00Z'), 3);
  assert.deepEqual(w.map((x) => x.date), ['2026-11-04', '2026-11-05', '2026-11-06']);
  assert.equal(w[0].start, '2026-11-04T00:00:00.000Z');
  assert.equal(w[0].end, '2026-11-04T23:59:59.999Z');
  const index = { days: w.map((x) => ({ date: x.date, file: `${x.date}.json`, count: 1 })) };
  assert.equal(daysToFetch(index, '').days.length, 3);
  assert.equal(daysToFetch(index, '').firstImport, true);
  assert.deepEqual(daysToFetch(index, '2026-11-06T08:00:00Z').days.map((d) => d.date), ['2026-11-05', '2026-11-06'], 'one day of overlap');
  const gap = daysToFetch(index, '2026-10-20T00:00:00Z');
  assert.equal(gap.gap, true);
  assert.equal(gap.gapTo, '2026-11-04');
  assert.throws(() => parseArgs(['--days', '500']), /1 to 120/);
});

test('fetch script: paging, retries, API key header and output files (mocked network)', async () => {
  const calls = [];
  const items = REAL.vulnerabilities;
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    const u = new URL(url);
    if (calls.length === 1) return { ok: false, status: 503 }; // transient NVD failure
    const start = Number(u.searchParams.get('startIndex'));
    const day = u.searchParams.get('lastModStartDate').slice(0, 10);
    const all = day === '2026-11-06' ? items : [];
    // Simulate a page size of 10 to exercise paging.
    return { ok: true, status: 200, json: async () => ({ totalResults: all.length, vulnerabilities: all.slice(start, start + 10) }) };
  };
  const out = mkdtempSync(path.join(tmpdir(), 'nvd-'));
  writeFileSync(path.join(out, '2026-01-01.json'), '{}'); // stale file to be removed
  const index = await run({ days: 2, out, apiKey: 'test-key', now: new Date('2026-11-06T12:00:00Z'), fetchImpl, sleepImpl: async () => {}, log: () => {} });
  assert.equal(index.format, FEED_FORMAT);
  assert.equal(index.apiKeyUsed, true);
  assert.deepEqual(index.days.map((d) => [d.date, d.count]), [['2026-11-05', 0], ['2026-11-06', items.length]]);
  assert.ok(calls.every((c) => c.opts.headers.apiKey === 'test-key'));
  assert.equal(calls.filter((c) => c.url.includes('2026-11-06')).length, 2, 'paged through results (10 per page)');
  assert.equal(calls.filter((c) => c.url.includes('2026-11-05')).length, 2, 'retried after HTTP 503');
  assert.deepEqual(readdirSync(out).sort(), ['2026-11-05.json', '2026-11-06.json', 'index.json']);
  const day = JSON.parse(readFileSync(path.join(out, '2026-11-06.json')));
  assert.equal(day.vulnerabilities.length, items.length);
  assert.ok(!JSON.stringify(index).includes('test-key'), 'API key never written to the feed');
});

test('fetch script gives up after repeated failures instead of publishing partial data', async () => {
  const get = createClient({ fetchImpl: async () => ({ ok: false, status: 503 }), sleepImpl: async () => {}, log: () => {}, maxAttempts: 3 });
  await assert.rejects(() => get('https://services.nvd.nist.gov/x'), /failed after 3 attempts/);
  const bad = createClient({ fetchImpl: async () => ({ ok: false, status: 404 }), sleepImpl: async () => {}, log: () => {} });
  await assert.rejects(() => bad('https://services.nvd.nist.gov/x'), /HTTP 404/);
});

test('buildDayFile records its window', () => {
  const f = buildDayFile({ date: '2026-11-06', start: 's', end: 'e' }, [], 'now');
  assert.equal(f.totalResults, 0);
  assert.equal(f.windowStart, 's');
});
