'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.LAFCA_PLAYWRIGHT_MODULE || 'playwright');
const { mockOwner, login } = require('./editor-auth.test-helper.cjs');
const entryCount = require('./data.json').entries.length;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lafca-editor-'));
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.LAFCA_CHROME_PATH
      ? {
          executablePath: process.env.LAFCA_CHROME_PATH,
        }
      : {}),
  });
  try {
    const context = await browser.newContext({
        viewport: {
          width: 1280,
          height: 1000,
        },
      }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const url = pathToFileURL(path.join(__dirname, 'ラフカ語辞書.html')).href;
    await page.goto(url);
    assert.equal(await page.locator('.entry-edit-controls button').count(), 0);
    await mockOwner(page);
    await login(page);
    await page.fill('#query', 'fissa');
    await page.check('input[name=mode][value=exact]');
    const editFirst = () =>
      page
        .locator('.entry-edit-controls')
        .first()
        .getByRole('button', {
          name: '編集',
          exact: true,
        })
        .click();
    // Editing an existing noun must retain its automatically managed stem tag.
    await page.fill('#query', 'Ämhor');
    await editFirst();
    assert.equal(await page.inputValue('#edit-person-name'), 'yes');
    await page.click('#save-draft');
    assert.deepEqual(await page.locator('.tags button').allTextContents(), [
      '名詞',
      '男性',
      '固定型',
      '子音幹型',
      '単数のみ',
      '人名',
    ]);
    await page.reload();
    await login(page);
    assert.deepEqual(await page.locator('.tags button').allTextContents(), [
      '名詞',
      '男性',
      '固定型',
      '子音幹型',
      '単数のみ',
      '人名',
    ]);
    // Clear this fixture independently of the editor/backups test below.
    await page.evaluate(() => localStorage.removeItem('lafca-dictionary:edits:v1'));
    await page.reload();
    await login(page);
    await page.click('#reset');
    await page.fill('#query', 'fissa');
    await page.check('input[name=mode][value=exact]');
    await editFirst();
    assert.equal(await page.inputValue('#edit-number'), 'singular');
    assert.equal(await page.locator('#edit-tables .form-edit-row').count(), 5);
    assert.ok(await page.locator('#edit-gender').isVisible());
    await page.fill('#edit-meaning', '魚肉・編集の検証');
    await page
      .getByRole('textbox', {
        name: '単数属格',
        exact: true,
      })
      .fill('fissanx');
    await page.click('#save-draft');
    assert.equal(await page.locator('#entry-editor').isVisible(), false);
    assert.match(await page.locator('.meaning').textContent(), /編集の検証/);
    await page.reload();
    assert.equal(await page.locator('.entry-edit-controls button').count(), 0);
    await login(page);
    assert.match(await page.locator('.meaning').textContent(), /編集の検証/);
    await page.click('#reset');
    await page.fill('#query', 'fissanx');
    assert.equal(await page.locator('.entry h2').textContent(), 'fissa');
    // Changing POS removes noun-only fields and incompatible inflections.
    await editFirst();
    await page.selectOption('#edit-pos', '動詞');
    assert.ok(await page.locator('#edit-gender').isHidden());
    assert.ok(await page.locator('#edit-number').isHidden());
    assert.ok(!(await page.locator('#edit-class option').allTextContents()).includes('Ⅰ型'));
    page.once('dialog', (d) => d.accept());
    await page.click('#cancel-entry');
    await page.click('#add-entry');
    await page.fill('#edit-head', 'šütest');
    await page.selectOption('#edit-pos', '副詞');
    await page.fill('#edit-meaning', '追加試験');
    await page.click('#save-draft');
    assert.equal(await page.locator('.entry h2').textContent(), 'šütest');
    await page.reload();
    assert.equal(await page.locator('.entry-edit-controls button').count(), 0);
    await login(page);
    assert.equal(await page.locator('#stat').textContent(), entryCount + 1 + ' 項目');
    assert.equal(await page.locator('.entry h2').textContent(), 'šütest');
    await page.click('#reset');
    await page.selectOption('#pos', '副詞');
    await page.fill('#query', 'šütest');
    assert.equal(await page.locator('.entry').count(), 1);
    // Literal markup stays text, including through JSON backups.
    await editFirst();
    await page.fill('#edit-meaning', '<img src=x onerror=alert(1)>');
    await page.click('#save-draft');
    assert.equal(await page.locator('.meaning img').count(), 0);
    assert.equal(await page.locator('.meaning').textContent(), '<img src=x onerror=alert(1)>');
    const backupEvent = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: '変更をバックアップ',
        exact: true,
      })
      .click();
    const backup = await backupEvent;
    const backupPath = path.join(out, 'edits.json');
    await backup.saveAs(backupPath);
    const saved = JSON.parse(fs.readFileSync(backupPath));
    assert.equal(saved.changes.length, 2);
    assert.ok(!JSON.stringify(saved).includes('token'));
    assert.equal(await page.locator('a[download]').count(), 0);
    assert.equal(
      await page
        .getByText('ZpDICを保存', {
          exact: true,
        })
        .count(),
      0,
    );
    // Offline/failing authentication leaves draft intact and clears credentials.
    await page.click('#manage-edits');
    await page.route('https://api.github.com/**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{}',
      }),
    );
    await page.click('#publish-edits');
    await page.waitForFunction(() =>
      document.getElementById('login-status').textContent.includes('トークンが無効'),
    );
    assert.equal(await page.inputValue('#github-token'), '');
    assert.equal(
      JSON.parse(await page.evaluate(() => localStorage.getItem('lafca-dictionary:edits:v1')))
        .changes.length,
      2,
    );
    assert.equal(await page.locator('.entry-edit-controls button').count(), 0);
    await page.unroute('https://api.github.com/**');
    await mockOwner(page);
    await login(page);
    // Backups are portable. Imports merge without dropping other edits.
    const other = await browser.newContext({
        viewport: {
          width: 390,
          height: 844,
        },
      }),
      mobile = await other.newPage();
    await mobile.goto(url);
    await mockOwner(mobile);
    await login(mobile);
    await mobile.setInputFiles('#import-edits', backupPath);
    await mobile.waitForFunction(
      (count) => document.getElementById('stat').textContent === count + ' 項目',
      entryCount + 1,
    );
    await mobile.fill('#query', 'šütest');
    assert.equal(await mobile.locator('.entry h2').textContent(), 'šütest');
    await mobile
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    assert.ok(
      await mobile.evaluate(
        () =>
          document.querySelector('#entry-editor').scrollWidth <=
          document.querySelector('#entry-editor').clientWidth + 1,
      ),
    );
    await mobile.screenshot({
      path: path.join(out, 'mobile-editor.png'),
      fullPage: true,
    });
    await mobile.click('#cancel-entry');
    // Alternating nouns require the lexical oblique stem; forms then fill automatically.
    await mobile.click('#add-entry');
    await mobile.fill('#edit-head', 'testan');
    await mobile.fill('#edit-meaning', '試験名詞');
    await mobile.selectOption('#edit-class', 'Ⅰ型');
    await mobile.click('#save-draft');
    assert.ok(await mobile.locator('#entry-editor').isVisible());
    // Singular-only -> both automatically fills the newly available plural forms.
    mobile.once('dialog', (d) => d.accept());
    await mobile.click('#cancel-entry');
    await mobile.click('#reset');
    await mobile.fill('#query', 'fissa');
    await mobile.check('input[name=mode][value=exact]');
    await mobile
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    await mobile.selectOption('#edit-number', '');
    assert.equal(await mobile.locator('#edit-tables .form-edit-row').count(), 10);
    assert.equal(
      await mobile
        .getByRole('textbox', {
          name: '複数主格',
          exact: true,
        })
        .inputValue(),
      'fissas',
    );
    await mobile.screenshot({
      path: path.join(out, 'mobile-noun-editor.png'),
      fullPage: true,
    });
    // Simultaneous local edits are detected before overwriting another tab.
    const second = await context.newPage();
    await second.goto(url);
    await mockOwner(second);
    await login(second);
    await page.click('#reset');
    await page.fill('#query', 'fissa');
    await page.check('input[name=mode][value=exact]');
    await editFirst();
    await second.click('#reset');
    await second.fill('#query', 'fissa');
    await second.check('input[name=mode][value=exact]');
    await second
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    await second.fill('#edit-meaning', '別タブ');
    await second.click('#save-draft');
    await page.fill('#edit-meaning', '競合');
    await page.click('#save-draft');
    assert.match(await page.locator('#editor-error').textContent(), /別のタブ/);
    await page.screenshot({
      path: path.join(out, 'desktop-editor.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log('Editor UI checks passed; screenshots:', out);
    await other.close();
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
