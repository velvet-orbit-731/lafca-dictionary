/* 任意の Playwright 環境で実行する、完成 HTML のブラウザー検証。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.LAFCA_PLAYWRIGHT_MODULE || 'playwright');
const E = require('./engine.js');
const data = require('./data.json');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lafca2-ui-'));

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
        width: 1440,
        height: 1000,
      },
      acceptDownloads: true,
    });
    const page = await context.newPage(),
      errors = [],
      network = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (/^https?:/.test(r.url())) network.push(r.url());
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'generator', 'index.html')).href);
    const settled = () =>
      page.waitForFunction(
        () =>
          !document.getElementById('generate').disabled &&
          typeof current !== 'undefined' &&
          current,
      );
    await settled();
    assert.equal(await page.locator('.entry h3').first().textContent(), 'jure');
    assert.equal(await page.evaluate(() => current.kind), 'registered');
    assert.deepEqual(await page.locator('.proto-forms li').allTextContents(), ['*juraj']);
    await page.getByRole('button', { name: 'jure の祖語形' }).click();
    await settled();
    assert.equal(await page.locator('#language').inputValue(), 'lafca');
    assert.deepEqual(await page.locator('.proto-forms li').allTextContents(), ['*juraj']);
    for (const [word, proto] of [
      ['cori', ['*kōrī']],
      ['ähel', ['*ēxl']],
      ['bidiš', ['*bidəš-ú', '*bidáš-tā']],
    ]) {
      await page.fill('#word', word);
      await page.locator('#generate').click();
      await settled();
      assert.deepEqual(await page.locator('.proto-forms li').allTextContents(), proto);
    }
    const protoDownload = page.waitForEvent('download');
    await page.locator('#export').click();
    const protoJSON = JSON.parse(fs.readFileSync(await (await protoDownload).path(), 'utf8'));
    assert.deepEqual(protoJSON.result.groups[0].analyses[0].protoForms, ['*bidəš-ú', '*bidáš-tā']);
    assert.ok(protoJSON.result.groups[0].analyses[0].source.url.includes('#word='));
    await page.fill('#word', 'hlenqorn');
    await page.locator('#generate').click();
    await settled();
    assert.equal(await page.locator('.proto-missing').textContent(), '辞書の祖語形は未登録です。');
    assert.ok(await page.locator('#results .proto-candidate').count());
    assert.match(await page.locator('#results').textContent(), /共通祖語形ではありません/);
    await page.fill('#word', 'bannen');
    await page.locator('#generate').click();
    await settled();
    assert.deepEqual(await page.locator('.proto-candidate-form').allTextContents(), ['*bannen']);
    assert.match(await page.locator('.paradigm-summary').textContent(), /登録 14 語形/);
    await page.locator('.morphology-check summary').click();
    assert.match(await page.locator('.morphology-check').textContent(), /現在語幹：benn-/);
    assert.match(await page.locator('.morphology-check').textContent(), /過去分詞：dibennt（登録 dibennt）/);
    await page.screenshot({ path: path.join(dir, 'desktop-proto-paradigm.png'), fullPage: true });
    const paradigmDownload = page.waitForEvent('download');
    await page.locator('#export').click();
    const paradigmJSON = JSON.parse(fs.readFileSync(await (await paradigmDownload).path(), 'utf8'));
    assert.equal(paradigmJSON.result.groups[0].analyses[0].reconstruction.candidates[0].morphology.checkedForms.length, 14);
    await page.fill('#word', 'lämo');
    await page.locator('#generate').click();
    await settled();
    assert.equal(await page.locator('.proto-candidate').count(), 0);
    assert.match(await page.locator('#results').textContent(), /保留します/);
    assert.match(await page.locator('#results').textContent(), /母音幹/);
    await page.fill('#word', 'cwen');
    await page.locator('#generate').click();
    await settled();
    assert.deepEqual(await page.locator('.proto-forms li').allTextContents(), ['*kwén-i']);
    assert.match(await page.locator('#results').textContent(), /非同源/);
    await page.fill('#word', 'pirēpigo');
    await page.locator('#generate').click();
    await settled();
    assert.equal(await page.evaluate(() => current.kind), 'blocked');
    assert.equal(await page.locator('#export').isDisabled(), true);
    await page.getByRole('button', { name: 'zamar の祖語候補' }).click();
    await settled();
    assert.equal(await page.evaluate(() => current.kind), 'reconstructed');
    assert.ok((await page.locator('.proto-candidate-form').allTextContents()).includes('*zamar'));
    assert.equal(await page.locator('#export').isDisabled(), false);
    await page.locator('.proto-next').click();
    assert.match(await page.locator('.proto-count').textContent(), /^13/);
    await page.locator('.proto-prev').click();
    const inferredDownload = page.waitForEvent('download');
    await page.locator('#export').click();
    const inferred = JSON.parse(fs.readFileSync(await (await inferredDownload).path(), 'utf8'));
    assert.ok(inferred.result.reconstruction.candidates.length > 12);
    assert.ok(inferred.result.reconstruction.candidates.every((c) => c.language === 'lafca' && c.verifiedOutput === 'zamar' && c.trace.length));
    await page.screenshot({ path: path.join(dir, 'desktop-proto-candidates.png'), fullPage: true });
    await page.selectOption('#language', 'auto');
    await settled();
    assert.deepEqual(new Set(await page.evaluate(() => current.reconstruction.candidates.map((c) => c.language))), new Set(['lafca', 'aldian']));
    await page.fill('#word', 'diwi');
    await page.selectOption('#language', 'aldian');
    await settled();
    assert.deepEqual(await page.locator('.proto-forms li').allTextContents(), ['*díw-i']);
    assert.match(await page.locator('.etymology').textContent(), /仮説/);
    await page.getByRole('button', { name: 'juraj → jure' }).click();
    await settled();
    assert.equal(await page.locator('#language').inputValue(), 'auto');
    await page.screenshot({
      path: path.join(dir, 'desktop-registered.png'),
      fullPage: true,
    });
    for (const [word, head, form] of [
      ['kōri', 'cori', 'corirs'],
      ['lēmo', 'lämo', 'lämowa'],
    ]) {
      await page.fill('#word', word);
      await page.locator('#generate').click();
      await settled();
      assert.equal(await page.evaluate(() => current.kind), 'registered');
      assert.equal(await page.locator('.entry h3').textContent(), head);
      assert.ok((await page.locator('#results').textContent()).includes(form));
      assert.ok((await page.locator('#results').textContent()).includes('ウェブラフカ語辞書'));
    }
    await page.fill('#word', 'awenaklohac');
    await page.locator('#generate').click();
    await settled();
    assert.deepEqual(await page.evaluate(() => current.excluded.map((e) => e.head)), ['hlenqorn']);
    assert.ok((await page.locator('#notice').textContent()).includes('hlenqorn'));
    assert.ok((await page.locator('#notice').textContent()).includes('非同源'));
    assert.ok(!(await page.locator('.entry h3').allTextContents()).includes('hlenqorn'));
    await page
      .getByRole('button', {
        name: 'rēdog の分岐',
      })
      .click();
    await settled();
    assert.ok((await page.locator('#results').textContent()).includes('reqdoq'));
    assert.ok((await page.locator('#results').textContent()).includes('rädoq'));
    assert.equal(await page.evaluate(() => current.complete), true);
    await page.screenshot({
      path: path.join(dir, 'desktop-candidates.png'),
      fullPage: true,
    });
    for (const [id, value] of [
      ['gender', 'M'],
      ['grade', 'fixed'],
      ['shortening', 'keep'],
    ]) {
      await page.selectOption('#' + id, value);
      await settled();
    }
    assert.deepEqual(
      (await page.locator('.entry h3').allTextContents()).sort(),
      ['rädoq', 'reqdoq'].sort(),
    );
    assert.ok((await page.locator('#results').textContent()).includes('reqdogen'));
    await page.selectOption('#long', 'plain');
    await settled();
    assert.deepEqual(await page.locator('.entry h3').allTextContents(), ['rädoq']);
    await page
      .getByRole('button', {
        name: 'すべてに戻す',
      })
      .click();
    await settled();
    await page.fill('#word', 'nifen');
    await page.selectOption('#pos', 'verb');
    await settled();
    await page.selectOption('#shortening', 'keep');
    await settled();
    assert.equal(await page.evaluate(() => current.analysisCount), 4);
    const more = page.locator('.more-analyses').first();
    await more.locator('summary').click();
    await more.locator('.analysis').first().waitFor();
    assert.equal(await more.locator('.analysis').count(), 1);
    await page
      .getByRole('button', {
        name: 'すべてに戻す',
      })
      .click();
    await settled();
    await page.fill('#word', 'pirēpigo');
    await page.selectOption('#pos', 'noun');
    await settled();
    const expected = E.generate(
      'pirēpigo',
      {
        pos: 'noun',
      },
      data,
    );
    assert.equal(await page.locator('.entry').count(), 24);
    assert.equal(await page.evaluate(() => current.groups.length), expected.groups.length);
    await page
      .getByRole('button', {
        name: '次へ →',
      })
      .click();
    assert.ok((await page.locator('#page-label').textContent()).startsWith('25'));
    const downloaded = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: '全結果を保存 ↓',
      })
      .click();
    const download = await downloaded,
      exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.result.groups.length, expected.groups.length);
    assert.equal(exported.result.analysisCount, expected.analysisCount);
    await page.fill('#word', '<img src=x onerror="window.injected=1">');
    await page.locator('#generate').click();
    await settled();
    assert.equal(await page.evaluate(() => current.kind), 'blocked');
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.locator('#results img').count(), 0);
    assert.equal(await page.locator('#export').isDisabled(), true);
    await page.fill('#word', '');
    await page.locator('#generate').click();
    await settled();
    assert.equal(await page.evaluate(() => current.kind), 'empty');
    await page
      .getByRole('button', {
        name: 'wluc → vluž',
      })
      .click();
    await settled();
    assert.equal(await page.locator('.entry h3').textContent(), 'vluž');
    for (const form of ['vluža', 'vlüž'])
      assert.ok((await page.locator('#results').textContent()).includes(form));
    await page.setViewportSize({
      width: 390,
      height: 844,
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.equal(await page.locator('#filter-panel').isVisible(), false);
    await page.locator('#toggle-filters').click();
    assert.equal(await page.locator('#filter-panel').isVisible(), true);
    await page.locator('#toggle-filters').click();
    await page.screenshot({
      path: path.join(dir, 'mobile.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'zamar の祖語候補' }).click();
    await settled();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.locator('.proto-candidate summary').first().click();
    assert.match(await page.locator('.proto-candidate').first().textContent(), /照合/);
    await page.screenshot({ path: path.join(dir, 'mobile-proto-candidates.png'), fullPage: true });
    await page.fill('#word', 'bug');
    await page.selectOption('#language', 'aldian');
    await settled();
    assert.deepEqual(new Set(await page.locator('.proto-candidate-form').allTextContents()), new Set(['*bug', '*bug-e', '*bug-o', '*bug-u']));
    await page.locator('.morphology-check summary').first().click();
    assert.match(await page.locator('.morphology-check').first().textContent(), /女性単数主格：buga（登録 buga）/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(dir, 'mobile-proto-paradigm.png'), fullPage: true });
    assert.deepEqual(network, [], '外部通信が発生していない');
    assert.deepEqual(errors, []);
    console.log(
      'Browser checks passed: bilingual lookup, inferred proto-forms, complete paradigm checks, pending forms, hypotheses, non-cognates, registry, branches, controls, both paginations, complete export, invalid input, mobile, zero external requests.',
    );
    console.log('Screenshots:', dir);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
