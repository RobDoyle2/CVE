// Workflow tests run by smoke.mjs. Each returns a detail string or throws.
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const modalSave = async (page) => page.locator('.modal-footer .btn-primary').click();

export const workflows = [
  {
    name: 'application: validation, create, search, expand, detail, delete',
    async run(page, { base }) {
      await page.goto(`${base}#/applications`);
      await page.click('#add-app');
      await modalSave(page);
      const errs = await page.locator('.form-field.invalid').count();
      assert(errs >= 4, `expected required-field errors, got ${errs}`);
      await page.fill('#f-name', 'Test Harness App');
      await page.fill('#f-businessOwner', 'Owner A');
      await page.fill('#f-technicalOwner', 'Owner B');
      await page.selectOption('#f-criticality', 'High');
      await page.selectOption('#f-businessFunction', 'Other');
      await page.check('input[name="environments"][value="Production"]');
      await page.check('input[name="infrastructureIds"][value="INF-001"]');
      await modalSave(page);
      await page.waitForSelector('.modal', { state: 'detached' });
      await page.fill('#q', 'Test Harness');
      await page.waitForTimeout(250);
      const rows = await page.locator('#table tbody tr').count();
      assert(rows === 1, `search should return 1 row, got ${rows}`);
      await page.click('[data-expand="APP-011"]');
      const panel = await page.locator('.detail-panel').textContent();
      assert(panel.includes('Customer Portal - prod EKS namespace'), 'expanded row should show linked infrastructure');
      assert(panel.includes('corp-prod-digital'), 'expanded row should show derived AWS account');
      await page.click('a[href="#/applications/APP-011"]');
      await page.waitForSelector('text=Record governance');
      await page.click('#delete');
      await page.click('.modal-footer .btn-danger-solid');
      await page.waitForFunction(() => location.hash === '#/applications');
      const gone = await page.evaluate(() => !window.__vmt.store.get('applications', 'APP-011'));
      assert(gone, 'application should be deleted');
      return 'ok';
    },
  },
  {
    name: 'application: duplicate name rejected',
    async run(page, { base }) {
      await page.goto(`${base}#/applications`);
      await page.click('#add-app');
      await page.fill('#f-name', 'customer portal');
      await page.fill('#f-businessOwner', 'x');
      await page.fill('#f-technicalOwner', 'y');
      await page.selectOption('#f-criticality', 'Low');
      await page.selectOption('#f-businessFunction', 'Other');
      await page.check('input[name="environments"][value="Test"]');
      await modalSave(page);
      const msg = await page.locator('.form-general-error').textContent();
      assert(/already exists/.test(msg), `expected duplicate error, got "${msg}"`);
      return 'ok';
    },
  },
  {
    name: 'infrastructure: AWS platform requires account; deployment environment must match',
    async run(page, { base }) {
      await page.goto(`${base}#/infrastructure`);
      await page.click('#add');
      await page.fill('#f-name', 'New EKS ns');
      await page.selectOption('#f-hostingPlatform', 'Amazon EKS');
      await page.selectOption('#f-region', 'eu-west-2');
      await page.selectOption('#f-environment', 'Test');
      await page.selectOption('#f-clusterType', 'Kubernetes');
      await page.fill('#f-owner', 'Team');
      await modalSave(page);
      const err = await page.locator('[data-field="awsAccountId"] .error').textContent();
      assert(/AWS account is required/.test(err), `expected AWS account error, got "${err}"`);
      const err2 = await page.locator('[data-field="clusterName"] .error').textContent();
      assert(/Cluster name is required/.test(err2), 'expected cluster name error');
      await page.keyboard.press('Escape');
      await page.click('.tab[data-tab="clusters"]');
      const clusters = await page.locator('#tab-body tbody tr').count();
      assert(clusters >= 5, `expected clusters, got ${clusters}`);
      await page.goto(`${base}#/applications/APP-002`);
      await page.click('#add-dep');
      await page.selectOption('#f-softwareId', 'SW-009');
      await page.selectOption('#f-infrastructureId', 'INF-004');
      await page.selectOption('#f-environment', 'Test');
      await modalSave(page);
      const err3 = await page.locator('[data-field="environment"] .error').textContent();
      assert(/must match/.test(err3), 'expected environment mismatch error');
      return 'ok';
    },
  },
  {
    name: 'viewer role cannot edit',
    async run(page, { base }) {
      await page.selectOption('#current-user', 'USR-04');
      await page.goto(`${base}#/applications`);
      await page.waitForSelector('#table table');
      const add = await page.locator('#add-app').count();
      const edits = await page.locator('[data-edit]').count();
      assert(add === 0 && edits === 0, 'viewer should not see edit controls');
      await page.selectOption('#current-user', 'USR-01');
      return 'ok';
    },
  },
  {
    name: 'assessment: analyst records decision; engine never self-confirms',
    async run(page, { base }) {
      await page.goto(`${base}#/assessments/CVE-2099-10002`);
      await page.waitForSelector('[data-finding="SW-004"]');
      const before = await page.locator('[data-finding="SW-004"] .card-header').textContent();
      assert(before.includes('Potentially affected') && before.includes('not yet reviewed'), 'engine should show Potentially affected, unreviewed');
      await page.click('[data-review="SW-004"]');
      await page.selectOption('#f-status', 'Confirmed affected');
      await modalSave(page);
      const err = await page.locator('[data-field="rationale"] .error').textContent();
      assert(/required/.test(err), 'rationale should be required');
      await page.fill('#f-rationale', 'Verified legacy-etl.jar bundles log4j-core 2.14.1.');
      await modalSave(page);
      await page.waitForSelector('.modal', { state: 'detached' });
      const after = await page.locator('[data-finding="SW-004"] .card-header').textContent();
      assert(after.includes('Confirmed affected') && after.includes('engine: Potentially affected'), `decision not shown: ${after}`);
      return 'ok';
    },
  },
  {
    name: 'vulnerability: invalid version range rejected; new CVE matched against inventory',
    async run(page, { base }) {
      await page.goto(`${base}#/vulnerabilities`);
      await page.click('#add');
      await page.fill('#f-id', 'CVE-2099-20001');
      await page.fill('#f-title', 'Test MySQL flaw');
      await page.fill('#f-description', 'Test');
      await page.fill('#f-published', '2026-11-01');
      await page.fill('#f-cvssScore', '9.1');
      await page.fill('#f-vendor', 'Oracle');
      await page.fill('#f-product', 'MySQL');
      await page.fill('#f-affectedVersions', '>=banana');
      await page.selectOption('#f-exploitAvailability', 'Unknown');
      await page.selectOption('#f-exploitationStatus', 'Unknown');
      await modalSave(page);
      const err = await page.locator('[data-field="affectedVersions"] .error').textContent();
      assert(/Invalid version/.test(err), `expected range error, got ${err}`);
      await page.fill('#f-affectedVersions', '>=8.0.0 <8.0.35');
      await modalSave(page);
      await page.waitForSelector('.modal', { state: 'detached' });
      await page.goto(`${base}#/assessments/CVE-2099-20001`);
      await page.waitForSelector('[data-finding="SW-010"]');
      const text = await page.locator('[data-finding="SW-010"]').textContent();
      assert(text.includes('Potentially affected') && text.includes('Internal Wiki'), 'MySQL 8.0.34 should be potentially affected via Internal Wiki');
      return 'ok';
    },
  },
  {
    name: 'software: create with initial deployment, unknown version flagged',
    async run(page, { base }) {
      await page.goto(`${base}#/software`);
      await page.click('#add');
      await page.fill('#f-vendor', 'Example Labs');
      await page.fill('#f-product', 'httpclient');
      await page.selectOption('#f-category', 'Library / dependency');
      await page.selectOption('#f-verificationStatus', 'Unverified');
      await page.selectOption('#dep-app', 'APP-008');
      await page.selectOption('#dep-infra', 'INF-013');
      await modalSave(page);
      await page.waitForSelector('.modal', { state: 'detached' });
      await page.goto(`${base}#/assessments/CVE-2099-10009`);
      await page.waitForSelector('[data-finding="SW-022"]');
      const text = await page.locator('[data-finding="SW-022"]').textContent();
      assert(text.includes('Unable to determine') && text.includes('Mobile API'), 'unknown version should be Unable to determine with Mobile API in scope');
      return 'ok';
    },
  },
  {
    name: 'import: template download, validation preview, confirm import with relationships',
    async run(page, { base }) {
      await page.goto(`${base}#/data`);
      await page.selectOption('#imp-type', 'software');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#tpl')]);
      assert(dl.suggestedFilename() === 'template-software.csv', 'template filename');
      const csv = [
        'id,vendor,product,category,version,verificationStatus,applicationIds,environment,infrastructureId,deploymentLocation',
        ',Example Co,Widget,Library / dependency,1.2.3,Verified,APP-002,,INF-004,lib/widget.jar',
        ',Apache Software Foundation,Tomcat,Web server,9.0.80,Verified,,,,',
        ',Bad Co,,Nonsense,1,Maybe,APP-999,,,',
      ].join('\n');
      await page.setInputFiles('#file', { name: 'sw.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await page.waitForSelector('#preview table');
      const summary = await page.locator('#summary').textContent();
      assert(/1 new/.test(summary) && /1 duplicates/.test(summary) && /1 with errors/.test(summary), `summary: ${summary}`);
      const before = await page.evaluate(() => window.__vmt.store.count('software'));
      await page.click('#confirm');
      await page.waitForSelector('#summary .notice.success');
      const after = await page.evaluate(() => ({ n: window.__vmt.store.count('software'), dep: window.__vmt.store.find('deployments', (d) => d.location === 'lib/widget.jar').length }));
      assert(after.n === before + 1 && after.dep === 1, `expected 1 new software with deployment, got ${JSON.stringify(after)}`);
      return 'ok';
    },
  },
  {
    name: 'export: Excel workbook downloads and opens; report preview renders',
    async run(page, { base, shotDir }) {
      await page.goto(`${base}#/data?tab=export`);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#all-xlsx')]);
      const os = await import('node:os');
      const file = `${os.tmpdir()}/vmt-e2e-${Date.now()}.xlsx`;
      await dl.saveAs(file);
      const { execFileSync } = await import('node:child_process');
      const out = execFileSync('python3', ['-I', '-c', 'import openpyxl,sys; wb=openpyxl.load_workbook(sys.argv[1]); print(",".join(ws.title+":"+str(ws.max_row) for ws in wb.worksheets))', file]).toString().trim();
      assert(out.includes('Applications:11') && out.includes('Assessments:'), `workbook sheets: ${out}`);
      await page.goto(`${base}#/applications`);
      const [csvDl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="applications"][data-format="csv"]')]);
      assert(/^applications-\d{4}-\d{2}-\d{2}\.csv$/.test(csvDl.suggestedFilename()), csvDl.suggestedFilename());
      await page.goto(`${base}#/reports`);
      await page.click('[data-preview="quality"]');
      const rows = await page.locator('#pv-body tbody tr').count();
      assert(rows > 3, 'data quality report should have rows');
      return out;
    },
  },
  {
    name: 'review queue: contributor submission is pending; analyst approves',
    async run(page, { base }) {
      await page.selectOption('#current-user', 'USR-03');
      await page.goto(`${base}#/applications`);
      await page.click('#add-app');
      await page.fill('#f-name', 'Contributor App');
      await page.fill('#f-businessOwner', 'X');
      await page.fill('#f-technicalOwner', 'Y');
      await page.selectOption('#f-criticality', 'Low');
      await page.selectOption('#f-businessFunction', 'Other');
      await page.check('input[name="environments"][value="Test"]');
      await modalSave(page);
      await page.waitForSelector('.modal', { state: 'detached' });
      const st = await page.evaluate(() => window.__vmt.store.find('applications', (a) => a.name === 'Contributor App')[0]);
      assert(st.reviewStatus === 'Pending review' && st.submittedBy === 'Jordan Lee', 'contributor record should be pending');
      await page.selectOption('#current-user', 'USR-02');
      await page.goto(`${base}#/review`);
      await page.click(`[data-decide="Approved"][data-id="${st.id}"]`);
      await page.waitForTimeout(200);
      const after = await page.evaluate((id) => window.__vmt.store.get('applications', id), st.id);
      assert(after.reviewStatus === 'Approved' && after.reviewedBy === 'Priya Shah', 'should be approved by analyst');
      await page.selectOption('#current-user', 'USR-01');
      return 'ok';
    },
  },
  {
    name: 'monitoring: simulated NVD + KEV checks create/update CVEs and raise notifications',
    async run(page, { base }) {
      // Simulate "no published feed" regardless of any local feeds/ folder.
      await page.route('**/feeds/nvd/**', (route) => route.fulfill({ status: 404, body: 'not found' }));
      await page.goto(`${base}#/monitoring`);
      const before = await page.evaluate(() => window.__vmt.store.count('notifications'));
      await page.click('[data-check="SRC-001"]');
      // No published feed in the test server: use the offered fallback to the demonstration feed.
      await page.click('text=Use demonstration feed instead');
      await page.waitForSelector('#apply-ingest');
      const body = await page.locator('.modal-body').textContent();
      assert(/1 new/.test(body) && /1 changed/.test(body) && /1 unchanged/.test(body) && /1 rejected/.test(body), `plan: ${body.slice(0, 200)}`);
      await page.click('#apply-ingest');
      await page.waitForSelector('.modal', { state: 'detached' });
      await page.click('[data-check="SRC-002"]');
      await page.waitForSelector('#apply-ingest');
      await page.click('#apply-ingest');
      await page.waitForSelector('.modal', { state: 'detached' });
      const st = await page.evaluate(() => ({
        node: !!window.__vmt.store.get('vulnerabilities', 'CVE-2099-10013'),
        kev: window.__vmt.store.get('vulnerabilities', 'CVE-2099-10003').exploitationStatus,
        notes: window.__vmt.store.count('notifications'),
        src: window.__vmt.store.get('monitoringSources', 'SRC-001').lastStatus,
      }));
      assert(st.node && st.kev === 'Known exploited (CISA KEV)', JSON.stringify(st));
      assert(st.notes >= before + 2, `expected new notifications, ${JSON.stringify(st)}`);
      assert(/OK \(simulated\)/.test(st.src), st.src);
      await page.click('.tab[data-tab="notifications"]');
      const txt = await page.locator('#tab-body').textContent();
      assert(txt.includes('CVE-2099-10013'), 'notification list should include new CVE');
      await page.click('.tab[data-tab="sources"]');
      const live = await page.locator('[data-check="SRC-003"]');
      await live.click();
      const msg = await page.locator('.modal-body').textContent();
      assert(/backend/.test(msg), 'non-demo source should explain backend requirement');
      return 'ok';
    },
  },
  {
    name: 'AI: disabled by default, simulated output labelled, endpoint validation',
    async run(page, { base }) {
      await page.goto(`${base}#/assessments/CVE-2099-10001`);
      const off = await page.locator('#ai-panel').textContent();
      assert(/disabled/.test(off), 'AI should be disabled by default');
      await page.goto(`${base}#/settings?tab=integrations`);
      await page.selectOption('#ai-mode', 'backend');
      await page.fill('#ai-endpoint', 'http://insecure.example.com/ai');
      await page.click('#save');
      const setting = await page.evaluate(() => window.__vmt.store.getSettings().aiProvider);
      assert(setting === 'disabled', 'insecure endpoint must be rejected');
      await page.selectOption('#ai-mode', 'simulated');
      await page.fill('#ai-endpoint', '');
      await page.click('#save');
      await page.goto(`${base}#/assessments/CVE-2099-10001`);
      await page.click('[data-ai="summariseImpact"]');
      await page.waitForSelector('#ai-out pre');
      const out = await page.locator('#ai-out').textContent();
      assert(/SIMULATED OUTPUT/.test(out) && /not evidence/.test(out), 'simulated output must be labelled');
      return 'ok';
    },
  },
  {
    name: 'security: HTML/script in data is rendered inert across pages',
    async run(page, { base }) {
      const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
      await page.evaluate(async (p) => {
        const s = window.__vmt.store;
        await s.update('applications', 'APP-001', { name: `Portal ${p}`, notes: p }, { validate: false });
        await s.update('software', 'SW-001', { product: `Tomcat ${p}` }, { validate: false });
        await s.update('vulnerabilities', 'CVE-2099-10001', { title: p, description: p }, { validate: false });
      }, payload);
      for (const r of ['/dashboard', '/applications', '/applications/APP-001', '/software', '/software/SW-001', '/vulnerabilities', '/vulnerabilities/CVE-2099-10001', '/assessments', '/assessments/CVE-2099-10001', '/reports', '/review', '/settings?tab=audit']) {
        await page.goto(`${base}#${r}`);
        await page.waitForSelector('#view h1');
        await page.waitForTimeout(100);
      }
      const xss = await page.evaluate(() => window.__xss);
      assert(xss === undefined, `script executed: ${xss}`);
      return 'ok';
    },
  },
  {
    name: 'settings: JSON backup downloads and restores',
    async run(page, { base }) {
      await page.goto(`${base}#/settings?tab=data`);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
      const file = await dl.path();
      await page.evaluate(() => window.__vmt.store.remove('applications', 'APP-007'));
      await page.setInputFiles('#restore-file', file);
      await page.click('.modal-footer .btn-danger-solid');
      await page.waitForFunction(() => !!window.__vmt.store.get('applications', 'APP-007'));
      return 'ok';
    },
  },
  {
    name: 'NVD feed: real NVD records imported from the published feed, filtered to the inventory',
    async run(page, { base }) {
      const { readFileSync } = await import('node:fs');
      const { buildDayFile, buildIndex } = await import('../../js/services/nvd-feed.js');
      const real = JSON.parse(readFileSync(new URL('../fixtures/nvd/real-sample.json', import.meta.url)));
      const now = new Date().toISOString();
      const day = { date: now.slice(0, 10), start: `${now.slice(0, 10)}T00:00:00.000Z`, end: `${now.slice(0, 10)}T23:59:59.999Z` };
      const dayFile = buildDayFile(day, real.vulnerabilities, now);
      const index = buildIndex({ generatedAt: now, retentionDays: 7, apiKeyUsed: false, days: [{ date: day.date, file: `${day.date}.json`, count: real.vulnerabilities.length, bytes: 1, windowStart: day.start }] });
      await page.route('**/feeds/nvd/**', (route) => {
        const body = route.request().url().endsWith('index.json') ? index : dayFile;
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await page.goto(`${base}#/monitoring`);
      await page.click('[data-check="SRC-001"]');
      await page.waitForSelector('#apply-ingest');
      const body = await page.locator('.modal-body').textContent();
      assert(/First import/.test(body), 'first import notice');
      const m = body.match(/(\d+) new/);
      assert(m && Number(m[1]) === 6 && /9 not relevant to inventory|not relevant to inventory/.test(body), `plan: ${body.slice(0, 600)}`);
      assert(/not endorsed or certified by the NVD/.test(body), 'NVD attribution shown');
      await page.click('#apply-ingest');
      await page.waitForSelector('.modal', { state: 'detached' });
      const st = await page.evaluate(() => ({
        log4shell: window.__vmt.store.get('vulnerabilities', 'CVE-2021-44228'),
        count: window.__vmt.store.count('vulnerabilities'),
        src: window.__vmt.store.get('monitoringSources', 'SRC-001'),
      }));
      assert(st.log4shell && st.log4shell.source === 'NVD' && st.log4shell.product === 'log4j', 'Log4Shell imported from NVD');
      assert(st.count === 18, `only the 6 relevant real CVEs added, register has ${st.count}`);
      assert(st.src.feedCheckpoint && /OK \(NVD feed/.test(st.src.lastStatus), JSON.stringify(st.src));
      await page.goto(`${base}#/assessments/CVE-2021-44228`);
      await page.waitForSelector('[data-finding="SW-004"]');
      const f = await page.locator('[data-finding="SW-004"] .card-header').textContent();
      assert(/Potentially affected/.test(f), 'Log4j 2.14.1 potentially affected');
      await page.goto(`${base}#/vulnerabilities/CVE-2021-44228`);
      await page.waitForSelector('text=Affected products');
      // Second check: nothing new
      await page.goto(`${base}#/monitoring`);
      await page.click('[data-check="SRC-001"]');
      await page.waitForSelector('#apply-ingest');
      const again = await page.locator('.modal-body').textContent();
      assert(/0 new/.test(again) && /6 unchanged/.test(again), `second check: ${again.slice(0, 600)}`);
      return 'ok';
    },
  },
  {
    name: 'NVD feed: missing feed explains how it is produced',
    async run(page, { base }) {
      await page.route('**/feeds/nvd/**', (route) => route.fulfill({ status: 404, body: 'not found' }));
      await page.goto(`${base}#/monitoring`);
      await page.click('[data-check="SRC-001"]');
      const msg = await page.locator('.modal-body').textContent();
      assert(/could not be read/.test(msg) && /GitHub Actions/.test(msg) && /npm run fetch:nvd/.test(msg), msg);
      return 'ok';
    },
  },
];

