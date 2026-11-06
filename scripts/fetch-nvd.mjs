#!/usr/bin/env node
// Fetch recently modified CVEs from the NIST NVD CVE API 2.0 and publish them
// as static JSON files that the web application reads from its own origin.
//
// Runs in GitHub Actions (see .github/workflows/pages.yml) or locally:
//   node scripts/fetch-nvd.mjs [--days 7] [--out feeds/nvd]
//
// Environment:
//   NVD_RETENTION_DAYS  days of changes to keep in the feed (default 7, max 120)
//   NVD_API_KEY   optional. Raises the NVD rate limit from 5 to 50 requests per
//                 30 seconds. Stored as a GitHub Actions secret - never in code
//                 and never published with the site.
//
// The script fetches every CVE whose NVD lastModified date falls in the
// window; it does NOT filter by the organisation's inventory, so nothing about
// the inventory is revealed in the public feed. Filtering happens in the browser.
//
// Exit code is non-zero if any day could not be fetched, so the deployment
// step is skipped and the previously published feed stays live.

import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayWindows, nvdPageUrl, buildDayFile, buildIndex } from '../js/services/nvd-feed.js';

const RESULTS_PER_PAGE = 2000;

export function parseArgs(argv) {
  const opts = { days: Number(process.env.NVD_RETENTION_DAYS) || 7, out: 'feeds/nvd' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--days') opts.days = Number(argv[++i]);
    else if (argv[i] === '--out') opts.out = argv[++i];
  }
  if (!Number.isInteger(opts.days) || opts.days < 1 || opts.days > 120) throw new Error('--days must be an integer from 1 to 120');
  return opts;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Minimal NVD client with rate limiting and retries.
 * NVD guidance: without a key, 5 requests per rolling 30 s; with a key, 50.
 */
export function createClient({ apiKey, fetchImpl = fetch, sleepImpl = sleep, log = console.log, maxAttempts = 6 } = {}) {
  const gapMs = apiKey ? 700 : 6500;
  let last = 0;
  return async function get(url) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await sleepImpl(wait);
      last = Date.now();
      let res;
      try {
        res = await fetchImpl(url, { headers: { Accept: 'application/json', ...(apiKey ? { apiKey } : {}) } });
      } catch (err) {
        log(`  network error (attempt ${attempt}/${maxAttempts}): ${err.message}`);
        await sleepImpl(Math.min(60000, 2000 * 2 ** attempt));
        continue;
      }
      if (res.ok) return res.json();
      // 403/429 = rate limited; 5xx = NVD service problems (common). Back off and retry.
      if ([403, 429, 500, 502, 503, 504].includes(res.status)) {
        log(`  HTTP ${res.status} (attempt ${attempt}/${maxAttempts}), backing off`);
        await sleepImpl(Math.min(60000, 5000 * 2 ** attempt));
        continue;
      }
      throw new Error(`NVD returned HTTP ${res.status} for ${url}`);
    }
    throw new Error(`NVD request failed after ${maxAttempts} attempts: ${url}`);
  };
}

/** Fetch all pages for one day window. */
export async function fetchDay(get, window, log = console.log) {
  const items = [];
  let startIndex = 0;
  let total = Infinity;
  while (startIndex < total) {
    const page = await get(nvdPageUrl(window, startIndex, RESULTS_PER_PAGE));
    total = Number(page.totalResults) || 0;
    const batch = page.vulnerabilities || [];
    items.push(...batch);
    log(`  ${window.date}: ${items.length}/${total}`);
    if (!batch.length) break;
    startIndex += batch.length;
  }
  if (items.length < total) throw new Error(`${window.date}: received ${items.length} of ${total} records`);
  return items;
}

export async function run({ days, out, apiKey, now = new Date(), fetchImpl, sleepImpl, log = console.log }) {
  const get = createClient({ apiKey, fetchImpl, sleepImpl, log });
  const generatedAt = now.toISOString();
  const windows = dayWindows(now, days);
  log(`Fetching NVD changes for ${windows[0].date} to ${windows[windows.length - 1].date} (${apiKey ? 'with' : 'without'} API key)`);
  await mkdir(out, { recursive: true });
  const written = [];
  for (const w of windows) {
    const items = await fetchDay(get, w, log);
    const file = `${w.date}.json`;
    const body = JSON.stringify(buildDayFile(w, items, generatedAt));
    await writeFile(path.join(out, file), body);
    written.push({ date: w.date, file, count: items.length, bytes: Buffer.byteLength(body), windowStart: w.start });
  }
  // Remove day files that have aged out of the retention window.
  const keep = new Set(written.map((d) => d.file).concat('index.json'));
  for (const f of await readdir(out)) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && !keep.has(f)) await unlink(path.join(out, f));
  const index = buildIndex({ generatedAt, retentionDays: days, apiKeyUsed: !!apiKey, days: written });
  await writeFile(path.join(out, 'index.json'), JSON.stringify(index, null, 2));
  const mb = (written.reduce((n, d) => n + d.bytes, 0) / 1048576).toFixed(1);
  log(`Wrote ${written.length} day files, ${index.totalCves} CVE records, ${mb} MB to ${out}`);
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    await run({ ...opts, apiKey: process.env.NVD_API_KEY || '' });
  } catch (err) {
    console.error(`NVD fetch failed: ${err.message}`);
    process.exit(1);
  }
}
