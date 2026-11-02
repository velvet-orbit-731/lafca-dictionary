'use strict';
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.LAFCA_PLAYWRIGHT_MODULE || 'playwright');
const data = require('./data.json');
const pageSize = 24;
const lastPage = Math.ceil(data.entries.length / pageSize);
const middlePage = Math.ceil(lastPage / 2);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'lafca-dictionary-'));
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
    const page = await browser.newPage({
        viewport: {
          width: 1440,
          height: 1050,
        },
      }),
      errors = [],
      network = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => {
      if (/^https?:/.test(r.url())) network.push(r.url());
    });
    await page.goto(pathToFileURL(path.join(__dirname, 'ラフカ語辞書.html')).href);
    assert.equal(await page.locator('.entry').count(), 24);
    assert.ok((await page.locator('#count').textContent()).startsWith(data.entries.length + ' 件'));
    assert.equal(await page.locator('#strict').count(), 0);
    assert.ok(await page.locator('#gender').isHidden());
    assert.ok(await page.locator('#gender').isDisabled());
    assert.ok(await page.locator('#class').isHidden());
    assert.ok((await page.locator('.entry').first().boundingBox()).y < 420);
    assert.equal(await page.locator('.guide').count(), 0);
    assert.equal(
      await page
        .getByText('使い方・収録情報', {
          exact: true,
        })
        .count(),
      0,
    );
    for (const head of ['gessad 等', 'u ＋ 与格', 'zen pfor ＋ 動名詞', '-ča', '-t-'])
      assert.ok(!data.entries.some((e) => e.head === head));
    const topPager = page.locator('#pager-top'),
      bottomPager = page.locator('#pager-bottom');
    const currentPage = () => topPager.locator('[aria-current="page"]').textContent();
    const entryIds = () => page.locator('.entry').evaluateAll((es) => es.map((e) => e.id));
    const firstPage = await entryIds();
    assert.deepEqual(await topPager.locator('button').allTextContents(), [
      '前へ',
      '1',
      '2',
      '3',
      String(middlePage),
      String(lastPage),
      '次へ',
    ]);
    assert.ok(
      await topPager
        .getByRole('button', {
          name: '前へ',
          exact: true,
        })
        .isDisabled(),
    );
    await topPager
      .getByRole('button', {
        name: middlePage + 'ページ',
        exact: true,
      })
      .click();
    assert.equal(await currentPage(), String(middlePage));
    assert.deepEqual(
      await entryIds(),
      data.entries.slice((middlePage - 1) * pageSize, middlePage * pageSize).map((e) => 'entry-' + e.id),
    );
    assert.equal(await bottomPager.locator('[aria-current="page"]').textContent(), String(middlePage));
    await bottomPager
      .getByRole('button', {
        name: lastPage + 'ページ',
        exact: true,
      })
      .click();
    assert.equal(await currentPage(), String(lastPage));
    assert.equal(await page.locator('.entry').count(), data.entries.length % 24 || 24);
    assert.ok(
      await topPager
        .getByRole('button', {
          name: '次へ',
          exact: true,
        })
        .isDisabled(),
    );
    await topPager
      .getByRole('button', {
        name: '1ページ',
        exact: true,
      })
      .click();
    assert.deepEqual(await entryIds(), firstPage);
    // 同じ乱数列で実行し、シャッフル後の全ページに重複・欠落がないことを確認。
    await page.evaluate(() => {
      let seed = 12345;
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    });
    await page.selectOption('#pos', '動詞');
    const originalVerbs = await entryIds();
    await topPager
      .getByRole('button', {
        name: '2ページ',
        exact: true,
      })
      .click();
    await page.click('#shuffle');
    assert.equal(await page.inputValue('#pos'), '動詞');
    assert.equal(await currentPage(), '1');
    const shuffledFirst = await entryIds();
    assert.notDeepEqual(shuffledFirst, originalVerbs);
    const verbs = data.entries.filter((e) => e.pos === '動詞'),
      shuffled = [];
    for (let n = 1; n <= Math.ceil(verbs.length / pageSize); n++) {
      await topPager
        .getByRole('button', {
          name: n + 'ページ',
          exact: true,
        })
        .click();
      shuffled.push(...(await entryIds()));
    }
    assert.equal(new Set(shuffled).size, verbs.length);
    assert.deepEqual(
      [...shuffled].sort(),
      verbs
        .map((e) => 'entry-' + e.id)
        .sort(),
    );
    await topPager
      .getByRole('button', {
        name: '1ページ',
        exact: true,
      })
      .click();
    assert.deepEqual(await entryIds(), shuffledFirst);
    await page.click('#shuffle');
    assert.notDeepEqual(await entryIds(), shuffledFirst);
    await page.selectOption('#class', '非交替');
    await page.fill('#query', 'b');
    await page.check('input[name="scope"][value="head"]');
    await page.uncheck('#useinfl');
    const filtered = (await entryIds()).sort();
    await page.click('#shuffle');
    assert.equal(await page.inputValue('#query'), 'b');
    assert.equal(await page.inputValue('#class'), '非交替');
    assert.deepEqual((await entryIds()).sort(), filtered);
    await page.click('#reset');
    assert.deepEqual(await entryIds(), firstPage);
    await page.screenshot({
      path: path.join(out, 'desktop-list.png'),
    });
    const search = async (text) => {
      await page.click('#reset');
      await page.fill('#query', text);
    };
    await search('Šena');
    await page.check('input[name="mode"][value="exact"]');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['Šena']);
    await page
      .locator('.entry .tag')
      .filter({
        hasText: /^人名$/,
      })
      .click();
    await page.fill('#query', '');
    assert.match(await page.locator('#count').textContent(), /^150 件/);
    await page.selectOption('#gender', 'F');
    assert.match(await page.locator('#count').textContent(), /^28 件/);
    await search('Öšer');
    await page.check('input[name="mode"][value="exact"]');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['Oš']);
    await search('Leplen');
    await page.check('input[name="mode"][value="exact"]');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['Lepel']);
    await search('兵士');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['blaclor']);
    assert.ok(await topPager.isHidden());
    assert.ok(await bottomPager.isHidden());
    assert.ok(await page.locator('#shuffle').isDisabled());
    assert.equal(await page.locator('.conjbtn').textContent(), '曲用');
    assert.ok(!(await page.locator('.entry').innerText()).includes('blacluren'));
    assert.equal(await page.locator('.preview').count(), 0);
    assert.equal(await page.locator('.etym').textContent(), '祖語型：*blaklawr');
    await page.locator('.conjbtn').click();
    assert.equal(await page.locator('.conjbtn').getAttribute('aria-expanded'), 'true');
    assert.ok((await page.locator('.entry').textContent()).includes('blaclürers'));
    for (const text of [
      '資料明記',
      '規則補完',
      '原資料の分類',
      'アルディア語',
      '用法',
      '備考',
      'ラフカ語辞書.md',
      '登録形',
    ]) {
      assert.ok(!(await page.locator('.entry').innerText()).includes(text));
    }
    assert.equal(await page.locator('.forms [title]').count(), 0);
    await page.screenshot({
      path: path.join(out, 'desktop-blaclor.png'),
      fullPage: true,
    });
    await search('blaclürers');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['blaclor']);
    await page.uncheck('#useinfl');
    assert.equal(await page.locator('.entry').count(), 0);
    await page.check('#useinfl');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['blaclor']);
    await page.check('input[name="scope"][value="head"]');
    await page.check('input[name="mode"][value="exact"]');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['blaclor']);
    await page.fill('#query', 'blacl');
    assert.equal(await page.locator('.entry').count(), 0);
    await page.check('input[name="mode"][value="prefix"]');
    assert.ok((await page.locator('.entry h2').allTextContents()).includes('blaclor'));
    await page.fill('#query', 'aclor');
    assert.equal(await page.locator('.entry').count(), 0);
    await page.check('input[name="mode"][value="partial"]');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['blaclor']);
    await search('兵士');
    await page.check('input[name="scope"][value="head"]');
    assert.equal(await page.locator('.entry').count(), 0);
    await page.check('input[name="scope"][value="trans"]');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['blaclor']);
    assert.ok(await page.locator('#useinfl').isDisabled());
    await search('blaklawr');
    assert.equal(await page.locator('.entry').count(), 0);
    await page.check('input[name="scope"][value="full"]');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['blaclor']);
    // ウムラウトを全方式で区別し、NFC/NFDの同じ文字は一致させる。
    await search('am');
    await page.check('input[name="scope"][value="head"]');
    await page.uncheck('#useinfl');
    for (const mode of ['partial', 'prefix', 'exact']) {
      await page.check('input[name="mode"][value="' + mode + '"]');
      await page.fill('#query', 'am');
      assert.ok(!(await page.locator('.entry h2').allTextContents()).includes('äm'));
      await page.fill('#query', 'äm');
      assert.ok((await page.locator('.entry h2').allTextContents()).includes('äm'));
    }
    await page.fill('#query', 'a\u0308m');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['äm']);
    await search('blaclurers');
    assert.equal(await page.locator('.entry').count(), 0);
    await search('blaclu\u0308rers');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['blaclor']);
    await search('azmelen');
    assert.equal(await page.locator('.entry').count(), 0);
    await search('ažmelen');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['ažmelen']);
    await page.click('#reset');
    await page.selectOption('#pos', '名詞');
    await page.selectOption('#gender', 'F');
    await page.selectOption('#class', 'Ⅱ型');
    const expected = data.entries.filter(
      (e) => e.pos === '名詞' && e.gender === 'F' && e.class === 'Ⅱ型',
    ).length;
    assert.match(await page.locator('#count').textContent(), new RegExp('^' + expected + ' 件'));
    assert.ok(await page.locator('#gender').isVisible());
    const classOptions = () =>
      page.locator('#class option').evaluateAll((items) => items.map((o) => o.value));
    assert.ok((await classOptions()).includes('Ⅰ型'));
    assert.ok(!(await classOptions()).includes('非交替'));
    // 名詞の性・曲用型を選んだまま品詞を切り替えても条件が残らない。
    await page.selectOption('#pos', '動詞');
    assert.match(await page.locator('#count').textContent(), new RegExp('^' + verbs.length + ' 件'));
    assert.ok(await page.locator('#gender').isHidden());
    assert.ok(await page.locator('#gender').isDisabled());
    assert.equal(await page.inputValue('#gender'), '');
    assert.equal(await page.inputValue('#class'), '');
    assert.ok((await classOptions()).includes('e/i交替'));
    for (const invalid of ['Ⅰ型', 'Ⅱ型', '固定型', '子音幹'])
      assert.ok(!(await classOptions()).includes(invalid));
    await page.selectOption('#class', '非交替');
    assert.match(
      await page.locator('#count').textContent(),
      new RegExp('^' + verbs.filter((e) => e.class === '非交替').length + ' 件'),
    );
    await topPager
      .getByRole('button', {
        name: '次へ',
        exact: true,
      })
      .click();
    assert.equal(await currentPage(), '2');
    await page.selectOption('#pos', '形容詞');
    assert.match(
      await page.locator('#count').textContent(),
      new RegExp('^' + data.entries.filter((e) => e.pos === '形容詞').length + ' 件'),
    );
    assert.equal(await currentPage(), '1');
    assert.ok(await page.locator('#gender').isHidden());
    assert.deepEqual((await classOptions()).sort(), ['', '子音幹', '母音幹'].sort());
    await page.selectOption('#tag-filter', '女性語幹短縮');
    assert.match(
      await page.locator('#count').textContent(),
      new RegExp(
        '^' +
          data.entries.filter((e) => e.pos === '形容詞' && e.tags.includes('女性語幹短縮')).length +
          ' 件',
      ),
    );
    await page.selectOption('#pos', '前置詞');
    assert.match(await page.locator('#count').textContent(), /^23 件/);
    assert.ok(await page.locator('#gender').isHidden());
    assert.ok(await page.locator('#class').isHidden());
    assert.ok(await page.locator('#class').isDisabled());
    await page.selectOption('#pos', '');
    assert.ok((await page.locator('#count').textContent()).startsWith(data.entries.length + ' 件'));
    assert.ok(await page.locator('#class').isHidden());
    await page.selectOption('#pos', '名詞');
    assert.equal(await page.inputValue('#gender'), '');
    assert.equal(await page.inputValue('#class'), '');
    await page.click('#reset');
    await page.selectOption('#pos', '動詞');
    await page.selectOption('#tag-filter', '不規則活用');
    assert.deepEqual((await page.locator('.entry h2').allTextContents()).sort(), [
      'bajen',
      'jen',
      'len',
      'tanen',
      'tu',
      'zen',
    ]);
    // 品詞と項目種別を分け、基数・序数は品詞を横断して探せる。
    await page.click('#reset');
    assert.deepEqual(
      await page.locator('#pos option').evaluateAll((os) => os.map((o) => o.value)),
      [
        '',
        '名詞',
        '代名詞',
        '動詞',
        '形容詞',
        '連体詞',
        '副詞',
        '前置詞',
        '接続詞',
        '小辞',
        '間投詞',
      ],
    );
    assert.equal(await page.locator('#numeral option[value=""]').textContent(), '指定なし');
    await page.selectOption('#numeral', 'all');
    assert.match(await page.locator('#count').textContent(), /^62 件/);
    const allNumerals = [];
    for (let n = 1; n <= 3; n++) {
      await topPager
        .getByRole('button', {
          name: n + 'ページ',
          exact: true,
        })
        .click();
      allNumerals.push(...(await entryIds()));
    }
    assert.equal(new Set(allNumerals).size, 62);
    assert.deepEqual(
      allNumerals.sort(),
      data.entries
        .filter((e) => ['基数', '序数'].includes(e.numeralType))
        .map((e) => 'entry-' + e.id)
        .sort(),
    );
    await page.selectOption('#pos', '名詞');
    assert.match(await page.locator('#count').textContent(), /^18 件/);
    await page.click('#reset');
    assert.equal(await page.inputValue('#numeral'), '');
    assert.ok((await page.locator('#count').textContent()).startsWith(data.entries.length + ' 件'));
    await page.selectOption('#numeral', '基数');
    assert.match(await page.locator('#count').textContent(), /^31 件/);
    await page.selectOption('#pos', '名詞');
    assert.match(await page.locator('#count').textContent(), /^18 件/);
    await page.selectOption('#pos', '形容詞');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['gan']);
    await page.locator('.conjbtn').click();
    assert.ok((await page.locator('.forms').innerText()).includes('ganar'));
    assert.ok(!(await page.locator('.forms').innerText()).includes('比較級'));
    await page
      .locator('.entry .tag')
      .filter({
        hasText: /^基数$/,
      })
      .click();
    assert.equal(await page.inputValue('#pos'), '');
    assert.match(await page.locator('#count').textContent(), /^31 件/);
    await page.selectOption('#numeral', '序数');
    assert.match(await page.locator('#count').textContent(), /^31 件/);
    assert.equal(await page.locator('.conjbtn').count(), 0);
    await page.selectOption('#pos', '動詞');
    assert.ok(await page.locator('#numeral').isHidden());
    assert.equal(await page.inputValue('#numeral'), '');
    await page.selectOption('#kind', '接辞');
    assert.ok(
      (await page.locator('#count').textContent()).startsWith(
        data.entries.filter((e) => e.kind === '接辞').length + ' 件',
      ),
    );
    assert.ok(await page.locator('#pos').isHidden());
    assert.ok(await page.locator('#gender').isHidden());
    assert.ok(await page.locator('#class').isHidden());
    assert.equal(await page.locator('.conjbtn').count(), 0);
    await page.selectOption('#kind', '慣用句');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['zen pfor']);
    assert.equal(await page.locator('.conjbtn').textContent(), '活用');
    assert.equal(await page.locator('#pos option[value="名詞"]').evaluate((o) => o.disabled), true);
    await page.selectOption('#kind', '単語');
    await page.selectOption('#pos', '動詞');
    assert.match(
      await page.locator('#count').textContent(),
      new RegExp('^' + verbs.filter((e) => e.kind === '単語').length + ' 件'),
    );
    for (const [pos, count] of [
      ['代名詞', 2],
      ['連体詞', 44],
      ['接続詞', 10],
      ['小辞', 16],
      ['間投詞', 8],
    ]) {
      await page.selectOption('#pos', pos);
      assert.match(await page.locator('#count').textContent(), new RegExp('^' + count + ' 件'));
      assert.ok(await page.locator('#gender').isHidden());
      assert.ok(await page.locator('#class').isHidden());
    }
    await search('vipu');
    await page.check('input[name="scope"][value="head"]');
    await page.check('input[name="mode"][value="exact"]');
    assert.equal(await page.locator('.conjbtn').count(), 0);
    assert.deepEqual(await page.locator('.entry .tag').allTextContents(), [
      '代名詞',
      '数量疑問',
      '数量疑問',
    ]);
    for (const [head, pos] of [
      ['ma', '接続詞'],
      ['tin', '接続詞'],
      ['se', '接続詞'],
      ['ort', '副詞'],
      ['cend', '接続詞'],
      ['sindin', '接続詞'],
    ]) {
      await search(head);
      await page.check('input[name="mode"][value="exact"]');
      await page.uncheck('#useinfl');
      assert.deepEqual(await page.locator('.entry .tag.pos').allTextContents(), [pos]);
    }
    await search('banujen');
    await page
      .getByRole('button', {
        name: 'banüj',
        exact: true,
      })
      .click();
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['banüj']);
    assert.ok(await page.locator('.forms').isVisible());
    await page.reload();
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['banüj']);
    await page
      .locator('.entry .tag')
      .filter({
        hasText: /^固定型$/,
      })
      .click();
    assert.ok((await page.locator('.entry').count()) > 1);
    assert.equal(await page.inputValue('#pos'), '名詞');
    assert.ok(await page.locator('#gender').isVisible());
    await page.selectOption('#pos', '動詞');
    assert.match(await page.locator('#count').textContent(), new RegExp('^' + verbs.length + ' 件'));
    assert.equal(await page.locator('#active-tag').textContent(), '');
    assert.ok(await page.locator('#clear-tag').isHidden());
    // 派生語も、品詞に合う見出しから語形表を開ける。
    for (const [head, label, form] of [
      ['banujen', '活用', 'banujit'],
      ['manžaq', '曲用', 'manžaqers'],
      ['avenaq', '曲用', 'avenaqu'],
      ['cunaq', '曲用', 'cunaqen'],
      ['čaq', '曲用', 'čaqet'],
      ['gassen', '活用', 'gessädi'],
      ['zen pfor', '活用', 'zit pfor'],
    ]) {
      await search(head);
      await page.check('input[name="scope"][value="head"]');
      await page.uncheck('#useinfl');
      assert.equal(await page.locator('.entry').count(), 1);
      assert.equal(await page.locator('.conjbtn').textContent(), label);
      assert.ok(!(await page.locator('.entry').innerText()).includes(form));
      await page.locator('.conjbtn').click();
      assert.ok((await page.locator('.forms').innerText()).includes(form));
      for (const text of [
        '資料明記',
        '規則補完',
        '原資料の分類',
        'アルディア語',
        '備考',
        '登録形',
      ]) {
        assert.ok(!(await page.locator('.entry').innerText()).includes(text));
      }
    }
    for (const [gerund, base, form] of [
      ['gessad', 'gassen', 'gessädi'],
      ['humad', 'homen', 'humädi'],
      ['sibad', 'seben', 'sibäder'],
    ]) {
      await search(gerund);
      assert.deepEqual(await page.locator('.entry h2').allTextContents(), [base]);
      assert.equal(await page.locator('.conjbtn').textContent(), '活用');
      await page.locator('.conjbtn').click();
      assert.ok((await page.locator('.forms').innerText()).includes(form));
      assert.ok((await page.locator('.forms').innerText()).includes('動名詞の曲用'));
      await page.uncheck('#useinfl');
      assert.equal(await page.locator('.entry').count(), 0);
    }
    await search('gessäder');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['gassen']);
    for (const head of ['-ča', '-t-']) {
      await search(head);
      assert.equal(await page.locator('.entry').count(), 0);
    }
    await search('horča');
    await page.check('input[name="mode"][value="exact"]');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['horča']);
    await search('manžaqers');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['manžaq']);
    // 集合名詞は独立した男性名詞として引け、単数を作らない。
    const exactSearch = async (text) => {
      await search(text);
      await page.check('input[name="scope"][value="head"]');
      await page.check('input[name="mode"][value="exact"]');
    };
    for (const [head, base, form] of [
      ['manča', 'manž', 'mančan'],
      ['bidašta', 'bidiš', 'bidaštar'],
      ['höri', 'hor', 'hörins'],
    ]) {
      await exactSearch(head);
      assert.deepEqual(await page.locator('.entry h2').allTextContents(), [head]);
      const tags = await page.locator('.entry .tag').allTextContents();
      assert.ok(tags.includes('名詞'));
      assert.ok(tags.includes('男性'));
      assert.ok(tags.includes('複数のみ'));
      assert.equal(await page.locator('.conjbtn').textContent(), '曲用');
      await page.locator('.conjbtn').click();
      assert.ok((await page.locator('.forms').innerText()).includes(form));
      assert.ok(!(await page.locator('.forms').innerText()).includes('単数'));
      assert.equal(await page.locator('.forms tbody td').count(), 5);
      await exactSearch(form);
      assert.deepEqual(await page.locator('.entry h2').allTextContents(), [head]);
      await exactSearch(base);
      await page
        .getByRole('button', {
          name: head,
          exact: true,
        })
        .click();
      assert.deepEqual(await page.locator('.entry h2').allTextContents(), [head]);
      assert.ok(await page.locator('.forms').isVisible());
    }
    await page.screenshot({
      path: path.join(out, 'desktop-collective.png'),
      fullPage: true,
    });
    for (const [head, genitive] of [
      ['fissa', 'fissan'],
      ['loča', 'lučan'],
      ['žoht', 'žuhten'],
      ['gohel', 'gohlen'],
      ['bänn', 'bännen'],
    ]) {
      await exactSearch(head);
      assert.ok((await page.locator('.entry .tag').allTextContents()).includes('単数のみ'));
      await page.locator('.conjbtn').click();
      assert.ok((await page.locator('.forms').innerText()).includes(genitive));
      assert.ok(!(await page.locator('.forms').innerText()).includes('複数'));
      assert.equal(await page.locator('.forms tbody td').count(), 5);
    }
    for (const absent of [
      'fissas',
      'fissans',
      'lučans',
      'žuhtes',
      'gohles',
      'bänni',
      'mančas',
      'bidaštas',
      'höres',
    ]) {
      await exactSearch(absent);
      assert.equal(await page.locator('.entry').count(), 0, absent);
    }
    await exactSearch('fissa');
    await page.locator('.conjbtn').click();
    await page.screenshot({
      path: path.join(out, 'desktop-fissa.png'),
      fullPage: true,
    });

    await search('banujen');
    assert.equal(await page.locator('.etym').count(), 0);
    await search('len');
    await page.check('input[name="scope"][value="head"]');
    await page.check('input[name="mode"][value="exact"]');
    await page.uncheck('#useinfl');
    assert.equal(await page.locator('.etym').textContent(), '祖語型：*lé-en / *lī-t');
    await search('om');
    await page.check('input[name="scope"][value="head"]');
    await page.check('input[name="mode"][value="exact"]');
    await page.uncheck('#useinfl');
    assert.deepEqual(await page.locator('.entry h2').allTextContents(), ['om']);
    assert.equal(await page.locator('.conjbtn').count(), 0);
    await search('jimal');
    await page.locator('.conjbtn').click();
    assert.ok((await page.locator('.entry').textContent()).includes('jimlan'));
    await page.screenshot({
      path: path.join(out, 'desktop-jimal.png'),
      fullPage: true,
    });
    await page.setViewportSize({
      width: 390,
      height: 844,
    });
    await page.screenshot({
      path: path.join(out, 'mobile-jimal.png'),
      fullPage: true,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await search('manžaq');
    await page.check('input[name="scope"][value="head"]');
    await page.uncheck('#useinfl');
    await page.locator('.conjbtn').click();
    await page.screenshot({
      path: path.join(out, 'mobile-manžaq.png'),
      fullPage: true,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.click('#reset');
    assert.ok(await page.locator('#gender').isHidden());
    assert.ok(await page.locator('#class').isHidden());
    await page.screenshot({
      path: path.join(out, 'mobile-list.png'),
    });
    await topPager
      .getByRole('button', {
        name: middlePage + 'ページ',
        exact: true,
      })
      .click();
    assert.equal(await currentPage(), String(middlePage));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await topPager
      .getByRole('button', {
        name: lastPage + 'ページ',
        exact: true,
      })
      .click();
    await topPager.locator('[aria-current="page"]').hover();
    assert.equal(
      await topPager.locator('[aria-current="page"]').evaluate((el) => getComputedStyle(el).color),
      'rgb(255, 255, 255)',
    );
    await page.screenshot({
      path: path.join(out, 'mobile-last-page.png'),
      fullPage: true,
    });
    assert.equal(await page.locator('.entry').count(), data.entries.length % 24 || 24);
    await page.setViewportSize({
      width: 320,
      height: 740,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await topPager
      .getByRole('button', {
        name: '1ページ',
        exact: true,
      })
      .click();
    await page.setViewportSize({
      width: 390,
      height: 844,
    });
    await page.selectOption('#pos', '名詞');
    await page.selectOption('#gender', 'F');
    await page.selectOption('#class', 'Ⅰ型');
    await page.screenshot({
      path: path.join(out, 'mobile-noun-filters.png'),
    });
    await page.selectOption('#pos', '動詞');
    await page.screenshot({
      path: path.join(out, 'mobile-verb-filters.png'),
    });
    assert.match(await page.locator('#count').textContent(), new RegExp('^' + verbs.length + ' 件'));
    assert.ok(await page.locator('#gender').isHidden());
    await page.setViewportSize({
      width: 320,
      height: 740,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await exactSearch('cori');
    await page.locator('.conjbtn').click();
    assert.ok((await page.locator('.forms').innerText()).includes('coru'));
    assert.ok(!(await page.locator('.entry').innerText()).includes('未確定'));
    for (const [head, form] of [
      ['jure', 'juru'],
      ['mešä', 'mešän'],
      ['tupü', 'tupüjen'],
      ['bajen', 'ban'],
      ['fen', 'fas'],
      ['zen', 'zas'],
      ['pipren', 'dipipert'],
      ['bisčlen', 'bisčelsi'],
      ['jibben', 'dijipt'],
      ['tepžen', 'tipži'],
    ]) {
      await exactSearch(head);
      await page.uncheck('#useinfl');
      await page.locator('.conjbtn').click();
      assert.ok((await page.locator('.forms').innerText()).includes(form));
      assert.ok(!(await page.locator('.forms').innerText()).includes('未確定'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await exactSearch(form);
      assert.ok((await page.locator('.entry h2').allTextContents()).includes(head));
    }
    await exactSearch('deqen');
    await page.locator('.conjbtn').click();
    const weatherForms = await page.locator('.forms').innerText();
    assert.ok(weatherForms.includes('無人称'));
    assert.ok(weatherForms.includes('diq'));
    for (const absent of ['未確定', '1人称', '2人称', '複数', '命令'])
      assert.ok(!weatherForms.includes(absent));
    await page.screenshot({
      path: path.join(out, 'mobile-deqen.png'),
      fullPage: true,
    });
    for (const head of ['ardaq', 'inzaq', 'šewaq'].filter((h) =>
      data.entries.some((e) => e.head === h),
    )) {
      await exactSearch(head);
      assert.ok((await page.locator('.tag').allTextContents()).includes('男性'));
    }
    await search('<script>alert(1)</script>');
    assert.equal(await page.locator('.entry').count(), 0);
    assert.ok((await page.locator('.empty').textContent()).includes('該当する語がありません'));
    assert.ok(await topPager.isHidden());
    assert.ok(await bottomPager.isHidden());
    assert.ok(await page.locator('#shuffle').isDisabled());
    // HTML単体で移動しても検索できる。
    const standalone = path.join(out, 'standalone.html');
    fs.copyFileSync(path.join(__dirname, 'ラフカ語辞書.html'), standalone);
    await page.goto(pathToFileURL(standalone).href);
    assert.equal(await page.locator('.entry').count(), 24);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    console.log('UI checks passed; screenshots: ' + out);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
