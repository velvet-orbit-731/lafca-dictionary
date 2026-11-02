'use strict';
const assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs'),
  os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.LAFCA_PLAYWRIGHT_MODULE || 'playwright');
const { mockOwner, login } = require('./editor-auth.test-helper.cjs');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.LAFCA_CHROME_PATH
      ? {
          executablePath: process.env.LAFCA_CHROME_PATH,
        }
      : {}),
  });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lafca-morphology-'));
  try {
    const context = await browser.newContext({
        viewport: {
          width: 1280,
          height: 1050,
        },
      }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname, 'ラフカ語辞書.html')).href);
    await mockOwner(page);
    await login(page);
    const value = (l) =>
      page
        .getByRole('textbox', {
          name: l,
          exact: true,
        })
        .inputValue();
    const cancel = async () => {
      page.once('dialog', (d) => d.accept());
      await page.click('#cancel-entry');
    };
    const start = async (head) => {
      await page.click('#add-entry');
      await page.fill('#edit-head', head);
      await page.fill('#edit-meaning', '自動補完の検証');
    };
    await start('Šenatest');
    await page.selectOption('#edit-gender', 'F');
    assert.equal(await value('単数属格'), 'Šenatesten');
    await page.fill('#edit-head', 'Oš');
    assert.equal(await value('単数与格'), 'Öšer');
    await cancel();
    await start('testa');
    await page.selectOption('#edit-gender', 'F');
    assert.equal(await value('単数属格'), 'testan');
    assert.equal(await value('複数主格'), 'testas');
    await page.fill('#edit-head', 'vassa');
    assert.equal(await value('単数属格'), 'vassan');
    assert.equal(await value('単数奪格'), 'vasso');
    await page
      .getByRole('textbox', {
        name: '単数与格',
        exact: true,
      })
      .fill('vassary');
    await page.locator('#edit-meaning').click();
    await page.fill('#edit-head', 'vessa');
    assert.equal(await value('単数属格'), 'vessan');
    assert.equal(await value('単数与格'), 'vassary');
    await page.selectOption('#edit-number', 'singular');
    assert.equal(await page.locator('#edit-tables .form-edit-row').count(), 5);
    await page.click('#save-draft');
    assert.ok(await page.locator('#entry-editor').isHidden());
    await page.reload();
    await login(page);
    await page
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    assert.equal(await value('単数与格'), 'vassary');
    await page
      .getByRole('button', {
        name: '単数与格を自動補完に戻す',
        exact: true,
      })
      .click();
    assert.equal(await value('単数与格'), 'vessar');
    await page.selectOption('#edit-number', '');
    assert.equal(await value('複数主格'), 'vessas');
    await page.click('#save-draft');
    // Lexical stems generate all cases; q/g is explicitly resolved, not guessed.
    await start('testžuser');
    await page.selectOption('#edit-class', 'Ⅰ型');
    await page.fill('#edit-oblique', 'testžusar-');
    assert.equal(await value('単数属格'), 'testžusaren');
    assert.equal(await value('単数与格'), 'testžusärer');
    await cancel();
    await start('testlossa');
    await page.selectOption('#edit-gender', 'F');
    await page.selectOption('#edit-class', 'Ⅱ型');
    await page.fill('#edit-oblique', 'testluss');
    assert.equal(await value('複数主格'), 'testlussas');
    await cancel();
    await start('testlaq');
    assert.match(await page.locator('#editor-error').textContent(), /斜格語幹/);
    await page.fill('#edit-oblique', 'testlag');
    assert.equal(await value('単数属格'), 'testlagen');
    await cancel();
    await start('testaq');
    await page.selectOption('#edit-pattern', 'aq');
    assert.equal(await value('単数与格'), 'testaqer');
    await cancel();
    await start('testmanča');
    await page.selectOption('#edit-number', 'plural');
    assert.equal(await value('複数属格'), 'testmančan');
    assert.equal(await page.locator('#edit-tables .form-edit-row').count(), 5);
    assert.equal(await page.inputValue('#edit-gender'), 'M');
    await cancel();
    // All three alternations, consonant junctions, vowel stems, and impersonal restrictions.
    await start('testgassen');
    await page.selectOption('#edit-pos', '動詞');
    assert.equal(await value('現在3単数'), 'testgess');
    assert.equal(await value('動名詞単数属格'), 'testgessaden');
    await page.fill('#edit-head', 'testhlenden');
    await page.selectOption('#edit-class', 'e/i交替');
    assert.equal(await value('現在3複数'), 'testhlinži');
    assert.equal(await value('過去分詞'), 'ditesthlint');
    await page.fill('#edit-head', 'testhomen');
    await page.selectOption('#edit-class', 'o/u交替');
    assert.equal(await value('現在3単数'), 'testhum');
    await page.fill('#edit-head', 'testfen');
    await page.selectOption('#edit-class', '母音幹');
    assert.equal(await value('現在3単数'), 'testfe');
    assert.equal(await value('現在1単数'), 'testfas');
    await page.selectOption('#edit-impersonal', 'yes');
    assert.equal(
      await page
        .getByRole('textbox', {
          name: '現在1単数',
          exact: true,
        })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole('textbox', {
          name: '命令単数',
          exact: true,
        })
        .count(),
      0,
    );
    await cancel();
    await start('testross');
    await page.selectOption('#edit-pos', '形容詞');
    assert.equal(await value('女性単数主格'), 'testrossa');
    assert.equal(await value('中性単数主格'), 'teströss');
    assert.equal(await value('比較級'), 'testrossar');
    await page.locator('.sense-editor summary').first().click();
    await page
      .locator('.sense-editor')
      .first()
      .getByLabel('基数', {
        exact: true,
      })
      .check();
    assert.equal(
      await page
        .getByRole('textbox', {
          name: '比較級',
          exact: true,
        })
        .count(),
      0,
    );
    await page
      .locator('.sense-editor')
      .first()
      .getByLabel('基数', {
        exact: true,
      })
      .uncheck();
    assert.equal(await value('比較級'), 'testrossar');
    await page.fill('#edit-female-stem', 'testros');
    assert.equal(await value('女性単数主格'), 'testrosa');
    assert.equal(await value('女性複数属格'), 'testrosans');
    await cancel();
    await start('testčaq');
    await page.selectOption('#edit-pos', '代名詞');
    await page.selectOption('#edit-pronoun-pattern', 'caq');
    assert.equal(await value('単数奪格'), 'testčaqü');
    await cancel();
    // Editing only a definition leaves the entire irregular paradigm unchanged.
    await page.click('#reset');
    await page.fill('#query', 'len');
    await page.check('input[name=mode][value=exact]');
    await page.check('input[name=scope][value=head]');
    await page.uncheck('#useinfl');
    await page
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    assert.equal(await value('アオリスト'), 'lit');
    assert.equal(await value('過去分詞'), 'dilt');
    await page.fill('#edit-meaning', 'である（編集の検証）');
    await page.click('#save-draft');
    await page.reload();
    await login(page);
    await page
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    assert.equal(await value('過去分詞'), 'dilt');
    await page.setViewportSize({
      width: 390,
      height: 844,
    });
    await page.locator('#edit-tables').scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(
        () =>
          document.querySelector('#entry-editor').scrollWidth <=
          document.querySelector('#entry-editor').clientWidth + 1,
      ),
    );
    await page.screenshot({
      path: path.join(out, 'mobile-automatic.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      'Automatic editor UI: noun, verb, adjective, overrides, persistence and mobile OK;',
      out,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
