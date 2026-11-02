'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  cp = require('node:child_process');
const T = require('./taxonomy.js'),
  E = require('./editor-core.js');
const entries = JSON.parse(
  fs.readFileSync('ラフカ語辞書.html', 'utf8').match(/const DATA = (.*?);<\/script>/s)[1],
).entries;
const word = (head, pos) => entries.find((e) => e.head === head && (!pos || e.pos === pos));
for (const e of entries) {
  E.validate(e);
  assert.deepEqual(T.tags(e), e.tags, e.head);
  assert.deepEqual(T.normalize(e), e, e.head + ' normalization is idempotent');
}
for (const [h, t] of [
  ['jure', '短語尾母音型'],
  ['cori', '短語尾母音型'],
  ['mešä', '短語尾母音型'],
  ['fü', '緩衝子音型'],
  ['tupü', '緩衝子音型'],
  ['šacö', '緩衝子音型'],
  ['höri', '複数-i型'],
  ['manča', '-a型'],
  ['tino', '-o型'],
  ['žänk', '子音幹型'],
])
  assert.ok(word(h).tags.includes(t), h);
assert.equal(word('höri').gender, 'M');
assert.ok(word('len').tags.includes('不規則活用'));
assert.deepEqual(
  T.senses(word('le', '小辞')).map((s) => s.tags),
  [['進行'], ['受動']],
);
assert.deepEqual(
  T.senses(word('mössel')).map((s) => s.tags),
  [[], ['敬称']],
);
assert.ok(T.all(word('fissa')).includes('不可算'));
assert.ok(word('fissa').tags.includes('単数のみ'));
assert.ok(!T.all(word('Ämhor')).includes('不可算'));
assert.ok(!T.all(word('banüja')).includes('集合'));
assert.ok(T.all(word('vipu')).includes('疑問'));
assert.ok(T.all(word('we')).includes('疑問'));
assert.ok(T.all(word('ähel')).includes('未来'));
assert.ok(T.all(word('ähel')).includes('時制'));
assert.equal(entries.filter((e) => T.all(e).includes('数詞')).length, 62);
assert.equal(word('žamra').gender, 'F');
assert.ok(T.all(word('žamra')).includes('基数'));
assert.equal(word('cwen').gender, 'N');
assert.ok(T.all(word('swocvenet')).includes('序数'));
assert.equal(entries.filter((e) => T.all(e).includes('交替')).length, 73);
assert.ok(entries.filter((e) => e.kind === '接辞').every((e) => !e.tags.includes('接辞')));
assert.ok(entries.every((e) => !e.tags.includes('語末子音交替')));
const e = structuredClone(word('mössel')),
  s = T.senses(e).reverse();
e.meaning = s.map((x) => x.meaning).join('\n');
e.senseTags = s.filter((x) => x.tags.length);
const draft = E.updateDraft(
  entries,
  {
    version: 1,
    changes: [],
  },
  e,
);
assert.deepEqual(E.validateDraft(JSON.parse(JSON.stringify(draft))), draft);
assert.deepEqual(
  T.senses(E.applyDraft(entries, draft).find((x) => x.id === e.id)).map((x) => x.tags),
  [['敬称'], []],
);
assert.deepEqual(E.merge(entries, draft.changes), E.applyDraft(entries, draft));
const bad = structuredClone(e);
bad.senseTags[0].meaning = '違う語義';
assert.throws(() => E.apply(entries, [bad]), /語義と分類/);
const invalid = structuredClone(word('fissa'));
invalid.senseTags[0].tags.push('受動');
assert.throws(() => E.validate(invalid), /語義と分類/);
const old = structuredClone(word('vipu'));
delete old.senseTags;
old.tags = ['代名詞', '疑問', '数量'];
assert.deepEqual(T.normalize(old).senseTags, word('vipu').senseTags);
// Python export uses identical classifications and preserves sense metadata.
const rebuilt = JSON.parse(
  cp.execFileSync(
    'python3',
    [
      '-c',
      "import json,build; print(json.dumps(build.browser_data(build.collect())))",
    ],
    {
      maxBuffer: 10e6,
    },
  ),
);
assert.deepEqual(rebuilt.entries, entries);
console.log(
  'Taxonomy: grammatical axes, sense binding, hierarchy, migration, backups, merge and Python parity: OK',
);
