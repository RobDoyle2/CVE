import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPORTS } from '../../js/services/reports.js';
import { buildXlsx } from '../../js/services/xlsx.js';
import { DataStore, MemoryProvider } from '../../js/core/store.js';
import { buildSampleSnapshot } from '../../js/data/sample-data.js';

test('every report builds consistent sheets and a valid workbook', async () => {
  const store = await new DataStore(new MemoryProvider({ seed: () => buildSampleSnapshot(1) })).init();
  for (const r of REPORTS) {
    const sheets = r.build(store);
    assert.ok(sheets.length >= 1, r.id);
    for (const s of sheets) {
      const width = s.rows[0].length;
      for (const row of s.rows) assert.equal(row.length, width, `${r.id}/${s.name} row width`);
    }
    const bytes = buildXlsx(sheets);
    assert.equal(bytes[0], 0x50); // "PK"
  }
  const exec = REPORTS.find((r) => r.id === 'executive').build(store);
  assert.ok(exec[1].rows.some((row) => row[0] === 'P1' && row[1] === 'CVE-2099-10001'));
  const dq = REPORTS.find((r) => r.id === 'quality').build(store)[0].rows;
  assert.ok(dq.some((row) => row[1] === 'SW-019' && row[3] === 'Version not recorded'));
  assert.ok(dq.some((row) => row[1] === 'APP-010' && row[3] === 'No infrastructure recorded'));
});
