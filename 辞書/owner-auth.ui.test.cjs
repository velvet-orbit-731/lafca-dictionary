'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
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
  try {
    const page = await browser.newPage(),
      errors = [],
      requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (r.url().startsWith('https:')) requests.push(r.url());
    });
    const url = pathToFileURL(path.join(__dirname, 'ラフカ語辞書.html')).href;
    const entries = JSON.parse(
      fs.readFileSync('ラフカ語辞書.html', 'utf8').match(/const DATA = ([\s\S]*?);<\/script>/)[1],
    ).entries;
    const before = entries.find((e) => e.head === 'fissa'),
      after = {
        ...before,
        meaning: '所有者の未公開の語義',
        senseTags: before.senseTags.map((sense) => ({
          ...sense,
          meaning: '所有者の未公開の語義',
        })),
      };
    const draft = {
      version: 1,
      changes: [
        {
          before,
          after,
        },
      ],
    };
    await page.goto(url);
    await page.evaluate((d) => {
      localStorage.setItem('lafca-dictionary:edits:v1', JSON.stringify(d));
      localStorage.setItem('owner', 'true');
      sessionStorage.setItem('authenticated', 'true');
    }, draft);
    await page.reload();
    await page.fill('#query', 'fissa');
    await page.check('input[name=mode][value=exact]');
    assert.equal(await page.locator('.sense-meaning').textContent(), before.meaning);
    assert.deepEqual(requests, []);
    assert.equal(await page.locator('.entry-edit-controls button').count(), 0);
    await page.evaluate(() => {
      document.querySelector('#add-entry').click();
      document.querySelector('#manage-edits').click();
      document.querySelector('#delete-entry').click();
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'lafca-dictionary:edits:v1',
        }),
      );
    });
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.ok(await page.locator('.editor-toolbar').isHidden());
    // A token for another account (even one returning the owner's login string) is refused.
    await page.route('https://api.github.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 123,
          login: 'velvet-orbit-731',
          type: 'User',
        }),
      }),
    );
    await page.click('#edit-mode');
    await page.fill('#github-token', 'other-token');
    await page.click('#owner-login-submit');
    await page.waitForFunction(() =>
      document.querySelector('#login-status').textContent.includes('所有者だけ'),
    );
    assert.equal(await page.inputValue('#github-token'), '');
    assert.ok(await page.locator('.editor-toolbar').isHidden());
    assert.deepEqual(requests, ['https://api.github.com/user']);
    await page
      .locator('#owner-login')
      .getByRole('button', {
        name: 'キャンセル',
        exact: true,
      })
      .click();
    await page.unroute('https://api.github.com/**');
    // A successful response arriving after cancellation must not unlock the editor.
    let release;
    const pending = new Promise((resolve) => (release = resolve));
    await page.route('https://api.github.com/**', async (route) => {
      await pending;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          route.request().url().endsWith('/user')
            ? {
                id: 337917858,
                login: 'velvet-orbit-731',
                type: 'User',
              }
            : {
                owner: {
                  id: 337917858,
                },
                permissions: {
                  push: true,
                },
              },
        ),
      });
    });
    await page.click('#edit-mode');
    await page.fill('#github-token', 'cancelled-token');
    const sent = page.waitForRequest('https://api.github.com/user');
    await page.click('#owner-login-submit');
    await sent;
    await page
      .locator('#owner-login')
      .getByRole('button', {
        name: 'キャンセル',
        exact: true,
      })
      .click();
    const finished = page.waitForResponse(
      'https://api.github.com/repos/velvet-orbit-731/lafca-dictionary',
    );
    release();
    await finished;
    await page.unrouteAll({
      behavior: 'wait',
    });
    assert.ok(await page.locator('.editor-toolbar').isHidden());
    await mockOwner(page);
    await login(page);
    assert.equal(await page.locator('.sense-meaning').textContent(), after.meaning);
    assert.equal(await page.inputValue('#github-token'), '');
    const storage = await page.evaluate(() =>
      JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
    );
    assert.ok(!storage.includes('test-token'));
    assert.ok(!storage.includes('cancelled-token'));
    assert.ok(!storage.includes('other-token'));
    await page.click('#edit-mode');
    assert.equal(await page.locator('.sense-meaning').textContent(), before.meaning);
    assert.equal(await page.locator('.entry-edit-controls button').count(), 0);
    assert.deepEqual(
      JSON.parse(await page.evaluate(() => localStorage.getItem('lafca-dictionary:edits:v1'))),
      draft,
    );
    await login(page);
    await page.reload();
    await page.fill('#query', 'fissa');
    await page.check('input[name=mode][value=exact]');
    assert.equal(await page.locator('.sense-meaning').textContent(), before.meaning);
    assert.ok(await page.locator('.editor-toolbar').isHidden());
    await login(page);
    await page.evaluate(() => {
      window.dispatchEvent(
        new PageTransitionEvent('pagehide', {
          persisted: true,
        }),
      );
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', {
          persisted: true,
        }),
      );
    });
    assert.ok(await page.locator('.editor-toolbar').isHidden());
    assert.equal(await page.locator('.sense-meaning').textContent(), before.meaning);
    assert.deepEqual(errors, []);
    console.log(
      'Owner authentication: anonymous/foreign accounts blocked, drafts protected, cancellation/reload/logout lock editor; no stored credentials: OK',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
