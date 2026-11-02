'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs');
const { chromium } = require(process.env.LAFCA_PLAYWRIGHT_MODULE || 'playwright');
const { mockOwner, login } = require('./editor-auth.test-helper.cjs');
const source = fs.readFileSync('ラフカ語辞書.html', 'utf8'),
  pattern = /(const DATA = )([\s\S]*?)(;<\/script>)/;
const data = JSON.parse(source.match(pattern)[2]),
  house = data.entries.find((e) => e.head === 'äm'),
  water = data.entries.find((e) => e.head === 'fissa');
const expected = '家, 建物, 住居, 家屋',
  url = 'https://lafca-meaning.test/';
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
    const context = await browser.newContext(),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let html = source;
    await context.route(url + '**', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: html,
      }),
    );
    const card = () => page.locator('#entry-' + house.id);
    for (const meaning of [
      '家, 建物, 住居, 家屋',
      '家、建物、住居、家屋',
      ' 家 、 建物, 住居、　家屋 ',
    ]) {
      const fixture = structuredClone(data);
      fixture.entries.find((e) => e.id === house.id).meaning = meaning;
      html = source.replace(
        pattern,
        (_, start, _data, end) => start + JSON.stringify(fixture) + end,
      );
      await page.goto(url);
      await page.check('input[name=scope][value=trans]');
      await page.check('input[name=mode][value=exact]');
      for (const term of ['家', '建物', '住居', '家屋']) {
        await page.fill('#query', term);
        assert.equal(await card().locator('.meaning').textContent(), expected);
      }
      await page.fill('#query', '屋');
      assert.equal(await card().count(), 0, 'exact match does not match a substring');
      await page.check('input[name=mode][value=prefix]');
      await page.fill('#query', '建');
      assert.equal(await card().count(), 1);
      await page.check('input[name=mode][value=partial]');
      await page.fill('#query', '物');
      assert.equal(await card().count(), 1);
      await page.check('input[name=scope][value=head]');
      assert.equal(await card().count(), 0, 'head-only search excludes meanings');
      assert.equal(await page.locator('.entry-edit-controls button').count(), 0);
    }
    await mockOwner(page);
    await login(page);
    await page.fill('#query', 'äm');
    await page.check('input[name=mode][value=exact]');
    const edit = () =>
      card()
        .locator('.entry-edit-controls')
        .getByRole('button', {
          name: '編集',
          exact: true,
        })
        .click();
    await edit();
    assert.equal(await page.inputValue('#edit-meaning'), expected);
    await page.fill('#edit-meaning', ' , 、 , ');
    await page.click('#save-draft');
    assert.match(await page.locator('#editor-error').textContent(), /意味を入力/);
    await page.fill('#edit-meaning', '家、建物, 住居、家屋');
    await page.click('#save-draft');
    assert.equal(await card().locator('.meaning').textContent(), expected);
    const draft = JSON.parse(
      await page.evaluate(() => localStorage.getItem('lafca-dictionary:edits:v1')),
    );
    assert.equal(draft.changes.find((c) => c.after?.id === house.id).after.meaning, expected);
    await page.reload();
    await login(page);
    await edit();
    assert.equal(await page.inputValue('#edit-meaning'), expected);
    await page.click('#cancel-entry');
    // Old backups with Japanese delimiters are readable without rewriting user content.
    const imported = structuredClone(draft);
    imported.changes.find((c) => c.after?.id === house.id).after.meaning = '家、建物、住居、家屋';
    await page.evaluate(() => localStorage.removeItem('lafca-dictionary:edits:v1'));
    await page.reload();
    await login(page);
    await page.setInputFiles('#import-edits', {
      name: 'legacy-edits.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(imported)),
    });
    await page.waitForFunction(() => localStorage.getItem('lafca-dictionary:edits:v1'));
    await page.check('input[name=scope][value=trans]');
    await page.fill('#query', '住居');
    assert.equal(await card().locator('.meaning').textContent(), expected);
    // Related-word suggestions use the same display convention and meaning search.
    await page.check('input[name=scope][value=head]');
    await page.fill('#query', 'fissa');
    await page
      .locator('#entry-' + water.id)
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name: '関連語を追加',
        exact: true,
      })
      .click();
    await page
      .locator('.relation-edit-row')
      .last()
      .getByRole('combobox', {
        name: '関連語',
        exact: true,
      })
      .fill('建物');
    const option = page
      .locator('.relation-options')
      .getByRole('option')
      .filter({
        has: page.locator('strong', {
          hasText: /^äm$/,
        }),
      });
    assert.equal(await option.locator('.relation-meaning').textContent(), expected);
    page.once('dialog', (d) => d.accept());
    await page.click('#cancel-entry');
    // Separate senses survive editing, backups and reloading; commas group translations within a sense.
    const amla = data.entries.find((e) => e.head === 'amla'),
      groups = ['荒野, 曠野', '空虚, 虚無, 空っぽ'];
    const fixture = structuredClone(data);
    fixture.entries.find((e) => e.id === amla.id).meaning = '荒野, 曠野, 空虚, 虚無, 空っぽ';
    html = source.replace(pattern, (_, start, _data, end) => start + JSON.stringify(fixture) + end);
    await page.goto(url);
    await login(page);
    await page.fill('#query', 'amla');
    await page.check('input[name=scope][value=head]');
    await page.check('input[name=mode][value=exact]');
    const amlaCard = () => page.locator('#entry-' + amla.id),
      editAmla = () =>
        amlaCard()
          .locator('.entry-edit-controls')
          .getByRole('button', {
            name: '編集',
            exact: true,
          })
          .click();
    assert.equal(
      await amlaCard().locator('p.meaning').count(),
      1,
      'commas alone do not imply separate senses',
    );
    await editAmla();
    assert.match(
      await page.locator('#edit-meaning').getAttribute('aria-describedby'),
      /meaning-hint/,
    );
    await page.fill('#edit-meaning', ' 荒野、曠野 \r\n\r\n 空虚,虚無、 空っぽ \n');
    await page.click('#save-draft');
    const assertSenses = async () =>
      assert.deepEqual(await amlaCard().locator('ol.meaning > li').allTextContents(), groups);
    await assertSenses();
    for (const term of ['荒野', '曠野', '空虚', '虚無', '空っぽ']) {
      await page.check('input[name=scope][value=trans]');
      await page.fill('#query', term);
      await assertSenses();
    }
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: '変更をバックアップ',
        exact: true,
      })
      .click();
    const download = await downloadPromise,
      backupPath = await download.path(),
      backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    assert.equal(
      backup.changes.find((c) => c.after?.id === amla.id).after.meaning,
      groups.join('\n'),
    );
    await page.reload();
    await login(page);
    await page.fill('#query', 'amla');
    await page.check('input[name=scope][value=head]');
    await editAmla();
    assert.deepEqual(
      await page.locator('#edit-senses textarea').evaluateAll((xs) => xs.map((x) => x.value)),
      groups,
    );
    await page.click('#cancel-entry');
    await page.evaluate(() => localStorage.removeItem('lafca-dictionary:edits:v1'));
    await page.reload();
    await login(page);
    await page.setInputFiles('#import-edits', backupPath);
    await page.waitForFunction(() => localStorage.getItem('lafca-dictionary:edits:v1'));
    await page.fill('#query', 'amla');
    await page.check('input[name=scope][value=head]');
    await assertSenses();
    await page.setViewportSize({
      width: 390,
      height: 844,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(
      await amlaCard()
        .locator('ol.meaning')
        .evaluate((e) => getComputedStyle(e).listStyleType),
      'decimal',
    );
    await page.fill('#query', 'fissa');
    await page
      .locator('#entry-' + water.id)
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', {
        name: '関連語を追加',
        exact: true,
      })
      .click();
    await page
      .locator('.relation-edit-row')
      .last()
      .getByRole('combobox', {
        name: '関連語',
        exact: true,
      })
      .fill('虚無');
    const multi = page
      .locator('.relation-options')
      .getByRole('option')
      .filter({
        has: page.locator('strong', {
          hasText: /^amla$/,
        }),
      });
    assert.equal(
      await multi.locator('.relation-meaning').textContent(),
      '1. 荒野, 曠野\n2. 空虚, 虚無, 空っぽ',
    );
    page.once('dialog', (d) => d.accept());
    await page.click('#cancel-entry');
    await page.fill('#query', 'amla');
    await editAmla();
    await page
      .getByRole('button', {
        name: '語義 1 を削除',
        exact: true,
      })
      .click();
    await page.fill('#edit-meaning', '空虚、虚無、空っぽ');
    await page.click('#save-draft');
    assert.equal(await amlaCard().locator('p.meaning').textContent(), groups[1]);
    assert.equal(await amlaCard().locator('ol.meaning').count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      'Meanings: comma translations, numbered senses, searches, editor/suggestions, mobile, saving, reload, backups and legacy data: OK',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
