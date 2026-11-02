'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { chromium } = require(process.env.LAFCA_PLAYWRIGHT_MODULE || 'playwright');
const { mockOwner, login } = require('./editor-auth.test-helper.cjs'),
  T = require('./taxonomy.js');
const source = fs.readFileSync('ラフカ語辞書.html', 'utf8'),
  data = JSON.parse(source.match(/const DATA = (.*?);<\/script>/s)[1]);
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.LAFCA_CHROME_PATH,
  });
  try {
    const page = await browser.newPage({
        viewport: {
          width: 1250,
          height: 1000,
        },
      }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const url = 'https://lafca-taxonomy.test/';
    await page.route(url + '**', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: source,
      }),
    );
    await page.goto(url);
    const word = (h, p) => data.entries.find((e) => e.head === h && (!p || e.pos === p));
    const show = async (h, p) => {
      await page.click('#reset');
      await page.goto(url + '#word=' + word(h, p).id);
      await page.locator('#entry-' + word(h, p).id).waitFor();
    };
    for (const tag of [
      '数詞',
      '疑問',
      '交替',
      '時制',
      '未来',
      '相',
      '態',
      '法性',
      '格支配',
      '不可算',
      '人名',
      '短語尾母音型',
    ]) {
      await page.click('#reset');
      await page.selectOption('#tag-filter', tag);
      assert.ok(
        (await page.locator('#count').textContent()).startsWith(
          data.entries.filter((e) => T.all(e).includes(tag)).length + ' 件',
        ),
        tag,
      );
    }
    await show('le', '小辞');
    assert.deepEqual(await page.locator('.tags .tag').allTextContents(), ['小辞']);
    assert.deepEqual(await page.locator('.sense-tags').allTextContents(), ['進行', '受動']);
    assert.equal(await page.locator('.entry-edit-controls button').count(), 0);
    await show('mössel');
    assert.equal(await page.locator('.meaning li').nth(0).locator('.tag').count(), 0);
    assert.equal(await page.locator('.meaning li').nth(1).locator('.tag').textContent(), '敬称');
    await mockOwner(page);
    await login(page);
    await page
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name: '語義 2 を上へ',
        exact: true,
      })
      .click();
    await page.click('#save-draft');
    assert.equal(await page.locator('.meaning li').nth(0).locator('.tag').textContent(), '敬称');
    assert.equal(await page.locator('.meaning li').nth(1).locator('.tag').count(), 0);
    await page
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    await page.fill('#edit-meaning', 'ご主人さま、旦那さま');
    await page.click('#save-draft');
    let draft = JSON.parse(
        await page.evaluate(() => localStorage.getItem('lafca-dictionary:edits:v1')),
      ),
      e = draft.changes.find((c) => c.after?.head === 'mössel').after;
    assert.deepEqual(e.senseTags, [
      {
        meaning: 'ご主人さま, 旦那さま',
        tags: ['敬称'],
      },
    ]);
    await page.reload();
    await login(page);
    assert.equal(await page.locator('.meaning li').nth(0).locator('.tag').textContent(), '敬称');
    await page
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name: '語義 1 を削除',
        exact: true,
      })
      .click();
    await page.click('#save-draft');
    assert.equal(await page.locator('.sense-tags').count(), 0);
    await page.click('#add-entry');
    await page.fill('#edit-head', 'testan');
    await page.fill('#edit-meaning', 'テスト');
    await page.selectOption('#edit-pos', '動詞');
    assert.ok(await page.locator('#edit-gender').isHidden());
    assert.ok(await page.locator('#edit-pattern').isHidden());
    await page.locator('.sense-editor summary').click();
    assert.equal(
      await page
        .locator('.sense-editor')
        .getByLabel('可算', {
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator('.sense-editor')
        .getByLabel('他動', {
          exact: true,
        })
        .count(),
      1,
    );
    await page.selectOption('#edit-kind', '接頭辞');
    assert.ok(await page.locator('#edit-pos').isHidden());
    assert.equal(
      await page
        .locator('.sense-editor')
        .getByLabel('他動', {
          exact: true,
        })
        .count(),
      0,
    );
    await page.click('#save-draft');
    assert.deepEqual(await page.locator('.tags .tag').allTextContents(), ['接頭辞']);
    assert.equal(await page.locator('.entry h2').textContent(), 'testan-');
    await page.setViewportSize({
      width: 390,
      height: 844,
    });
    await show('le', '小辞');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({
      path: '/private/tmp/lafca-taxonomy-mobile.png',
      fullPage: true,
    });
    await page.setViewportSize({
      width: 1250,
      height: 1000,
    });
    await page.click('#reset');
    await page.selectOption('#tag-filter', '疑問');
    await page.screenshot({
      path: '/private/tmp/lafca-taxonomy-desktop.png',
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      'Taxonomy UI: anonymous hierarchy, per-sense display/edit/reorder/delete, conditional choices and mobile: OK',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
