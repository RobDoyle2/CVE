import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseCsv, toCsv, parseCsvObjects, safeCell } from '../../js/services/csv.js';
import { buildXlsx, crc32 } from '../../js/services/xlsx.js';
import { analyseImport, applyImport, templateCsv, exportCsv, IMPORT_TYPES, inventoryWorkbook, assessmentRows } from '../../js/services/data-exchange.js';
import { DataStore, MemoryProvider } from '../../js/core/store.js';
import { buildSampleSnapshot } from '../../js/data/sample-data.js';

const newStore = async () => new DataStore(new MemoryProvider({ seed: () => buildSampleSnapshot(1) })).init();
const analyst = { user: { name: 'Priya Shah', role: 'Security Analyst' }, can: (p) => ['read', 'write', 'review', 'import', 'delete'].includes(p) };
const contributor = { user: { name: 'Jordan Lee', role: 'Contributor' }, can: (p) => ['read', 'submit'].includes(p) };

test('CSV parses quotes, embedded commas/newlines, CRLF and BOM', () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","line1\nline2","he said ""hi"""\r\n\r\n1,2,3');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'line1\nline2', 'he said "hi"'], ['1', '2', '3']]);
  assert.throws(() => parseCsv('a,"b'), /unterminated/);
});

test('CSV export neutralises formula injection and round-trips', () => {
  assert.equal(safeCell('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.equal(safeCell('-1.5'), '-1.5');
  assert.equal(safeCell('@SUM(A1)'), "'@SUM(A1)");
  const csv = toCsv([['h1', 'h2'], ['=cmd', 'a,b']]);
  const { records } = parseCsvObjects(csv);
  assert.equal(records[0].h1, '=cmd');
  assert.equal(records[0].h2, 'a,b');
});

test('CRC32 matches known value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('XLSX output opens in openpyxl with correct sheets and values', () => {
  const bytes = buildXlsx([
    { name: 'Apps', rows: [['ID', 'Name', 'Score'], ['APP-001', 'Café & <Portal>', 9.8]] },
    { name: 'Bad/Name:*?', rows: [['x'], ['=1+1']] },
  ]);
  const dir = mkdtempSync(path.join(tmpdir(), 'vmt-'));
  const file = path.join(dir, 'test.xlsx');
  writeFileSync(file, bytes);
  const out = execFileSync('python3', ['-I', '-c', `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
print(json.dumps({ws.title: [[c.value for c in r] for r in ws.iter_rows()] for ws in wb.worksheets}))
`, file]).toString();
  const data = JSON.parse(out);
  assert.deepEqual(Object.keys(data), ['Apps', 'Bad Name']);
  assert.deepEqual(data.Apps[1], ['APP-001', 'Café & <Portal>', 9.8]);
  assert.equal(data['Bad Name'][1][0], '=1+1'); // stored as text, not a formula
});

test('templates contain only importable columns and pass analysis', async () => {
  const store = await newStore();
  for (const type of Object.keys(IMPORT_TYPES)) {
    const a = analyseImport(type, templateCsv(type), store);
    assert.deepEqual(a.headerErrors, [], `${type} template headers`);
    assert.equal(a.summary.error, 0, `${type} template rows: ${JSON.stringify(a.rows.map((r) => r.errors))}`);
  }
});

test('import analysis detects duplicates, validation errors and bad relationships', async () => {
  const store = await newStore();
  const csv = [
    'id,name,description,businessOwner,technicalOwner,criticality,environments,internetFacing,businessFunction,notes,infrastructureIds',
    ',New Service,,Own A,Own B,High,Production,yes,Payments,,INF-004',
    ',customer portal,,Own A,Own B,High,Production,no,Payments,,',
    ',Broken App,,Own A,,Extreme,Prod,maybe,Payments,,INF-999',
    ',New Service,,Own A,Own B,High,Production,yes,Payments,,',
  ].join('\n');
  const a = analyseImport('applications', csv, store);
  assert.equal(a.rows[0].action, 'create');
  assert.equal(a.rows[1].action, 'duplicate');
  assert.match(a.rows[1].duplicateReason, /APP-001/);
  assert.equal(a.rows[2].action, 'error');
  const errs = a.rows[2].errors.join(' ');
  assert.match(errs, /not yes\/no/);
  assert.match(errs, /Technical owner is required/);
  assert.match(errs, /Business criticality must be one of/);
  assert.match(errs, /INF-999/);
  assert.equal(a.rows[3].action, 'error');
  assert.match(a.rows[3].errors.join(' '), /Duplicate of row 2/);
});

test('missing required columns are reported before any row', async () => {
  const store = await newStore();
  const a = analyseImport('vulnerabilities', 'id,title\nCVE-2099-1,Test', store);
  assert.match(a.headerErrors[0], /Missing required column/);
});

test('apply import creates records, preserves relationships and respects duplicate mode', async () => {
  const store = await newStore();
  const csv = [
    'id,vendor,product,category,version,verificationStatus,applicationIds,environment,infrastructureId,deploymentLocation',
    ',Example Co,Widget,Library / dependency,1.2.3,Verified,APP-002,,INF-004,lib/widget.jar',
    'SW-001,Apache Software Foundation,Tomcat,Web server,9.0.80,Needs review,,,,',
  ].join('\n');
  const a = analyseImport('software', csv, store);
  assert.equal(a.summary.create, 1);
  assert.equal(a.summary.duplicate, 1);
  const r1 = await applyImport(a, { duplicateMode: 'skip', session: contributor }, store);
  assert.deepEqual([r1.created, r1.skipped, r1.links], [1, 1, 1]);
  const sw = store.find('software', (s) => s.product === 'Widget')[0];
  assert.equal(sw.reviewStatus, 'Pending review');
  assert.equal(sw.submittedBy, 'Jordan Lee');
  const dep = store.find('deployments', (d) => d.softwareId === sw.id)[0];
  assert.equal(dep.environment, 'Production'); // derived from INF-004
  // Update mode changes the existing record; empty cells leave values unchanged
  const r2 = await applyImport(analyseImport('software', csv, store), { duplicateMode: 'update', session: analyst }, store);
  assert.equal(r2.updated, 2);
  assert.equal(store.get('software', 'SW-001').verificationStatus, 'Needs review');
  assert.equal(store.get('software', 'SW-001').description, 'Java servlet container.');
});

test('exports re-import as duplicates (round trip)', async () => {
  const store = await newStore();
  for (const type of ['applications', 'software', 'vulnerabilities', 'infrastructure', 'awsAccounts', 'deployments']) {
    const a = analyseImport(type, exportCsv(type, store), store);
    assert.deepEqual(a.headerErrors, [], type);
    assert.equal(a.summary.error, 0, `${type}: ${JSON.stringify(a.rows.filter((r) => r.errors.length).slice(0, 2))}`);
    assert.equal(a.summary.duplicate, store.count(IMPORT_TYPES[type].collection), type);
  }
});

test('workbook and assessment export', async () => {
  const store = await newStore();
  const sheets = inventoryWorkbook(store);
  assert.equal(sheets.length, 7);
  const rows = assessmentRows(store);
  assert.ok(rows.length > 10);
  assert.ok(rows.some((r) => r[0] === 'CVE-2099-10009' && r[14] === 'No inventory match'));
});
