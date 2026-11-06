// End-to-end smoke test: serves the static site, opens every page in headless
// Chromium, fails on console errors, and exercises key workflows.
// Usage: node tests/e2e/smoke.mjs [--screenshots <dir>]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = 8765 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}/index.html`;
const shotDir = process.argv.includes('--screenshots') ? process.argv[process.argv.indexOf('--screenshots') + 1] : null;

const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try { const r = await fetch(base); if (r.ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server did not start');
}

const ROUTES = [
  ['/dashboard', 'Security posture overview'],
  ['/applications', 'Applications'],
  ['/software', 'Software Inventory'],
  ['/infrastructure', 'Infrastructure'],
  ['/vulnerabilities', 'Vulnerabilities'],
  ['/assessments', 'Impact'],
  ['/monitoring', 'Monitoring'],
  ['/reports', 'Reports'],
  ['/settings', 'Settings'],
];

let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(base);
  await page.evaluate(() => localStorage.clear());

  for (const [route, text] of ROUTES) {
    errors.length = 0;
    await page.goto(`${base}#${route}`);
    await page.waitForFunction((t) => document.querySelector('#view h1')?.textContent.includes(t), text, { timeout: 5000 }).catch(() => {});
    const h1 = await page.locator('#view h1').first().textContent().catch(() => '');
    check(`route ${route} renders`, (h1 || '').includes(text) && errors.length === 0, errors.join(' | ') || h1);
    if (shotDir) await page.screenshot({ path: path.join(shotDir, `${route.slice(1)}.png`), fullPage: true });
  }

  // Optional workflow tests contributed by later stages
  const { workflows } = await import('./workflows.mjs').catch(() => ({ workflows: [] }));
  for (const wf of workflows) {
    errors.length = 0;
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${base}#/dashboard`);
    await page.waitForSelector('#view h1');
    try {
      const detail = await wf.run(page, { base, shotDir });
      check(`workflow: ${wf.name}`, errors.length === 0, errors.join(' | ') || detail || '');
    } catch (err) {
      check(`workflow: ${wf.name}`, false, `${err.message}${errors.length ? ` | console: ${errors.join(' | ')}` : ''}`);
    }
  }

  // Mobile layout
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${base}#/dashboard`);
  await mobile.waitForSelector('#view h1');
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('mobile layout has no horizontal page scroll', !overflow);
  if (shotDir) await mobile.screenshot({ path: path.join(shotDir, 'mobile-dashboard.png'), fullPage: true });
} catch (err) {
  check('e2e run', false, err.stack);
} finally {
  if (browser) await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
