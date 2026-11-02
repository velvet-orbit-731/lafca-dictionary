'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.LAFCA_PLAYWRIGHT_MODULE || 'playwright');
const filename = process.env.LAFCA_TEST_HTML || path.join(__dirname, 'ラフカ語辞書.html');
const published = JSON.parse(
  fs.readFileSync(filename, 'utf8').match(/const DATA = ([\s\S]*?);<\/script>/)[1],
);
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
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(filename).href);
    await page.check('input[name=scope][value=trans]');
    await page.check('input[name=mode][value=exact]');
    const cases = published.entries.flatMap((e) =>
      e.meaning.split(/[\n,、]/).flatMap((raw) => {
        const term = raw.trim(),
          plain = term.replace(/（[^（）]*）|\([^()]*\)/g, '').trim();
        return [...new Set([term, plain, plain.replace(/^[〜～]+|[〜～]+$/g, '').trim()])]
          .filter(Boolean)
          .map((query) => ({
            id: e.id,
            head: e.head,
            query,
          }));
      }),
    );
    const failed = await page.evaluate((cases) => {
      const input = document.querySelector('#query'),
        failures = [];
      for (const { query, id, head } of cases) {
        input.value = query;
        input.dispatchEvent(
          new Event('input', {
            bubbles: true,
          }),
        );
        let found = Boolean(document.getElementById('entry-' + id));
        while (!found) {
          const next = [...document.querySelectorAll('#pager-top button')].find(
            (b) => b.textContent === '次へ',
          );
          if (!next || next.disabled) break;
          next.click();
          found = Boolean(document.getElementById('entry-' + id));
        }
        if (!found)
          failures.push({
            query,
            head,
          });
      }
      return failures;
    }, cases);
    assert.deepEqual(
      failed,
      [],
      'every registered translation, reading and unannotated label must find its entry',
    );
    for (const [query, head] of [
      ['小麦', 'bräm'],
      ['ライオン', 'balva'],
      ['キノコ', 'čema'],
      ['医師', 'cifipel'],
      ['家屋', 'äm'],
      ['蘋果', 'ara'],
      ['虚無', 'amla'],
      ['おかあさん', 'miser'],
      ['第7', 'divet'],
      ['八十', 'cweningev'],
      ['アリカ', 'Alica'],
    ]) {
      await page.fill('#query', query);
      assert.ok(
        await page
          .locator('.entry h2')
          .filter({
            hasText: new RegExp('^' + head + '$'),
          })
          .count(),
        query,
      );
    }
    for (const [query, head] of [
      ['穀物', 'bräm'],
      ['昆虫', 'rölič'],
      ['液体', 'fissa'],
      ['死ぬ', 'žoden'],
    ]) {
      await page.fill('#query', query);
      assert.equal(
        await page
          .locator('.entry h2')
          .filter({
            hasText: new RegExp('^' + head + '$'),
          })
          .count(),
        0,
        'do not add unsupported broader/narrower meanings',
      );
    }
    await page.fill('#query', 'amla');
    await page.check('input[name=scope][value=head]');
    assert.deepEqual(await page.locator('.meaning li').allTextContents(), [
      '荒野, 曠野',
      '空虚, 虚無, 空っぽ',
    ]);
    await page.check('input[name=scope][value=trans]');
    await page.fill('#query', '空虚 荒野');
    assert.equal(
      await page.locator('.entry h2').textContent(),
      'amla',
      'multi-term search stays available',
    );
    await page.setViewportSize({
      width: 390,
      height: 844,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(
      'All ' +
        published.entries.length +
        ' entries: ' +
        cases.length +
        ' exact gloss searches, spellings, readings, annotations, separate senses and mobile: OK',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
