// Version parsing and range evaluation.
//
// Real-world version strings are inconsistent (semver, OpenSSL letter
// suffixes, release candidates, distro builds). This module deliberately
// reports "unknown" instead of guessing when a string cannot be parsed, so the
// assessment engine can flag it rather than produce a false match.

const PRERELEASE_WORDS = ['dev', 'snapshot', 'alpha', 'a', 'beta', 'b', 'pre', 'preview', 'm', 'milestone', 'rc', 'cr'];
const IGNORED_WORDS = ['final', 'ga', 'release', 'r'];

/**
 * Parse a version string into comparable tokens.
 * @returns {{raw:string, tokens:Array<{n?:number,s?:string,pre?:boolean}>, nonStandard:boolean}|null}
 */
export function parseVersion(input) {
  if (input === null || input === undefined) return null;
  let raw = String(input).trim();
  if (!raw || !/\d/.test(raw)) return null;
  raw = raw.replace(/^v(?=\d)/i, '');
  const tokens = [];
  let nonStandard = false;
  const re = /(\d+)|([a-z]+)/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    if (m[1] !== undefined) {
      tokens.push({ n: Number(m[1]) });
    } else {
      const word = m[2].toLowerCase();
      if (IGNORED_WORDS.includes(word)) continue;
      const pre = PRERELEASE_WORDS.includes(word);
      tokens.push({ s: word, pre });
      nonStandard = true;
    }
  }
  if (!tokens.length || tokens[0].n === undefined) return null;
  return { raw, tokens, nonStandard };
}

function tokenRank(t) {
  // Ordering of token kinds at the same position:
  // prerelease word < (missing) < post-release letter < number
  if (!t) return 1;
  if (t.n !== undefined) return 3;
  return t.pre ? 0 : 2;
}

/** Compare two version strings. Returns -1, 0, 1 or null if either is unparseable. */
export function compareVersions(a, b) {
  const va = typeof a === 'object' && a ? a : parseVersion(a);
  const vb = typeof b === 'object' && b ? b : parseVersion(b);
  if (!va || !vb) return null;
  const len = Math.max(va.tokens.length, vb.tokens.length);
  for (let i = 0; i < len; i += 1) {
    const ta = va.tokens[i];
    const tb = vb.tokens[i];
    // A missing numeric position counts as zero, so 1.0 == 1.0.0
    if (!ta && tb && tb.n === 0) continue;
    if (!tb && ta && ta.n === 0) continue;
    const ra = tokenRank(ta);
    const rb = tokenRank(tb);
    if (ra !== rb) return ra < rb ? -1 : 1;
    if (!ta && !tb) return 0;
    if (ta.n !== undefined) {
      if (ta.n !== tb.n) return ta.n < tb.n ? -1 : 1;
    } else if (ta.s !== tb.s) {
      if (ta.pre) {
        const ia = PRERELEASE_WORDS.indexOf(ta.s);
        const ib = PRERELEASE_WORDS.indexOf(tb.s);
        if (ia !== ib) return ia < ib ? -1 : 1;
      }
      return ta.s < tb.s ? -1 : 1;
    }
  }
  return 0;
}

const OP_RE = /^(>=|<=|==|=|>|<)?\s*(.+)$/;

function wildcardToRange(v) {
  // 2.4.x / 2.4.* -> >=2.4 <2.5
  const parts = v.split('.');
  const idx = parts.findIndex((p) => p === 'x' || p === 'X' || p === '*');
  if (idx <= 0) return null;
  const base = parts.slice(0, idx).map(Number);
  if (base.some(Number.isNaN)) return null;
  const upper = [...base];
  upper[upper.length - 1] += 1;
  return [
    { op: '>=', version: base.join('.') },
    { op: '<', version: upper.join('.') },
  ];
}

/**
 * Parse an affected-versions expression.
 * Syntax: ranges separated by "||" or ";". Each range is one or more
 * conditions: ">=2.0.0 <2.17.1", "=1.2.3", "1.2.3", "2.4.x", "1.0 - 1.5", "*".
 */
export function parseRangeExpression(expr) {
  const text = String(expr ?? '').trim();
  if (!text) return { ok: true, empty: true, any: false, ranges: [] };
  if (text === '*' || /^all( versions)?$/i.test(text)) return { ok: true, empty: false, any: true, ranges: [] };
  const ranges = [];
  for (const chunk of text.split(/\|\||;/)) {
    const part = chunk.trim();
    if (!part) continue;
    const hyphen = part.match(/^(\S+)\s+-\s+(\S+)$/);
    if (hyphen) {
      if (!parseVersion(hyphen[1]) || !parseVersion(hyphen[2])) {
        return { ok: false, error: `Invalid version in range "${part}"` };
      }
      ranges.push({ conds: [{ op: '>=', version: hyphen[1] }, { op: '<=', version: hyphen[2] }] });
      continue;
    }
    const conds = [];
    // Split into condition tokens, tolerating spaces between operator and version.
    const tokens = part.replace(/(>=|<=|==|=|>|<)\s+/g, '$1').split(/\s+/);
    for (const tok of tokens) {
      const m = tok.match(OP_RE);
      if (!m) return { ok: false, error: `Cannot parse "${tok}"` };
      const op = m[1] === '==' ? '=' : (m[1] || '=');
      const version = m[2];
      if (op === '=' && /[.](x|\*)($|\.)/i.test(version)) {
        const w = wildcardToRange(version);
        if (!w) return { ok: false, error: `Invalid wildcard "${version}"` };
        conds.push(...w);
        continue;
      }
      if (!parseVersion(version)) return { ok: false, error: `Invalid version "${version}"` };
      conds.push({ op, version });
    }
    if (conds.length) ranges.push({ conds });
  }
  if (!ranges.length) return { ok: false, error: 'No version ranges found' };
  return { ok: true, empty: false, any: false, ranges };
}

function condHolds(cmp, op) {
  switch (op) {
    case '=': return cmp === 0;
    case '>': return cmp > 0;
    case '>=': return cmp >= 0;
    case '<': return cmp < 0;
    case '<=': return cmp <= 0;
    default: return false;
  }
}

/**
 * Evaluate whether a version falls within an affected-versions expression.
 * @returns {{result:'in-range'|'out-of-range'|'unknown-version'|'no-range-data'|'invalid-range', matchedRange?:string, detail:string}}
 */
export function evaluateVersion(version, expression) {
  const parsedExpr = typeof expression === 'object' && expression && 'ok' in expression
    ? expression : parseRangeExpression(expression);
  if (!parsedExpr.ok) return { result: 'invalid-range', detail: parsedExpr.error };
  if (parsedExpr.empty) return { result: 'no-range-data', detail: 'The vulnerability record does not specify affected versions.' };
  const v = parseVersion(version);
  if (!v) {
    return { result: 'unknown-version', detail: version ? `Recorded version "${version}" could not be interpreted.` : 'No version is recorded for this software.' };
  }
  if (parsedExpr.any) return { result: 'in-range', matchedRange: '*', detail: 'All versions are listed as affected.' };
  for (const range of parsedExpr.ranges) {
    const ok = range.conds.every((c) => condHolds(compareVersions(v, c.version), c.op));
    if (ok) {
      const label = range.conds.map((c) => `${c.op}${c.version}`).join(' ');
      return { result: 'in-range', matchedRange: label, detail: `Version ${v.raw} satisfies affected range ${label}.` };
    }
  }
  return {
    result: 'out-of-range',
    detail: `Version ${v.raw} is outside all affected ranges (${describeExpression(parsedExpr)}).`,
  };
}

export function describeExpression(parsed) {
  const p = typeof parsed === 'string' ? parseRangeExpression(parsed) : parsed;
  if (!p.ok) return 'invalid';
  if (p.empty) return 'not specified';
  if (p.any) return 'all versions';
  return p.ranges.map((r) => r.conds.map((c) => `${c.op}${c.version}`).join(' ')).join(' OR ');
}
