import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, parseRangeExpression, evaluateVersion, parseVersion } from '../../js/services/version.js';

test('compares numeric versions', () => {
  assert.equal(compareVersions('9.0.80', '9.0.85'), -1);
  assert.equal(compareVersions('9.0.85', '9.0.80'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('v2.17.1', '2.17.1'), 0);
  assert.equal(compareVersions('10.0', '9.9.9'), 1);
});

test('handles OpenSSL-style letter suffixes and pre-releases', () => {
  assert.equal(compareVersions('1.1.1k', '1.1.1u'), -1);
  assert.equal(compareVersions('1.1.1', '1.1.1k'), -1);
  assert.equal(compareVersions('3.0.0-rc1', '3.0.0'), -1);
  assert.equal(compareVersions('3.0.0-beta2', '3.0.0-rc1'), -1);
});

test('unparseable versions return null rather than guessing', () => {
  assert.equal(parseVersion(''), null);
  assert.equal(parseVersion('latest'), null);
  assert.equal(compareVersions('', '1.0'), null);
});

test('parses range expressions', () => {
  const p = parseRangeExpression('>=2.0.0 <2.17.0 || =1.2.3');
  assert.equal(p.ok, true);
  assert.equal(p.ranges.length, 2);
  assert.equal(parseRangeExpression('>= 9.0.0 < 9.0.85').ok, true);
  assert.equal(parseRangeExpression('2.4.x').ranges[0].conds.length, 2);
  assert.equal(parseRangeExpression('1.0 - 1.5').ok, true);
  assert.equal(parseRangeExpression('*').any, true);
  assert.equal(parseRangeExpression('').empty, true);
  assert.equal(parseRangeExpression('>=banana').ok, false);
});

test('evaluates versions against ranges', () => {
  const expr = '>=9.0.0 <9.0.85 || >=10.1.0 <10.1.18';
  assert.equal(evaluateVersion('9.0.80', expr).result, 'in-range');
  assert.equal(evaluateVersion('9.0.86', expr).result, 'out-of-range');
  assert.equal(evaluateVersion('10.1.17', expr).result, 'in-range');
  assert.equal(evaluateVersion('8.5.0', expr).result, 'out-of-range');
  assert.equal(evaluateVersion('', expr).result, 'unknown-version');
  assert.equal(evaluateVersion('9.0.80', '').result, 'no-range-data');
  assert.equal(evaluateVersion('1.1.1k', '>=1.1.1 <1.1.1u').result, 'in-range');
  assert.equal(evaluateVersion('2.4.9', '2.4.x').result, 'in-range');
  assert.equal(evaluateVersion('2.5.0', '2.4.x').result, 'out-of-range');
  assert.equal(evaluateVersion('1.9.4', '<1.10.0').result, 'in-range');
});
