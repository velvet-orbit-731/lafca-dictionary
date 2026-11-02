'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Search = require('./search.js');
const T = require('./taxonomy.js');
const data = JSON.parse(
  fs.readFileSync('ラフカ語辞書.html', 'utf8').match(/const DATA = (.*?);<\/script>/s)[1],
);
const entries = data.entries.map(T.normalize);
const index = Search.createIndex(entries);
const find = (query, options = {}) =>
  Search.select(index, {
    query,
    ...options,
  });
const heads = (results) => results.map((entry) => entry.head);

assert.ok(
  heads(
    find('荒野', {
      scope: 'trans',
      mode: 'exact',
    }),
  ).includes('amla'),
);
assert.ok(
  heads(
    find('曠野', {
      scope: 'trans',
      mode: 'exact',
    }),
  ).includes('amla'),
);
assert.deepEqual(
  heads(
    find('ähel', {
      scope: 'head',
      mode: 'exact',
    }),
  ),
  ['ähel'],
);
assert.deepEqual(find('a\u0308hel'), find('ähel'));
assert.ok(
  !heads(
    find('ahel', {
      scope: 'head',
      mode: 'exact',
    }),
  ).includes('ähel'),
);
assert.ok(
  heads(
    find('gessas', {
      scope: 'head',
      mode: 'exact',
    }),
  ).includes('gassen'),
);
assert.deepEqual(
  find('gessas', {
    scope: 'head',
    includeInflections: false,
    mode: 'exact',
  }),
  [],
);
assert.equal(
  find('', {
    numeral: 'all',
  }).length,
  62,
);
assert.equal(
  find('', {
    numeral: '基数',
    pos: '名詞',
    gender: 'N',
    className: '固定型',
  }).length,
  17,
);
assert.deepEqual(
  heads(
    find('', {
      numeral: '基数',
      pos: '名詞',
      gender: 'F',
    }),
  ),
  ['žamra'],
);
assert.deepEqual(
  heads(
    find('swocvener', {
      scope: 'head',
      mode: 'exact',
      numeral: '基数',
    }),
  ),
  ['swocven'],
);
assert.deepEqual(
  heads(
    find('swocvenet', {
      scope: 'head',
      mode: 'exact',
      numeral: '序数',
    }),
  ),
  ['swocvenet'],
);
assert.deepEqual(
  heads(
    find('div', {
      scope: 'head',
      mode: 'exact',
    }),
  ),
  ['div'],
);
assert.ok(
  heads(
    find('a/e交替', {
      scope: 'full',
    }),
  ).includes('gassen'),
);
assert.deepEqual(
  find('a/e交替', {
    scope: 'head',
    includeInflections: false,
  }),
  [],
);
assert.deepEqual(
  find('gassen 食べる'),
  find('gassen', {
    scope: 'head',
    mode: 'exact',
  }),
);
assert.deepEqual(find('存在しない文字列'), []);

// 注記を省いた人名検索、複数語見出し、検索順の保持を小さな語彙で確認する。
const samples = [
  {
    ...entries[0],
    id: 'a',
    head: 'sample one',
    meaning: 'テスト（男性人名）',
  },
  {
    ...entries[0],
    id: 'b',
    head: 'sample two',
    meaning: '〜試す, 検証する〜\n点検',
  },
];
const sampleIndex = Search.createIndex(samples);
const select = (options) => Search.select(sampleIndex, options).map((entry) => entry.id);
assert.deepEqual(
  select({
    query: 'テスト',
    scope: 'trans',
    mode: 'exact',
  }),
  ['a'],
);
assert.deepEqual(
  select({
    query: '検証する',
    scope: 'trans',
    mode: 'exact',
  }),
  ['b'],
);
assert.deepEqual(
  select({
    query: 'sample one',
    scope: 'head',
    mode: 'exact',
  }),
  ['a'],
);
assert.deepEqual(
  Search.select([...sampleIndex].reverse()).map((entry) => entry.id),
  ['b', 'a'],
);
console.log('検索: 語義・表記・語形・複合条件・順序を確認しました。');
