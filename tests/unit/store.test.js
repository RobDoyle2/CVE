import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataStore, MemoryProvider, LocalStorageProvider } from '../../js/core/store.js';
import { buildSampleSnapshot } from '../../js/data/sample-data.js';
import { validateRecord } from '../../js/services/validation.js';

const newStore = async () => new DataStore(new MemoryProvider({ seed: () => buildSampleSnapshot(1) })).init();

test('sample data is internally consistent', async () => {
  const store = await newStore();
  const errors = [];
  for (const c of ['applications', 'awsAccounts', 'infrastructure', 'applicationInfrastructure', 'software', 'deployments', 'vulnerabilities', 'assessmentReviews', 'monitoringSources']) {
    for (const r of store.all(c)) {
      const { valid, errors: e } = validateRecord(c, r, { store, existingId: r.id });
      if (!valid) errors.push(`${c} ${r.id}: ${JSON.stringify(e)}`);
    }
  }
  assert.deepEqual(errors, []);
});

test('creates records with generated IDs and audit entries', async () => {
  const store = await newStore();
  const before = store.count('auditLog');
  const app = await store.create('applications', {
    name: 'Test App', businessOwner: 'A', technicalOwner: 'B', criticality: 'Low',
    environments: ['Test'], internetFacing: false, businessFunction: 'Other',
  });
  assert.equal(app.id, 'APP-011');
  assert.equal(store.count('auditLog'), before + 1);
});

test('rejects invalid and duplicate records', async () => {
  const store = await newStore();
  await assert.rejects(() => store.create('applications', { name: 'X' }), /required/);
  await assert.rejects(() => store.create('applications', {
    name: 'customer portal', businessOwner: 'A', technicalOwner: 'B', criticality: 'Low', environments: ['Test'], businessFunction: 'Other',
  }), /already exists/);
  await assert.rejects(() => store.create('awsAccounts', { accountName: 'x', accountId: '123', environment: 'Test', owner: 'y' }), /12 digits/);
  await assert.rejects(() => store.create('deployments', { applicationId: 'APP-999', softwareId: 'SW-001', environment: 'Test' }), /does not exist/);
});

test('cascades deletes through join tables', async () => {
  const store = await newStore();
  const linksBefore = store.find('applicationInfrastructure', (l) => l.applicationId === 'APP-001').length;
  assert.ok(linksBefore > 0);
  const impact = await store.remove('applications', 'APP-001');
  assert.ok(impact.cascade.length >= linksBefore);
  assert.equal(store.find('applicationInfrastructure', (l) => l.applicationId === 'APP-001').length, 0);
  assert.equal(store.find('deployments', (d) => d.applicationId === 'APP-001').length, 0);
});

test('restricts deletion of AWS accounts still in use', async () => {
  const store = await newStore();
  await assert.rejects(() => store.remove('awsAccounts', 'AWS-001'), /still referenced/);
  await store.remove('awsAccounts', 'AWS-011'); // unused
  assert.equal(store.get('awsAccounts', 'AWS-011'), null);
});

test('transactions roll back on failure', async () => {
  const store = await newStore();
  const count = store.count('applications');
  await assert.rejects(() => store.transaction(async (s) => {
    await s.create('applications', { name: 'Tx App', businessOwner: 'A', technicalOwner: 'B', criticality: 'Low', environments: ['Test'], businessFunction: 'Other' });
    throw new Error('boom');
  }));
  assert.equal(store.count('applications'), count);
});

test('LocalStorageProvider persists and reloads', async () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const opts = { storage, key: 'k', seed: () => buildSampleSnapshot(1), schemaVersion: 1 };
  const s1 = await new DataStore(new LocalStorageProvider(opts)).init();
  await s1.update('applications', 'APP-007', { notes: 'changed' });
  const s2 = await new DataStore(new LocalStorageProvider(opts)).init();
  assert.equal(s2.get('applications', 'APP-007').notes, 'changed');
});
