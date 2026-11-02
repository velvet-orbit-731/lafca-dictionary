'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs');
const M = require('./morphology.js'),
  E = require('./editor-core.js');
const entries = JSON.parse(
  fs.readFileSync('ラフカ語辞書.html', 'utf8').match(/const DATA = ([\s\S]*?);<\/script>/)[1],
).entries;
const entry = (h) => E.clone(entries.find((e) => e.head === h));
const plain = (head, pos, gender = '', cls = '', restriction = '') => ({
  id: '123456781234abcd',
  head,
  pos,
  kind: '単語',
  numeralType: '',
  numberRestriction: restriction,
  gender,
  class: cls,
  meaning: '試験',
  tags: [],
  protoForms: [],
  relations: [],
  tables: [],
});
const noun = (head, gender = 'M', cls = '固定型', restriction = '') =>
  plain(head, '名詞', gender, cls, restriction);
const verb = (head, cls) => plain(head, '動詞', '', cls);
const generated = (e, settings = {}, overrides = {}) =>
  M.map({
    tables: M.generate(e, settings, overrides),
  });

function check(e, settings, expected) {
  const f = generated(e, settings);
  for (const [label, value] of Object.entries(expected))
    assert.equal(f[label], value, e.head + ' ' + label);
}
// Literal expectations from Lafca grammar, not generated test answers.
check(
  noun('amalbuh'),
  {},
  {
    単数属格: 'amalbuhen',
    単数与格: 'amalbüher',
    複数主格: 'amalbuhes',
  },
);
check(
  noun('Oš', 'M', '固定型', 'singular'),
  {},
  {
    単数与格: 'Öšer',
  },
);
check(
  noun('Šena', 'F', '固定型', 'singular'),
  {},
  {
    単数属格: 'Šenan',
    単数奪格: 'Šeno',
  },
);
check(
  noun('žuser', 'M', 'Ⅰ型'),
  {
    obliqueStem: 'žusar',
  },
  {
    単数主格: 'žuser',
    単数属格: 'žusaren',
    単数与格: 'žusärer',
    複数主格: 'žusares',
  },
);
check(
  noun('lossa', 'F', 'Ⅱ型'),
  {
    obliqueStem: 'luss',
  },
  {
    単数属格: 'lussan',
    単数与格: 'lussar',
    単数奪格: 'lusso',
    複数主格: 'lussas',
  },
);
check(
  noun('fož', 'M', 'Ⅱ型'),
  {
    obliqueStem: 'fuž',
  },
  {
    単数属格: 'fužen',
    単数与格: 'füžer',
    複数主格: 'fužes',
  },
);
check(
  noun('fäq', 'N'),
  {
    obliqueStem: 'fäg',
  },
  {
    単数属格: 'fägen',
    複数主格: 'fägi',
    複数与格: 'fägirs',
  },
);
check(
  noun('cori', 'N'),
  {},
  {
    単数属格: 'corin',
    単数奪格: 'coru',
    複数主格: 'cori',
    複数属格: 'corins',
  },
);
check(
  noun('fü', 'F'),
  {},
  {
    単数属格: 'füjen',
    複数主格: 'füjes',
  },
);
check(
  noun('mešä', 'F'),
  {},
  {
    単数与格: 'mešär',
    単数奪格: 'mešo',
  },
);
assert.deepEqual(generated(noun('fissa', 'F', '固定型', 'singular')), {
  単数主格: 'fissa',
  単数属格: 'fissan',
  単数与格: 'fissar',
  単数奪格: 'fisso',
  単数再帰格: 'fissal',
});
assert.deepEqual(generated(noun('manča', 'M', '固定型', 'plural')), {
  複数主格: 'manča',
  複数属格: 'mančan',
  複数与格: 'mančar',
  複数奪格: 'mančo',
  複数再帰格: 'mančal',
});
check(
  noun('höri', 'M', '固定型', 'plural'),
  {},
  {
    複数主格: 'höri',
    複数属格: 'hörins',
    複数与格: 'hörirs',
    複数奪格: 'hörus',
  },
);
check(
  noun('testaq'),
  {
    nounPattern: 'aq',
  },
  {
    単数与格: 'testaqer',
    複数与格: 'testaqers',
  },
);
assert.throws(() => generated(noun('laq')), /斜格語幹/);
assert.throws(() => generated(noun('test', 'M', 'Ⅰ型')), /斜格語幹/);
check(
  verb('gassen', 'a/e交替'),
  {
    gerundDeclension: true,
  },
  {
    現在1単数: 'gessas',
    現在3単数: 'gess',
    アオリスト: 'gass',
    命令複数: 'gasseg',
    過去分詞: 'digesset',
    動名詞単数与格: 'gessäder',
    動名詞複数主格: 'gessädi',
    動名詞複数属格: 'gessädins',
  },
);
check(
  verb('hlenden', 'e/i交替'),
  {},
  {
    現在3複数: 'hlinži',
    現在3単数: 'hlind',
    アオリスト: 'hlend',
    過去分詞: 'dihlint',
  },
);
check(
  verb('homen', 'o/u交替'),
  {},
  {
    現在3単数: 'hum',
    アオリスト: 'hom',
    動名詞: 'humad',
  },
);
check(
  verb('žangen', 'a/e交替'),
  {},
  {
    現在3単数: 'ženk',
    現在1単数: 'žengas',
    アオリスト: 'žank',
  },
);
check(
  verb('ihen', '非交替'),
  {},
  {
    アオリスト: 'ihit',
    動名詞: 'ihad',
    過去分詞: 'dijiht',
  },
);
check(
  verb('pipren', '非交替'),
  {},
  {
    現在3単数: 'piper',
    命令単数: 'piper',
    現在3複数: 'pipersi',
  },
);
check(
  verb('jen', '母音幹'),
  {},
  {
    現在3単数: 'ji',
    現在1単数: 'jas',
    アオリスト: 'je',
    過去分詞: 'dijet',
  },
);
check(
  verb('len', '母音幹'),
  {},
  {
    アオリスト: 'lit',
    動名詞: 'lad',
    過去分詞: 'dilt',
  },
);
check(
  verb('tän', '母音幹'),
  {},
  {
    現在3単数: 'tä',
    現在1単数: 'täs',
    アオリスト: 'tät',
    条件法: 'tän',
    過去分詞: 'dität',
  },
);
check(
  verb('bajen', '母音幹'),
  {
    presentStem: 'ba',
  },
  {
    現在1単数: 'bas',
    アオリスト: 'bat',
    条件法: 'ban',
    過去分詞: 'dibat',
  },
);
const rain = generated(verb('deqen', 'e/i交替'), {
  impersonal: true,
});
assert.equal(rain['現在3単数'], 'diq');
assert.ok(!('現在1単数' in rain));
assert.ok(!('命令単数' in rain));
check(
  plain('ross', '形容詞', '', '子音幹'),
  {},
  {
    女性単数主格: 'rossa',
    中性単数主格: 'röss',
    女性単数与格: 'rossar',
    中性複数主格: 'rosses',
    比較級: 'rossar',
    文語最上級: 'rössist',
  },
);
check(
  plain('jimal', '形容詞', '', '子音幹'),
  {
    femaleStem: 'jiml',
  },
  {
    女性単数主格: 'jimla',
    女性複数属格: 'jimlans',
  },
);
const gan = plain('gan', '形容詞', '', '子音幹');
gan.numeralType = '基数';
assert.ok(!('比較級' in generated(gan)));
check(
  plain('čaq', '代名詞'),
  {},
  {
    単数属格: 'čaqen',
    単数対格: 'čaqet',
    単数奪格: 'čaqü',
  },
);
assert.deepEqual(
  generated(plain('čaq', '代名詞'), {
    pronounPattern: 'none',
  }),
  {},
);
check(
  plain('testčaq', '代名詞'),
  {
    pronounPattern: 'caq',
  },
  {
    単数属格: 'testčaqen',
    単数再帰格: 'testčaqel',
  },
);
// Migrate every existing inflected entry without changing a cell or grid.
let checked = 0;
for (const e of entries.filter((e) => e.tables.length)) {
  const model = M.infer(e);
  M.validate(model);
  const old = M.generate(e, model.settings, model.overrides);
  assert.deepEqual(M.update(e, model, old).tables, e.tables, e.head);
  E.validate({
    ...e,
    inflection: model,
  });
  checked++;
}
for (const head of ['len', 'jen', 'tanen', 'zen', 'pipren']) {
  const e = entry(head),
    m = M.infer(e);
  assert.deepEqual(
    M.map({
      tables: M.generate(e, m.settings, m.overrides),
    }),
    M.map(e),
    head,
  );
}
// Changed lemmas/gender update generated cells, overrides and explicit omissions survive round trips.
let e = noun('fissa', 'F'),
  model = {
    version: 1,
    settings: {
      nounPattern: 'auto',
    },
    overrides: {},
    omitted: [],
  };
let old = M.generate(e, model.settings);
e.tables = old;
model.overrides['単数与格'] = 'custom';
e = {
  ...e,
  head: 'vassa',
};
let result = M.update(e, model, old);
assert.equal(M.map(result)['単数属格'], 'vassan');
assert.equal(M.map(result)['単数与格'], 'custom');
e = {
  ...e,
  tables: result.tables,
  inflection: model,
};
assert.deepEqual(M.infer(JSON.parse(JSON.stringify(e))), model);
model.omitted = ['複数再帰格'];
result = M.update(e, model, result.generated);
assert.ok(!('複数再帰格' in M.map(result)));
const g = entry('gassen'),
  gm = M.infer(g),
  gg = M.generate(g, gm.settings, gm.overrides);
gm.overrides['動名詞'] = 'bessad';
result = M.update(g, gm, gg);
assert.equal(M.map(result)['動名詞単数属格'], 'bessaden');
assert.equal(M.map(result)['動名詞複数主格'], 'bessädi');
console.log(
  'Automatic morphology: grammar fixtures, ' +
    checked +
    ' existing paradigms, overrides, omissions and persistence OK',
);
