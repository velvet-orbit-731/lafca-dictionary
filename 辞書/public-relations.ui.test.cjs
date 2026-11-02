'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  crypto = require('node:crypto');
const { chromium } = require(process.env.LAFCA_PLAYWRIGHT_MODULE || 'playwright');
const { login } = require('./editor-auth.test-helper.cjs');
const source = fs.readFileSync('ラフカ語辞書.html', 'utf8'),
  pattern = /(const DATA = )([\s\S]*?)(;<\/script>)/;
const data = JSON.parse(source.match(pattern)[2]),
  entry = (h) => data.entries.find((e) => e.head === h);
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const url = 'https://lafca.test/',
  api = 'https://api.github.com/repos/velvet-orbit-731/lafca-dictionary';
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
    let files = {
      'index.html': source,
      'dictionary.json': JSON.stringify({
        version: 1,
        entries: data.entries,
        metadata: {},
        deletedIds: [],
      }),
    };
    files['version.json'] = JSON.stringify({
      entries: data.entries.length,
      htmlSha256: hash(source),
      dictionarySha256: hash(files['dictionary.json']),
    });
    let staged,
      writes = 0,
      identityRequests = 0;
    await context.route(url + '**', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: files['index.html'],
      }),
    );
    await context.route('https://api.github.com/**', async (route) => {
      const request = route.request(),
        u = request.url(),
        method = request.method();
      assert.equal(request.headers().authorization, 'Bearer test-token');
      const owner = {
        id: 337917858,
        login: 'velvet-orbit-731',
        type: 'User',
      };
      let body;
      if (u === 'https://api.github.com/user') {
        identityRequests++;
        body = owner;
      } else if (u === api)
        body = {
          owner,
          permissions: {
            push: true,
          },
        };
      else if (u === api + '/git/ref/heads/main')
        body = {
          object: {
            sha: 'head',
          },
        };
      else if (u === api + '/git/commits/head')
        body = {
          tree: {
            sha: 'tree',
          },
        };
      else if (u === api + '/git/trees/tree')
        body = {
          tree: Object.keys(files).map((path) => ({
            path,
            type: 'blob',
            sha: path,
          })),
        };
      else if (u.startsWith(api + '/git/blobs/'))
        body = {
          encoding: 'base64',
          content: Buffer.from(files[u.slice((api + '/git/blobs/').length)]).toString('base64'),
        };
      else if (u === api + '/git/trees' && method === 'POST') {
        staged = Object.fromEntries(request.postDataJSON().tree.map((f) => [f.path, f.content]));
        body = {
          sha: 'next-tree',
        };
        writes++;
      } else if (u === api + '/git/commits' && method === 'POST') {
        body = {
          sha: 'next-commit',
        };
        writes++;
      } else if (u === api + '/git/refs/heads/main' && method === 'PATCH') {
        assert.equal(request.postDataJSON().force, false);
        files = staged;
        body = {};
        writes++;
      } else throw Error('Unexpected request: ' + method + ' ' + u);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    const search = async (p, head) => {
      await p.fill('#query', head);
      await p.check('input[name=mode][value=exact]');
      await p.check('input[name=scope][value=head]');
    };
    const link = (p, head) =>
      p.locator('.relations').getByRole('button', {
        name: head,
        exact: true,
      });
    await page.goto(url);
    await search(page, 'amalbuh');
    assert.equal(await page.locator('.relations > span').textContent(), '類義');
    await link(page, 'sänan').click();
    assert.equal(await page.locator('.entry h2').textContent(), 'sänan');
    await link(page, 'amalbuh').click();
    assert.equal(await page.locator('.entry h2').textContent(), 'amalbuh');
    assert.equal(identityRequests, 0);
    assert.equal(await page.locator('.entry-edit-controls button').count(), 0);
    // Missing reverse links in older public data are completed before any login.
    const fixture = structuredClone(data),
      a = fixture.entries.find((e) => e.head === 'fissa'),
      b = fixture.entries.find((e) => e.head === 'bonna');
    a.relations = ['派生', '類義', '対義'].map((title) => ({
      title,
      id: b.id,
      head: b.head,
    }));
    files['index.html'] = source.replace(
      pattern,
      (_, start, _data, end) => start + JSON.stringify(fixture) + end,
    );
    await page.reload();
    await search(page, 'bonna');
    assert.deepEqual(await page.locator('.relations > span').allTextContents(), [
      '派生',
      '類義',
      '対義',
    ]);
    assert.equal(await link(page, 'fissa').count(), 3);
    assert.equal(identityRequests, 0);
    files['index.html'] = source;
    await page.reload();
    // Publish from the entry editor, then view the result in an unauthenticated browser.
    await login(page);
    await search(page, 'fissa');
    await page
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    await page.fill('#edit-meaning', '荒野、曠野');
    await page.click('#add-sense');
    await page.fill('#edit-meaning-1', '空虚, 虚無、空っぽ');
    await page.locator('.sense-editor').nth(1).locator('summary').click();
    await page
      .locator('.sense-editor')
      .nth(1)
      .getByLabel('文語', {
        exact: true,
      })
      .check();
    await page
      .getByRole('button', {
        name: '関連語を追加',
        exact: true,
      })
      .click();
    const row = page.locator('.relation-edit-row').last();
    await row
      .getByRole('combobox', {
        name: '関係',
        exact: true,
      })
      .selectOption('類義');
    await row
      .getByRole('combobox', {
        name: '関連語',
        exact: true,
      })
      .fill('bonna');
    await row
      .locator('.relation-options')
      .getByRole('option')
      .filter({
        has: page.locator('strong', {
          hasText: /^bonna$/,
        }),
      })
      .click();
    await page.click('#save-entry');
    assert.ok(await page.locator('#changes-dialog').isVisible());
    assert.equal(await page.locator('.change-row').count(), 2);
    assert.equal(writes, 0);
    await page.click('#publish-edits');
    await page.waitForFunction(() =>
      document.querySelector('#publish-status').textContent.includes('GitHubに保存しました'),
    );
    assert.equal(writes, 3);
    assert.equal(
      JSON.parse(files['dictionary.json']).entries.find((e) => e.head === 'fissa').meaning,
      '荒野, 曠野\n空虚, 虚無, 空っぽ',
    );
    assert.equal(
      JSON.parse(await page.evaluate(() => localStorage.getItem('lafca-dictionary:edits:v1')))
        .changes.length,
      0,
    );
    await page
      .locator('#changes-dialog')
      .getByRole('button', {
        name: '閉じる',
        exact: true,
      })
      .click();
    await page.click('#edit-mode');
    assert.equal(await link(page, 'bonna').count(), 1);
    assert.equal(await page.locator('.entry-edit-controls button').count(), 0);
    const reader = await browser.newContext(),
      fresh = await reader.newPage(),
      readerRequests = [];
    await reader.route(url + '**', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: files['index.html'],
      }),
    );
    fresh.on('request', (r) => readerRequests.push(r.url()));
    await fresh.goto(url);
    await search(fresh, 'bonna');
    assert.equal(await fresh.locator('.relations > span').textContent(), '類義');
    await link(fresh, 'fissa').click();
    assert.equal(await fresh.locator('.entry h2').textContent(), 'fissa');
    assert.equal(await link(fresh, 'bonna').count(), 1);
    assert.equal(await fresh.locator('.entry-edit-controls button').count(), 0);
    assert.ok(readerRequests.every((u) => u.startsWith(url)));
    assert.equal(await fresh.evaluate(() => localStorage.length), 0);
    for (const meaning of ['荒野', '曠野', '空虚', '虚無', '空っぽ']) {
      await fresh.fill('#query', meaning);
      await fresh.check('input[name=scope][value=trans]');
      await fresh.check('input[name=mode][value=exact]');
      assert.deepEqual(
        await fresh
          .locator('#entry-' + entry('fissa').id + ' ol.meaning .sense-meaning')
          .allTextContents(),
        ['荒野, 曠野', '空虚, 虚無, 空っぽ'],
      );
    }
    assert.deepEqual(
      await fresh.locator('#entry-' + entry('fissa').id + ' .sense-tags').allTextContents(),
      ['不可算', '文語'],
    );
    const savedWord = JSON.parse(files['dictionary.json']).entries.find((e) => e.head === 'fissa');
    assert.deepEqual(
      savedWord.senseTags.map((s) => s.tags),
      [['不可算'], ['文語']],
    );
    // Deletion is an owner operation with a reversible draft and atomic publish.
    await login(page);
    await page.click('#add-entry');
    assert.ok(await page.locator('#delete-entry').isHidden());
    await page.click('#cancel-entry');
    const edit = () =>
      page
        .locator('.entry-edit-controls')
        .getByRole('button', {
          name: '編集',
          exact: true,
        })
        .click();
    await search(page, 'amalbuh');
    await edit();
    page.once('dialog', (d) => d.dismiss());
    await page.click('#delete-entry');
    assert.ok(await page.locator('#entry-editor').isVisible());
    const stale = await context.newPage();
    await stale.goto(url);
    await login(stale);
    await search(stale, 'amalbuh');
    await stale
      .locator('.entry-edit-controls')
      .getByRole('button', {
        name: '編集',
        exact: true,
      })
      .click();
    await page.setViewportSize({
      width: 390,
      height: 844,
    });
    assert.ok(
      await page.locator('#entry-editor').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    );
    await page.fill('#edit-head', ''); // A delete does not depend on form validity.
    page.once('dialog', (d) => d.accept());
    await page.click('#delete-entry');
    const deletedRow = () =>
      page.locator('.change-row').filter({
        hasText: 'amalbuh（削除）',
      });
    assert.equal(await deletedRow().count(), 1);
    assert.equal(
      await deletedRow()
        .getByRole('button', {
          name: '編集',
          exact: true,
        })
        .count(),
      0,
    );
    const deletion = JSON.parse(
      await page.evaluate(() => localStorage.getItem('lafca-dictionary:edits:v1')),
    );
    assert.ok(
      deletion.changes.some((c) => c.after === null && c.before.id === entry('amalbuh').id),
    );
    await stale.fill('#edit-meaning', '古いタブの変更');
    await stale.click('#save-draft');
    assert.match(await stale.locator('#editor-error').textContent(), /別のタブ/);
    await stale.close();
    await page
      .locator('#changes-dialog')
      .getByRole('button', {
        name: '閉じる',
        exact: true,
      })
      .click();
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('button', {
        name: '変更をバックアップ',
        exact: true,
      })
      .click();
    const download = await downloadPromise;
    const backupPath = await download.path();
    assert.deepEqual(JSON.parse(fs.readFileSync(backupPath, 'utf8')), deletion);
    await page.reload();
    await search(page, 'amalbuh');
    assert.equal(
      await page.locator('.entry').count(),
      1,
      'unpublished deletion does not affect public readers',
    );
    await login(page);
    assert.equal(await page.locator('.entry').count(), 0, 'deletion draft survives reload');
    await search(page, 'sänan');
    assert.equal(await link(page, 'amalbuh').count(), 0);
    await page.click('#manage-edits');
    page.once('dialog', (d) => d.accept());
    await deletedRow()
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
    assert.equal(await link(page, 'amalbuh').count(), 1, 'undo restores incoming relations');
    // Import the deletion backup and publish it through the same owner flow.
    await page.setInputFiles('#import-edits', backupPath);
    await page.waitForFunction(() =>
      JSON.parse(localStorage.getItem('lafca-dictionary:edits:v1')).changes.some(
        (c) => c.after === null,
      ),
    );
    await page.click('#manage-edits');
    await page.click('#publish-edits');
    await page.waitForFunction(() =>
      document.querySelector('#publish-status').textContent.includes('GitHubに保存しました'),
    );
    assert.equal(writes, 6);
    assert.deepEqual(JSON.parse(files['dictionary.json']).deletedIds, [entry('amalbuh').id]);
    assert.equal(JSON.parse(files['version.json']).entries, data.entries.length - 1);
    await fresh.reload();
    await search(fresh, 'amalbuh');
    assert.equal(await fresh.locator('.entry').count(), 0);
    await search(fresh, 'amalbüher');
    assert.equal(
      await fresh.locator('.entry').count(),
      0,
      'deleted inflected forms are not searchable',
    );
    await search(fresh, 'sänan');
    assert.equal(await link(fresh, 'amalbuh').count(), 0);
    assert.equal(await fresh.locator('.entry-edit-controls button').count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      'Public relations and deletion: anonymous links, publish, delete/cancel/undo, backups, concurrent tabs, mobile and fresh reader: OK',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
