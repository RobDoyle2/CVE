import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiService, AiDisabledError, buildAiRequest, AI_TASKS } from '../../js/services/ai-service.js';
import { DataStore, MemoryProvider } from '../../js/core/store.js';
import { buildSampleSnapshot } from '../../js/data/sample-data.js';
import { assessCve } from '../../js/services/assessment-engine.js';

const setup = async () => {
  const store = await new DataStore(new MemoryProvider({ seed: () => buildSampleSnapshot(1) })).init();
  return assessCve(store.get('vulnerabilities', 'CVE-2099-10001'), store);
};

test('request payload is minimised (no owners, emails or account numbers)', async () => {
  const result = await setup();
  for (const task of Object.keys(AI_TASKS)) {
    const json = JSON.stringify(buildAiRequest(task, result));
    assert.ok(!/Marcus Chen|Dana Whitfield|@example\.com|100000000\d{3}|corp-prod/.test(json), `${task} leaks identifying data`);
  }
});

test('disabled mode refuses; simulated mode is labelled', async () => {
  const result = await setup();
  await assert.rejects(() => new AiService({ mode: 'disabled' }).run('interpret', result), AiDisabledError);
  const r = await new AiService({ mode: 'simulated' }).run('summariseImpact', result);
  assert.equal(r.simulated, true);
  assert.match(r.disclaimer, /not evidence/);
  assert.ok(!/%|probab|confiden/i.test(r.output));
});

test('backend mode posts to the configured endpoint with credentials and validates the response', async () => {
  const result = await setup();
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, json: async () => ({ output: 'ok', model: 'approved-model' }) }; };
  const svc = new AiService({ mode: 'backend', endpoint: '/api/ai', fetchImpl });
  const r = await svc.run('interpret', result);
  assert.equal(calls[0].url, '/api/ai/interpret');
  assert.equal(calls[0].opts.credentials, 'include');
  assert.ok(!/authorization|api[-_]?key/i.test(JSON.stringify(calls[0].opts.headers)));
  assert.equal(r.output, 'ok');
  const bad = new AiService({ mode: 'backend', endpoint: '/api/ai', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  await assert.rejects(() => bad.run('interpret', result), /expected format/);
  await assert.rejects(() => new AiService({ mode: 'backend', endpoint: 'http://insecure' }).run('interpret', result), /https/);
});
