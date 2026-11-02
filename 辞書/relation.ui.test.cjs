'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.LAFCA_PLAYWRIGHT_MODULE || 'playwright');
const { mockOwner, login } = require('./editor-auth.test-helper.cjs');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lafca-relations-'));
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
        hasTouch: true,
      }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const url = pathToFileURL(path.join(__dirname, 'ラフカ語辞書.html')).href;
    const data = JSON.parse(
      fs.readFileSync('ラフカ語辞書.html', 'utf8').match(/const DATA = ([\s\S]*?);<\/script>/)[1],
    );
    const entry = (head, pos) =>
      data.entries.find((e) => e.head === head && (!pos || e.pos === pos));
    await page.goto(url);
    await mockOwner(page);
    await login(page);
    await page.fill('#query', 'manž');
    await page.check('input[name=mode][value=exact]');
    await page.check('input[name=scope][value=head]');
    const edit = () =>
      page
        .locator('.entry-edit-controls')
        .getByRole('button', {
          name: '編集',
          exact: true,
        })
        .click();
    await edit();
    const rows = page.locator('.relation-edit-row'),
      input = (i) =>
        rows.nth(i).getByRole('combobox', {
          name: '関連語',
          exact: true,
        });
    const options = (i) => rows.nth(i).locator('.relation-options').getByRole('option');
    const choose = async (i, head, pos) =>
      options(i)
        .filter({
          has: page.locator('strong', {
            hasText: new RegExp('^' + head + '$'),
          }),
        })
        .filter({
          hasText: pos,
        })
        .click();
    const original = entry('manž').relations[0],
      related = data.entries.find((e) => e.id === original.id);
    assert.equal(await input(0).inputValue(), related.head + '（' + related.pos + '）');
    while ((await rows.count()) > 1)
      await rows
        .last()
        .getByRole('button', {
          name: '削除',
          exact: true,
        })
        .click();
    const type = (i) =>
      rows.nth(i).getByRole('combobox', {
        name: '関係',
        exact: true,
      });
    assert.deepEqual(await type(0).locator('option').allTextContents(), ['派生', '類義', '対義']);
    assert.equal(await type(0).inputValue(), '派生');
    // An edited query cannot silently keep the previously selected relation ID.
    await input(0).fill('存在しない関連語xyz');
    assert.equal(await options(0).count(), 0);
    assert.match(await rows.nth(0).textContent(), /候補がありません/);
    await page.click('#save-draft');
    assert.ok(await page.locator('#entry-editor').isVisible());
    assert.equal(await input(0).evaluate((e) => e.validity.valid), false);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('lafca-dictionary:edits:v1')),
      null,
    );
    await input(0).fill('月');
    await choose(0, 'bonna', '名詞');
    assert.equal(await input(0).inputValue(), 'bonna（名詞）');
    await type(0).selectOption('類義');
    await page
      .getByRole('button', {
        name: '関連語を追加',
        exact: true,
      })
      .click();
    assert.equal(await input(1).evaluate((e) => e === document.activeElement), true);
    await input(1).fill('jod');
    assert.ok((await options(1).count()) >= 2);
    assert.match(await options(1).nth(0).textContent(), /形容詞/);
    assert.match(await options(1).nth(1).textContent(), /間投詞/);
    // Keyboard selection disambiguates homographs, keeps the editor open, and saves the exact ID.
    await input(1).press('ArrowDown');
    await input(1).press('ArrowDown');
    assert.equal(
      await input(1).getAttribute('aria-activedescendant'),
      await options(1).nth(1).getAttribute('id'),
    );
    await input(1).press('Enter');
    assert.ok(await page.locator('#entry-editor').isVisible());
    assert.equal(await input(1).inputValue(), 'jod（間投詞）');
    await type(1).selectOption('対義');
    await page.click('#save-draft');
    assert.ok(await page.locator('#entry-editor').isHidden());
    const draft = JSON.parse(
      await page.evaluate(() => localStorage.getItem('lafca-dictionary:edits:v1')),
    );
    const manz = draft.changes.find((c) => c.after.id === entry('manž').id).after;
    assert.deepEqual(
      manz.relations.map((r) => [r.id, r.head]),
      [
        [entry('bonna').id, 'bonna'],
        [entry('jod', '間投詞').id, 'jod'],
      ],
    );
    assert.deepEqual(
      manz.relations.map((r) => r.title),
      ['類義', '対義'],
    );
    for (const r of manz.relations)
      assert.ok(
        draft.changes
          .find((c) => c.after.id === r.id)
          .after.relations.some((x) => x.id === manz.id && x.title === r.title),
      );
    assert.deepEqual(await page.locator('.relations > span').allTextContents(), ['類義', '対義']);
    await page.reload();
    await login(page);
    await edit();
    assert.equal(await input(0).inputValue(), 'bonna（名詞）');
    assert.equal(await input(1).inputValue(), 'jod（間投詞）');
    assert.equal(await type(0).inputValue(), '類義');
    assert.equal(await type(1).inputValue(), '対義');
    await page
      .getByRole('button', {
        name: '関連語を追加',
        exact: true,
      })
      .click();
    await input(2).fill('HOR');
    assert.equal(await options(2).first().locator('strong').textContent(), 'hor');
    await input(2).fill('hö');
    const umlauts = await options(2).locator('strong').allTextContents();
    assert.ok(umlauts.length);
    assert.ok(!umlauts.includes('hor'));
    await input(2).fill('ho\u0308');
    assert.deepEqual(await options(2).locator('strong').allTextContents(), umlauts);
    await input(2).fill('manž');
    assert.ok(!(await options(2).locator('strong').allTextContents()).includes('manž'));
    await input(2).fill('a');
    assert.equal(await options(2).count(), 20);
    assert.match(await rows.nth(2).textContent(), /件中20件/);
    await input(2).press('Escape');
    assert.equal(await input(2).getAttribute('aria-expanded'), 'false');
    assert.ok(await page.locator('#entry-editor').isVisible());
    // Adding and removing another row must preserve an unfinished query.
    await input(2).fill('taq');
    await page
      .getByRole('button', {
        name: '関連語を追加',
        exact: true,
      })
      .click();
    assert.equal(await input(2).inputValue(), 'taq');
    await rows
      .nth(3)
      .getByRole('button', {
        name: '削除',
        exact: true,
      })
      .click();
    assert.equal(await input(2).inputValue(), 'taq');
    // IME composition should not select a candidate on Enter.
    await input(2).focus();
    await input(2).dispatchEvent('compositionstart');
    await input(2).fill('月');
    await input(2).press('Enter');
    assert.equal(await input(2).getAttribute('aria-expanded'), 'false');
    assert.ok(await page.locator('#entry-editor').isVisible());
    await input(2).dispatchEvent('compositionend');
    await choose(2, 'bonna', '名詞');
    await page.setViewportSize({
      width: 390,
      height: 844,
    });
    await input(2).fill('taq');
    await rows.nth(2).scrollIntoViewIfNeeded();
    assert.ok(
      await page.locator('#entry-editor').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    );
    await page.screenshot({
      path: path.join(out, 'mobile-suggestions.png'),
      fullPage: true,
    });
    await options(2)
      .filter({
        has: page.locator('strong', {
          hasText: /^taq$/,
        }),
      })
      .filter({
        hasText: '連体詞',
      })
      .tap();
    assert.equal(await input(2).inputValue(), 'taq（連体詞）');
    assert.equal(await input(2).getAttribute('aria-expanded'), 'false');
    await page.click('#save-draft');
    const saved = JSON.parse(
      await page.evaluate(() => localStorage.getItem('lafca-dictionary:edits:v1')),
    );
    assert.equal(
      saved.changes.find((c) => c.after.id === manz.id).after.relations[2].id,
      entry('taq', '連体詞').id,
    );
    // Follow the automatically created reverse link, then change/remove it there.
    await page.setViewportSize({
      width: 1280,
      height: 1000,
    });
    await page
      .locator('.relations')
      .getByRole('button', {
        name: 'bonna',
        exact: true,
      })
      .click();
    assert.equal(await page.locator('.entry h2').textContent(), 'bonna');
    assert.deepEqual(await page.locator('.relations > span').allTextContents(), ['類義']);
    assert.equal(await page.locator('.relations button').textContent(), 'manž');
    await edit();
    await type(0).selectOption('対義');
    await page.click('#save-draft');
    await page
      .locator('.relations')
      .getByRole('button', {
        name: 'manž',
        exact: true,
      })
      .click();
    assert.equal(
      await page
        .locator('.relations button')
        .filter({
          hasText: /^bonna$/,
        })
        .evaluate((e) => e.previousElementSibling.textContent),
      '対義',
    );
    await page
      .locator('.relations')
      .getByRole('button', {
        name: 'bonna',
        exact: true,
      })
      .click();
    await edit();
    await rows
      .nth(0)
      .getByRole('button', {
        name: '削除',
        exact: true,
      })
      .click();
    await page.click('#save-draft');
    assert.equal(await page.locator('.relations button').count(), 0);
    await page.reload();
    await login(page);
    await page.fill('#query', 'manž');
    assert.equal(
      await page
        .locator('.relations')
        .getByRole('button', {
          name: 'bonna',
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator('.relations')
        .getByRole('button', {
          name: 'jod',
          exact: true,
        })
        .count(),
      1,
    );
    // Undoing either endpoint removes its reciprocal change without affecting others.
    await page.click('#manage-edits');
    page.once('dialog', (d) => d.accept());
    await page
      .locator('.change-row')
      .filter({
        has: page.locator('span', {
          hasText: /^taq（編集）$/,
        }),
      })
      .getByRole('button', {
        name: '変更を取り消す',
        exact: true,
      })
      .click();
    await page
      .locator('#changes-dialog')
      .getByRole('button', {
        name: '閉じる',
        exact: true,
      })
      .click();
    assert.equal(
      await page
        .locator('.relations')
        .getByRole('button', {
          name: 'taq',
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator('.relations')
        .getByRole('button', {
          name: 'jod',
          exact: true,
        })
        .count(),
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      'Related-word suggestions: meaning/head search, homographs, stable links, validation, keyboard/IME/touch, umlauts and mobile: OK;',
      out,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
