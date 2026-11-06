// Performance check: synthetic enterprise-scale dataset (fictional).
// Usage: node tests/perf/scale.mjs [apps] [software] [cves]
import { DataStore, MemoryProvider } from '../../js/core/store.js';
import { buildSampleSnapshot } from '../../js/data/sample-data.js';
import { assessAll } from '../../js/services/assessment-engine.js';

const [APPS = 400, SW = 3000, CVES = 2000] = process.argv.slice(2).map(Number);
const vendors = Array.from({ length: 150 }, (_, i) => `Vendor ${i}`);
const snap = buildSampleSnapshot(1);
const c = snap.collections;
for (let i = 0; i < APPS; i += 1) c.applications.push({ ...c.applications[0], id: `APP-${1000 + i}`, name: `Synthetic app ${i}` });
for (let i = 0; i < SW; i += 1) {
  const v = vendors[i % vendors.length];
  c.software.push({ ...c.software[0], id: `SW-${1000 + i}`, vendor: v, product: `Product ${i % 900} Suite`, version: `${i % 7}.${i % 13}.${i % 5}` });
  c.deployments.push({ id: `DEP-${10000 + i}`, applicationId: `APP-${1000 + (i % APPS)}`, softwareId: `SW-${1000 + i}`, infrastructureId: 'INF-001', environment: 'Production', location: '' });
}
for (let i = 0; i < CVES; i += 1) {
  c.vulnerabilities.push({ ...c.vulnerabilities[0], id: `CVE-2098-${10000 + i}`, vendor: vendors[(i * 7) % vendors.length], product: `Product ${(i * 11) % 900} Suite`, affectedVersions: `>=${i % 7}.0.0 <${i % 7}.${(i % 13) + 1}.0` });
}
const store = await new DataStore(new MemoryProvider({ seed: () => snap })).init();
const t0 = performance.now();
const results = assessAll(store);
const ms = Math.round(performance.now() - t0);
const findings = results.reduce((n, r) => n + r.findings.length, 0);
console.log(`${store.count('applications')} apps, ${store.count('software')} software, ${store.count('deployments')} deployments, ${store.count('vulnerabilities')} CVEs -> ${findings} findings in ${ms} ms`);
