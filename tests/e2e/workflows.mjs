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
];

