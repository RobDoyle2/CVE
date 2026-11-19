// NVD CVE API 2.0 feed handling, shared by the GitHub Actions fetcher
// (scripts/fetch-nvd.mjs, Node) and the browser (Monitoring Sources).
//
// Published feed layout (same origin as the app, so no CORS or CSP changes):
//   feeds/nvd/index.json          coverage window, generation time, day list
//   feeds/nvd/YYYY-MM-DD.json     CVEs whose NVD lastModified falls on that UTC day,
//                                 trimmed to the fields this application uses
//
// No API key ever reaches the browser: the key (optional) is a GitHub Actions
// secret used only by the fetch script.

import { parseVersion } from './version.js';

export const NVD_API_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
export const NVD_ATTRIBUTION = 'This product uses the NVD API but is not endorsed or certified by the NVD.';
export const FEED_FORMAT = 'VMT_NVD_COMPACT';
export const FEED_VERSION = 1;
export const DEFAULT_FEED_URL = 'feeds/nvd/index.json';
export const MAX_PRODUCTS_PER_CVE = 200;

const DAY_MS = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// ------------------------------------------------------------------ windows
/**
 * UTC day windows covering the last `retentionDays` days, oldest first.
 * NVD limits a lastModified range to 120 days; one request window per day
 * also keeps each published file to a few megabytes.
 */
export function dayWindows(now, retentionDays) {
  const days = Math.max(1, Math.min(120, Math.floor(retentionDays)));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const start = today - i * DAY_MS;
    const date = isoDay(start);
    out.push({ date, start: `${date}T00:00:00.000Z`, end: `${date}T23:59:59.999Z` });
  }
  return out;
}

export function nvdPageUrl(window, startIndex, resultsPerPage = 2000) {
  const q = new URLSearchParams({
    lastModStartDate: window.start,
    lastModEndDate: window.end,
    resultsPerPage: String(resultsPerPage),
    startIndex: String(startIndex),
  });
  return `${NVD_API_URL}?${q}`;
}

/**
 * Which day files the browser needs, given the time of its last successful
 * import. One day of overlap is re-read because files are regenerated during
 * the day; re-reading is harmless (unchanged records are recognised).
 * @returns {{days:Array, gap:boolean, gapFrom?:string, gapTo?:string}}
 */
export function daysToFetch(index, lastCheckIso) {
  const days = [...(index.days || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return { days: [], gap: false };
  if (!lastCheckIso) return { days, gap: false, firstImport: true };
  const from = isoDay(Date.parse(lastCheckIso) - DAY_MS);
  const selected = days.filter((d) => d.date >= from);
  const earliest = days[0].date;
  const gap = from < earliest;
  return { days: selected, gap, gapFrom: gap ? from : undefined, gapTo: gap ? earliest : undefined };
}

// ------------------------------------------------------------------ CVSS
const METRIC_ORDER = ['cvssMetricV31', 'cvssMetricV30', 'cvssMetricV40', 'cvssMetricV2'];

/** Pick one CVSS score: prefer v3.1/v3.0 (most widely used), then v4.0, then v2; NVD (Primary) before CNA (Secondary). */
export function selectMetric(metrics = {}) {
  for (const key of METRIC_ORDER) {
    const list = metrics[key];
    if (!Array.isArray(list) || !list.length) continue;
    const m = list.find((x) => x.type === 'Primary') || list[0];
    const d = m.cvssData || {};
    const sev = d.baseSeverity || m.baseSeverity;
    if (typeof d.baseScore !== 'number') continue;
    return {
      key,
      version: d.version || key.replace('cvssMetricV', '').replace(/(\d)(\d)$/, '$1.$2'),
      score: d.baseScore,
      severity: sev ? sev[0] + sev.slice(1).toLowerCase() : null,
      vector: d.vectorString || '',
      source: m.type || '',
    };
  }
  return null;
}

// ------------------------------------------------------------------ compaction
/** Reduce one NVD API item to the fields this application uses. */
export function compactNvdItem(item) {
  const c = item.cve || {};
  const metric = selectMetric(c.metrics);
  const en = (c.descriptions || []).find((d) => d.lang === 'en');
  const cve = {
    id: c.id,
    published: c.published,
    lastModified: c.lastModified,
    vulnStatus: c.vulnStatus,
    descriptions: en ? [{ lang: 'en', value: String(en.value).slice(0, 8000) }] : [],
  };
  if (metric) {
    cve.metrics = { [metric.key]: [{ type: metric.source, cvssData: { version: metric.version, baseScore: metric.score, baseSeverity: metric.severity ? metric.severity.toUpperCase() : undefined, vectorString: metric.vector } }] };
  }
  // Pre-computed affected products (NVD analysed CPE data, else CNA data) replace the
  // much larger raw configuration/affected lists.
  const products = productsFromConfigurations(c.configurations);
  const cna = productsFromAffected(c.affected);
  const vmtProducts = products.length ? products : cna;
  if (vmtProducts.length) cve.vmtProducts = vmtProducts;
  // The CNA's product name helps choose which NVD product to show as primary.
  if (products.length && cna.length) cve.vmtCnaProduct = cna[0].product;
  cve.references = (c.references || []).map((r) => r.url).filter((u) => /^https:\/\//.test(u || '')).slice(0, 15).map((url) => ({ url }));
  // Retained for the planned CISA KEV integration (not used yet).
  for (const k of ['cisaExploitAdd', 'cisaActionDue', 'cisaRequiredAction', 'cisaVulnerabilityName']) if (c[k]) cve[k] = c[k];
  return { cve };
}

export function buildDayFile(window, items, generatedAt) {
  return {
    format: FEED_FORMAT, feedVersion: FEED_VERSION, source: NVD_API_URL, attribution: NVD_ATTRIBUTION,
    date: window.date, windowStart: window.start, windowEnd: window.end, generatedAt,
    totalResults: items.length,
    vulnerabilities: items.map(compactNvdItem),
  };
}

export function buildIndex({ generatedAt, retentionDays, apiKeyUsed, days }) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return {
    format: FEED_FORMAT, feedVersion: FEED_VERSION, source: NVD_API_URL, attribution: NVD_ATTRIBUTION,
    generatedAt, retentionDays, apiKeyUsed: !!apiKeyUsed,
    coverageStart: sorted.length ? sorted[0].windowStart : null,
    coverageEnd: generatedAt,
    totalCves: sorted.reduce((n, d) => n + d.count, 0),
    days: sorted.map(({ date, file, count, bytes }) => ({ date, file, count, bytes })),
  };
}

// ------------------------------------------------------------------ product extraction
function cpeParts(criteria) {
  const p = String(criteria || '').split(':');
  if (p.length < 6) return null;
  const clean = (s) => s.replace(/\\(.)/g, '$1').replace(/_/g, ' ');
  return { part: p[2], vendor: clean(p[3]), product: clean(p[4]), version: p[5] };
}

/** Products and version ranges from NVD's own (analysed) CPE configurations. */
export function productsFromConfigurations(configurations = []) {
  const map = new Map();
  for (const conf of configurations) {
    for (const node of conf.nodes || []) {
      for (const m of node.cpeMatch || []) {
        if (!m.vulnerable) continue;
        const parts = cpeParts(m.criteria);
        if (!parts) continue;
        const key = `${parts.vendor}|${parts.product}`;
        if (!map.has(key)) map.set(key, { vendor: parts.vendor, product: parts.product, ranges: [], fixed: [], any: false, source: 'NVD' });
        const p = map.get(key);
        const conds = [];
        if (m.versionStartIncluding) conds.push(`>=${m.versionStartIncluding}`);
        if (m.versionStartExcluding) conds.push(`>${m.versionStartExcluding}`);
        if (m.versionEndIncluding) conds.push(`<=${m.versionEndIncluding}`);
        if (m.versionEndExcluding) { conds.push(`<${m.versionEndExcluding}`); p.fixed.push(m.versionEndExcluding); }
        if (!conds.length && parts.version && parts.version !== '*' && parts.version !== '-') {
          const v = parts.version.replace(/\\(.)/g, '$1');
          // A CPE version such as "4.12" denotes the whole release line (4.12.x);
          // treating it as exactly 4.12 would wrongly clear 4.12.20.
          if (/^\d+(\.\d+)?$/.test(v)) p.ranges.push(`${v}.x`);
          else if (parseVersion(v)) p.ranges.push(`=${v}`);
          continue;
        }
        if (conds.length) p.ranges.push(conds.join(' ')); else p.any = true;
      }
    }
  }
  return finishProducts([...map.values()]);
}

const NO_VERSION = /^(\*|n\/a|na|unspecified|unknown|all|0|-|)$/i;
const cleanV = (v) => String(v ?? '').trim().replace(/^\d+:(?=\d)/, ''); // drop RPM epoch "0:"
const usable = (v) => !!parseVersion(v) && !/[*]/.test(v);

/**
 * Products and ranges from the CNA's "affected" data (CVE JSON 5 semantics).
 * Used when NVD has not (yet) analysed the CVE. Version schemes vary by
 * vendor (semver, rpm, custom, git); entries that cannot be expressed as
 * numeric ranges are skipped rather than guessed.
 */
export function productsFromAffected(affected = []) {
  const map = new Map();
  for (const a of affected) {
    for (const ad of a.affectedData || []) {
      if (!ad.vendor || !ad.product || /^n\/a$/i.test(ad.vendor) || /^n\/a$/i.test(ad.product)) continue;
      const versions = ad.versions || [];
      const hasAffected = versions.some((v) => v.status === 'affected');
      // Skip products the CNA explicitly marks as not affected.
      if (!hasAffected && ad.defaultStatus !== 'affected' && ad.defaultStatus !== 'unknown') continue;
      // Vendors such as Red Hat put the release in the product name
      // ("OpenShift Container Platform 4.12"); split it into a release-line range.
      let name = String(ad.product).trim();
      let releaseLine = null;
      const rel = name.match(/^(.*[A-Za-z)])\s+v?(\d+(?:\.\d+){0,2})$/);
      if (rel) { name = rel[1]; releaseLine = rel[2]; }
      const key = `${ad.vendor}|${name}`;
      if (!map.has(key)) map.set(key, { vendor: ad.vendor, product: name, ranges: [], fixed: [], any: false, source: 'CNA' });
      const p = map.get(key);
      if (releaseLine && (hasAffected || ad.defaultStatus === 'affected')) {
        p.ranges.push(releaseLine.split('.').length < 3 ? `${releaseLine}.x` : `=${releaseLine}`);
        // Fixed package builds (e.g. RPMs) cannot be compared with a product version; record them as evidence.
        for (const v of versions) if (v.status === 'unaffected' && v.version) p.fixed.push(cleanV(v.version));
        continue;
      }
      if (!versions.length && ad.defaultStatus === 'affected') p.any = true;
      for (const v of versions) {
        if (v.status === 'unaffected' && v.lessThan === '*' && v.version) { p.fixed.push(cleanV(v.version)); continue; }
        if (v.status !== 'affected') continue;
        if (v.versionType === 'git') continue;
        const start = cleanV(v.version);
        const hasStart = !NO_VERSION.test(start) && usable(start);
        if (Array.isArray(v.changes) && v.changes.length) {
          // Walk status changes: affected from `start`, toggling at each change point.
          let open = hasStart ? start : null;
          let affectedNow = true;
          for (const ch of [...v.changes].filter((x) => usable(cleanV(x.at)))) {
            const at = cleanV(ch.at);
            if (affectedNow && ch.status === 'unaffected') {
              p.ranges.push(open ? `>=${open} <${at}` : `<${at}`);
              p.fixed.push(at);
              affectedNow = false;
            } else if (!affectedNow && ch.status === 'affected') {
              open = at;
              affectedNow = true;
            }
          }
          if (affectedNow) {
            const lt = cleanV(v.lessThan || v.lessThanOrEqual || '');
            if (usable(lt)) p.ranges.push(`${open ? `>=${open} ` : ''}${v.lessThan ? '<' : '<='}${lt}`);
            else if (open) p.ranges.push(`>=${open}`);
          }
          continue;
        }
        const ltRaw = v.lessThan || v.lessThanOrEqual;
        if (ltRaw) {
          const lt = cleanV(ltRaw);
          const op = v.lessThan ? '<' : '<=';
          if (usable(lt)) {
            p.ranges.push(hasStart ? `>=${start} ${op}${lt}` : `${op}${lt}`);
            if (op === '<') p.fixed.push(lt);
          } else if (hasStart && lt === '*') {
            p.ranges.push(`>=${start}`);
          }
          continue;
        }
        if (hasStart) p.ranges.push(`=${start}`);
      }
    }
  }
  return finishProducts([...map.values()]);
}

function finishProducts(list) {
  return list.slice(0, MAX_PRODUCTS_PER_CVE).map((p) => ({
    vendor: p.vendor,
    product: p.product,
    affectedVersions: p.any ? '*' : [...new Set(p.ranges)].join(' || '),
    fixedVersions: [...new Set(p.fixed)].join(', '),
    source: p.source,
  }));
}

/** Join whole items with a separator without exceeding maxLength. */
export function joinWithin(items, sep, maxLength) {
  let out = '';
  for (const it of items) {
    const next = out ? `${out}${sep}${it}` : it;
    if (next.length > maxLength) break;
    out = next;
  }
  return out;
}
