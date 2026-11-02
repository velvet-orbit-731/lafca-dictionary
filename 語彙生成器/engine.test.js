'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const E = require('./engine.js');
const data = require('./data.json');
const narrow = {
  includeProto: false,
  ignoreRegistered: true,
  pos: 'auto',
  long: 'plain',
  i: 'fixed',
  p: 'p',
  ending: 'drop',
  shortening: 'keep',
  boundary: 'default',
  gender: 'M',
  grade: 'fixed',
};
const raw = (word, options = {}) =>
  E.generate(
    word,
    {
      ...narrow,
      ...options,
    },
    data,
  );
const subset = (actual, expected) => {
  for (const [key, value] of Object.entries(expected)) assert.equal(actual[key], value, key);
};
const heads = (r) => r.groups.map((g) => g.head).sort();

function one(word, options = {}) {
  const r = raw(word, options);
  assert.equal(r.complete, true, JSON.stringify(r.issues));
  assert.equal(r.groups.length, 1);
  return r.groups[0].analyses[0];
}

test('ラフカ語・アルディア語の両方から辞書に保存された祖語形を返す', () => {
  for (const [lafca, aldian, proto] of [
    ['jure', 'juraj', ['*juraj']],
    ['cori', 'kōri', ['*kōrī']],
    ['div', 'diwi', ['*díw-i']],
  ]) {
    for (const [word, language] of [[lafca, 'lafca'], [aldian, 'aldian']]) {
      for (const mode of ['auto', language]) {
        const r = E.generate(word, { language: mode }, data);
        assert.equal(r.kind, 'registered');
        const a = r.groups.flatMap((g) => g.analyses).find((a) => a.head === lafca);
        assert.deepEqual(a.protoForms, proto);
        assert.ok(a.matchedLanguages.includes(language));
      }
    }
  }
  assert.deepEqual(E.lookup(' CORI ', data, 'lafca')[0].protoForms, ['*kōrī']);
  assert.equal(E.lookup('juraj', data, 'lafca').length, 0);
  assert.equal(E.lookup('cori', data, 'aldian').length, 0);
});

test('全見出しの複数祖語形・語源注記を正本どおり保持し、対応未登録語も逆引きする', () => {
  const catalog = JSON.parse(fs.readFileSync('../dictionary.json', 'utf8'));
  assert.equal(data.entries.length + data.excluded.length, catalog.entries.length);
  for (const e of catalog.entries) {
    const r = E.generate(e.head, { language: 'lafca' }, data);
    assert.equal(r.kind, 'registered', e.head);
    const a = r.groups.flatMap((g) => g.analyses).find((a) => a.id === e.id);
    assert.ok(a, e.id);
    assert.deepEqual(a.protoForms, e.protoForms, e.head);
    assert.equal(a.etymology, catalog.metadata[e.id]?.etymology || '', e.head);
  }
  assert.deepEqual(E.lookup('ähel', data, 'lafca')[0].protoForms, ['*ēxl']);
  assert.deepEqual(E.lookup('bidiš', data, 'lafca')[0].protoForms, ['*bidəš-ú', '*bidáš-tā']);
  assert.match(E.lookup('diwi', data, 'aldian')[0].etymology, /仮説/);
  assert.deepEqual(E.lookup('hlenqorn', data, 'lafca')[0].protoForms, []);
});

test('非同源の語を共通祖語に結び付けず、ラフカ語自身の祖語形だけを返す', () => {
  const own = E.generate('cwen', { language: 'lafca' }, data);
  const a = own.groups.flatMap((g) => g.analyses).find((a) => a.head === 'cwen');
  assert.deepEqual(a.protoForms, ['*kwén-i']);
  assert.equal(a.relation, '非');
  assert.deepEqual(a.matchedLanguages, ['lafca']);
  assert.ok(!E.lookup('so', data, 'aldian').some((a) => a.head === 'cwen'));
  const unknown = E.generate('pirēpigo', { language: 'lafca' }, data);
  assert.equal(unknown.kind, 'blocked');
  assert.deepEqual(unknown.groups, []);
  assert.equal(unknown.reconstruction.candidates.length, 0, 'ラフカ語の入力では長母音記号を誤解釈しない');
});

test('両言語に同綴りがあっても入力言語で絞り、同一項目を二重計上しない', () => {
  const entry = (id, head, form) => ({ id, head, pos: 'noun', aliases: [{ form, relation: '対応語' }], protoForms: ['*' + id] });
  const fixture = { entries: [entry('one', 'same', 'ald'), entry('two', 'laf', 'same'), entry('three', 'same', 'same')], excluded: [] };
  const ids = (language) => E.lookup('same', fixture, language).map((a) => a.id);
  assert.deepEqual(ids('auto'), ['one', 'two', 'three']);
  assert.deepEqual(ids('lafca'), ['one', 'three']);
  assert.deepEqual(ids('aldian'), ['two', 'three']);
  assert.deepEqual(E.lookup('same', fixture)[2].matchedLanguages, ['lafca', 'aldian']);
});

test('資料で採用された見出しを優先し、入力を再解釈しない', () => {
  for (const [ald, laf] of [
    ['juraj', 'jure'],
    ['wluc', 'vluž'],
    ['kicuch', 'cižuč'],
    ['gohl', 'gohel'],
    ['fohl', 'fol'],
  ]) {
    const r = E.generate(ald, {}, data);
    assert.equal(r.kind, 'registered');
    assert.ok(heads(r).includes(laf));
  }
  assert.ok(
    E.generate('wluc', {}, data).groups[0].analyses.some((a) =>
      ['vluža', 'vlüž'].every((value) => a.forms.some((f) => f.value === value)),
    ),
  );
});
test('日常会話の採用語を、元の語尾や品詞を推測し直さず返す', () => {
  const pairs = [
    ['fusclī', 'füsžli'],
    ['fīspflam', 'fisplam'],
    ['pfospflūp', 'posplüp'],
    ['sīchwa', 'sičwa'],
    ['pipri', 'pipren'],
    ['suden', 'suden'],
    ['rehiz', 'rehiz'],
    ['dedlin', 'dedlin'],
    ['frechop', 'frečop'],
    ['wchīpu', 'vipu'],
    ['chīpu', 'čipu'],
    ['pfrūshlesh', 'prüšleš'],
    ['cafem', 'žafem'],
    ['cafemen', 'žafemen'],
    ['bīswig', 'bisviq'],
    ['lēmo', 'lämo'],
    ['wōstrag', 'wostraq'],
    ['dakta', 'dacta'],
    ['baka', 'baca'],
    ['napā', 'napan'],
    ['spfrogēd', 'sprogäd'],
    ['scrudák', 'sžrudek'],
    ['mēspfol', 'mäspol'],
    ['distcīh', 'distžih'],
    ['makwīg', 'mäcviq'],
    ['rīsclo', 'risžlo'],
    ['kōri', 'cori'],
    ['shīfes', 'šifes'],
    ['kīfip', 'cifipen'],
    ['dāpfir', 'dapiren'],
    ['mūshaw', 'müšo'],
    ['chaschrē', 'časčrä'],
    ['kimáb', 'cimeb'],
    ['pfo', 'po'],
    ['el-', 'el-'],
    ['fosklá', 'foscle'],
    ['kogen', 'cogen'],
    ['ranēsh', 'ranäš'],
    ['boda', 'bod'],
    ['lopat', 'lopat'],
    ['tegu', 'teq'],
    ['dechril', 'dečril'],
    ['fobon', 'fobon'],
    ['zūwem', 'züvem'],
    ['zlihi', 'zlihi'],
  ];
  for (const [ald, laf] of pairs) {
    const r = E.generate(
      ald,
      {
        pos: 'verb',
        ending: 'drop',
        long: 'q',
      },
      data,
    );
    assert.equal(r.kind, 'registered', ald);
    assert.equal(r.complete, true, ald);
    const group = r.groups.find((g) => g.head === laf);
    assert.ok(group, ald);
    assert.ok(
      group.analyses.some((a) => a.adopted && a.source.file === 'ウェブラフカ語辞書'),
      ald,
    );
  }
});
test('日常会話の特殊な曲用と活用を資料どおり表示する', () => {
  const entry = (ald, head) =>
    E.lookup(ald, data).find((e) => e.head === head && e.source.file === 'ウェブラフカ語辞書');
  const forms = (e) => Object.fromEntries(e.forms.map((f) => [f.label, f.value]));
  assert.deepEqual(forms(entry('kōri', 'cori')), {
    単数主格: 'cori',
    単数属格: 'corin',
    単数与格: 'corir',
    単数奪格: 'coru',
    単数再帰格: 'coril',
    複数主格: 'cori',
    複数属格: 'corins',
    複数与格: 'corirs',
    複数奪格: 'corus',
    複数再帰格: 'corils',
  });
  subset(forms(entry('lēmo', 'lämo')), {
    女性単数主格: 'lämowa',
    中性単数主格: 'lämö',
  });
  subset(forms(entry('boda', 'bod')), {
    女性単数主格: 'boda',
    中性単数主格: 'böd',
  });
  subset(forms(entry('pipri', 'pipren')), {
    現在3単数: 'piper', アオリスト: 'piprit',
    現在1単数: 'pipras',
    現在3複数: 'pipersi',
    過去分詞: 'dipipert',
  });
  subset(forms(entry('napā', 'napan')), {
    現在3単数: 'napa', アオリスト: 'napat',
    現在1単数: 'napas',
    接続法: 'napas',
    条件法: 'napan',
    動名詞: 'napad',
    過去分詞: 'dinapat',
  });
  assert.equal(entry('napā', 'napan').pos, 'verb');
  assert.equal(entry('cafemen', 'žafemen').pos, 'verb');
  assert.equal(entry('kōri', 'cori').pos, 'noun');
  assert.equal(entry('lēmo', 'lämo').pos, 'adjective');
  assert.ok(data.sources.some((s) => s.file === 'dictionary.json'));
});
test('複合語は資料の語形と通常の曲用を返し、登録形と未採用案を区別する', () => {
  for (const [ald, head] of [
    ['bengalt', 'bengalt'],
    ['wulcaff', 'wulžaf'],
    ['klohackun', 'clohažcun'],
  ]) {
    const r = E.generate(
      ald,
      {
        pos: 'verb',
        long: 'q',
        grade: 'all',
        shortening: 'all',
      },
      data,
    );
    assert.equal(r.kind, 'registered', ald);
    assert.deepEqual(heads(r), [head], ald);
    assert.equal(r.groups[0].status, 'registered', ald);
  }
  const forms = (ald) =>
    Object.fromEntries(E.lookup(ald, data).flatMap((e) => e.forms.map((f) => [f.label, f.value])));
  assert.equal(forms('wulcaff')['単数与格'], 'wulžäfer');
  assert.equal(forms('wulcaff')['複数主格'], 'wulžafes');
  assert.deepEqual(E.lookup('fissachōvin', data), [], '未採用案はウェブ正本に含めない');
});
test('同じ入力の動詞と小辞、同じ行の別語の由来を取り違えない', () => {
  assert.deepEqual(heads(E.generate('suden', {}, data)), ['sud', 'suden']);
  assert.deepEqual(heads(E.generate('wchīpu', {}, data)), ['vipu']);
  assert.deepEqual(heads(E.generate('chīpu', {}, data)), ['čipu']);
  assert.equal(E.lookup('tsēm', data).length, 0, '祖語だけの語を Ald. として取り込まない');
  assert.ok(
    !E.lookup('homen', data).some((e) => e.head === 'humad'),
    'Laf. の派生元を直接の Ald. 対応としない',
  );
});
test('統一辞書に出典を集約し、同品詞の重複と同形異品詞を区別する', () => {
  assert.ok([...data.entries, ...data.excluded].every((e) => e.source.file === 'ウェブラフカ語辞書'));
  const behind = E.lookup('encar', data);
  assert.equal(behind.length, 1);
  assert.ok(behind[0].meaning.includes('後ろ') && behind[0].meaning.includes('時間'));
  const sha = E.lookup('sha', data);
  assert.equal(sha.length, 2);
  assert.ok(sha.some((e) => e.grammar === '小辞'));
  assert.ok(sha.some((e) => e.grammar.startsWith('前置詞')));
});
test('すべての取り込み語をウェブ正本のIDで再照合できる', () => {
  assert.ok(data.entries.length > 300);
  for (const e of data.entries)
    for (const alias of e.aliases) {
      const r = E.generate(alias.form, {}, data);
      assert.equal(r.kind, 'registered', alias.form);
      assert.ok(
        r.groups.some((g) => g.head === e.head && g.analyses.some((a) => a.id === e.id)),
        e.id,
      );
      assert.match(e.source.id, /^[a-f0-9]{16}$/);
      assert.ok(e.source.url.endsWith('#word=' + e.source.id));
      const catalog = JSON.parse(fs.readFileSync('../dictionary.json', 'utf8'));
      assert.equal(catalog.entries.find((word) => word.id === e.source.id).head, e.head);
    }
});
test('同義の非同源行や、注記の別の辞書語を誤登録しない', () => {
  assert.equal(data.excluded.length, 50);
  for (const [ald, head] of [
    ['so', 'cwen'],
    ['ho', 'hräz'],
    ['to', 'gwešt'],
  ]) {
    assert.ok(!E.lookup(ald, data).some((e) => e.head === head));
    const excluded = E.generate(ald, { pos: 'noun' }, data).excluded;
    assert.ok(excluded.some((e) => e.head === head && e.relation === '非'));
  }
  assert.ok(!E.lookup('palen', data).some((e) => e.head === 'scünen'));
  assert.ok(E.lookup('palen', data).some((e) => e.head === 'palen' && e.relation === '転'));
  assert.ok(!E.lookup('nóshis', data).some((e) => e.head === 'gohel'));
  assert.ok(!E.lookup('shenoi', data).some((e) => e.head === 'läh'));
});
test('便所の独自複合 hlenqorn を awenaklohac の同語根として返さない', () => {
  assert.deepEqual(E.lookup('awenaklohac', data), []);
  const r = E.generate(
    'awenaklohac',
    {
      pos: 'noun',
    },
    data,
  );
  assert.equal(r.excluded.length, 1);
  const entry = r.excluded[0];
  assert.equal(entry.head, 'hlenqorn');
  assert.equal(entry.relation, '非');
  assert.equal(entry.source.file, 'ウェブラフカ語辞書');
  subset(Object.fromEntries(entry.forms.map((f) => [f.label, f.value])), {
    単数属格: 'hlenqornen',
    単数与格: 'hlenqörner',
    複数主格: 'hlenqornes',
  });
  assert.ok(!heads(r).includes('hlenqorn'));
  assert.ok(!data.entries.some((e) => e.ald === 'awenaklohac'));
});
test('A/B の参照を直接変換と混同せず、複数の同語根語を表示する', () => {
  const r = E.generate('fatta', {}, data);
  assert.deepEqual(heads(r), ['fatta', 'fett']);
  assert.equal(r.groups.find((g) => g.head === 'fett').analyses[0].matchedRelation, '関連形');
  assert.ok(
    E.generate('cangen', {}, data)
      .groups.find((g) => g.head === 'žänk')
      .analyses.every((a) => a.matchedRelation === '語根参照'),
  );
});
test('長音と Unicode 正規化を正しく扱う', () => {
  assert.deepEqual(heads(E.generate('  JURAJ  ', {}, data)), ['jure']);
  assert.deepEqual(heads(E.generate('pfēra'.normalize('NFD'), {}, data)), ['pära']);
  assert.notDeepEqual(heads(raw('tāfi')), heads(raw('tafi')));
});
test('§9 の音対応の実例を登録辞書に頼らず再現する', () => {
  for (const [a, b] of [
    ['pfotīr', 'pötir'],
    ['pfoshi', 'pöš'],
    ['kāpfich', 'capič'],
    ['juraj', 'jure'],
    ['chawal', 'čaval'],
    ['awena', 'avena'],
    ['sōge', 'soq'],
    ['wluc', 'vluž'],
    ['kicuch', 'cižuč'],
    ['konne', 'conn'],
    ['kome', 'com'],
    ['few', 'fü'],
    ['wai', 've'],
    ['fubá', 'fube'],
    ['schrolīs', 'sčrölis'],
  ])
    assert.deepEqual(heads(raw(a)), [b], a);
});
test('複文字を二重変換せず、長母音系列を早まってウムラウトしない', () => {
  assert.deepEqual(heads(raw('kāpfich')), ['capič']);
  assert.deepEqual(
    heads(
      raw('tāpfich', {
        long: 'q',
      }),
    ),
    ['täqpič'],
  );
  assert.deepEqual(
    heads(
      raw('cusir', {
        i: 'weak',
      }),
    ),
    ['žuser'],
  );
  assert.ok(
    !heads(
      raw('cusir', {
        i: 'weak',
      }),
    ).includes('žüser'),
  );
  assert.deepEqual(
    heads(
      raw('ajka', {
        boundary: 'all',
      }),
    ),
    ['ajca', 'eca'],
  );
  assert.deepEqual(heads(raw('wajēg')), ['väjäq']);
});
test('sch の s と č を別の子音として、語末母音保持と音節分割を判定する', () => {
  for (const [input, expected] of [
    ['aschi', 'äsči'],
    ['asche', 'asče'],
    ['schrolīs', 'sčrölis'],
    ['chaschrē', 'časčrä'],
  ]) {
    const r = raw(input);
    assert.equal(r.complete, true, JSON.stringify(r.issues));
    assert.deepEqual(heads(r), [expected], input);
  }
  assert.equal(E.phonotactics(E.fromModern('äsč')), false);
  assert.equal(E.phonotactics(E.fromModern('äsči')), true);
  assert.deepEqual(
    heads(
      raw('aschi', {
        ending: 'all',
      }),
    ),
    ['äsči'],
  );
});
test('rēdog の二系列と、語幹の g と q を区別する', () => {
  const r = raw('rēdog', {
    pos: 'noun',
    long: 'all',
  });
  assert.deepEqual(heads(r), ['rädoq', 'reqdoq'].sort());
  const a = r.groups.find((g) => g.head === 'rädoq').analyses[0].forms;
  const b = r.groups.find((g) => g.head === 'reqdoq').analyses[0].forms;
  assert.equal(a['斜格幹'], 'rädog-');
  assert.equal(a['属格単数'], 'rädogen');
  assert.equal(a['与格単数'], 'rädöger');
  assert.equal(b['斜格幹'], 'reqdog-');
  assert.equal(b['属格単数'], 'reqdogen');
  assert.equal(b['与格単数'], 'reqdöger');
});
test('§9.5 の曲用・形容詞の実例', () => {
  assert.deepEqual(
    one('faus', {
      pos: 'adjective',
    }).forms,
    {
      男性形: 'fos',
      女性形: 'fosa',
      中性形: 'fös',
    },
  );
  const cases = [
    ['pfēra', 'F', 'pära', 'päran', 'pärar', 'päras'],
    ['shūwa', 'F', 'šüva', 'šüvan', 'šüvar', 'šüvas'],
    ['krūkon', 'M', 'crücon', 'crüconen', 'crücöner', 'crücones'],
    ['juraj', 'M', 'jure', 'juren', 'jurer', 'jures'],
  ];
  for (const [a, gender, h, gen, dat, pl] of cases) {
    const x = one(a, {
      pos: 'noun',
      gender,
    });
    assert.equal(x.head, h);
    assert.equal(x.forms['属格単数'], gen);
    assert.equal(x.forms['与格単数'], dat);
    assert.equal(x.forms['主格複数'], pl);
  }
});
test('i 動詞の4通りを、3つの表記にまとめても失わない', () => {
  const r = raw('nifen', {
    pos: 'verb',
    i: 'all',
    grade: 'all',
  });
  assert.equal(r.complete, true);
  assert.equal(r.analysisCount, 4);
  assert.deepEqual(heads(r), ['nafen', 'nefen', 'nifen']);
  const a = r.groups.find((g) => g.head === 'nefen').analyses;
  assert.equal(a.length, 2);
  assert.deepEqual(a.map((a) => a.forms['現在3単']).sort(), ['nef', 'nif']);
});
test('現在とアオリストの語幹 g を屈折前まで保持する', () => {
  const r = raw('cangen', {
    pos: 'verb',
    grade: 'all',
  });
  const a = r.groups.find((g) => g.head === 'žangen').analyses.find((a) => a.className === 'a/e');
  assert.equal(a.forms['現在3単'], 'ženk');
  assert.equal(a.forms['アオリスト'], 'žank');
  assert.equal(a.forms['現在1単'], 'žengas');
  assert.equal(
    one('targ', {
      pos: 'noun',
    }).forms['属格単数'],
    'targen',
  );
  assert.equal(
    one('targ', {
      pos: 'noun',
    }).head,
    'tark',
  );
});
test('主格では短縮できない幹も、斜格のみ短縮する候補を保持する', () => {
  const r = raw('rēdog', {
    pos: 'noun',
    shortening: 'all',
  });
  const a = r.groups.find((g) => g.head === 'rädoq').analyses;
  assert.ok(a.some((a) => a.forms['斜格幹'] === 'rädg-' && a.forms['属格単数'] === 'rädgen'));
  assert.ok(a.some((a) => a.forms['斜格幹'] === 'rädog-'));
});
test('語末 sk は許容し、hl は最少の緩衝母音で修復する', () => {
  assert.equal(E.phonotactics(E.fromModern('misk')), true);
  assert.equal(E.phonotactics(E.fromModern('gohl')), false);
  assert.deepEqual(heads(raw('gohl')), ['gohel']);
  assert.deepEqual(heads(raw('misko')), ['misk']);
  assert.deepEqual(heads(raw('kustlo')), ['custlo']);
  assert.deepEqual(heads(E.generate('custlo', {}, data)), ['žustlo']);
});
test('w の保護環境、語末母音の由来、単音節を区別する', () => {
  assert.deepEqual(heads(raw('swūka')), ['swüca']);
  assert.deepEqual(heads(raw('pe')), ['pe']);
  assert.deepEqual(
    heads(
      raw('kome', {
        ending: 'all',
      }),
    ),
    ['com', 'come'],
  );
  assert.deepEqual(
    heads(
      raw('juraj', {
        ending: 'all',
      }),
    ),
    ['jure'],
  );
});
test('上限に達したら部分集合を全候補として返さない', () => {
  const r = E.generate('pīpipī', {
    limit: 1,
  });
  assert.equal(r.kind, 'blocked');
  assert.equal(r.complete, false);
  assert.equal(r.groups.length, 0);
});
test('未定義の入力は推測で埋めない', () => {
  for (const input of ['', '<script>alert(1)</script>', 'xeno', 'taʼa', 'a'.repeat(65)]) {
    const r = E.generate(input);
    assert.equal(r.complete, false);
    assert.equal(r.groups.length, 0);
  }
  assert.equal(
    E.generate('taha', {
      pos: 'verb',
    }).kind,
    'blocked',
  );
});
test('範囲内の規則的入力に対し、結果の欠落や例外終了がない', () => {
  for (const a of ['p', 't', 'k', 'w', 'š'])
    for (const b of ['a', 'i', 'ē', 'ū'])
      for (const c of ['m', 'g', 'r']) {
        const word = a + b + 'n' + c;
        const r = E.generate(word, {
          pos: 'noun',
          shortening: 'keep',
          limit: 1000,
        });
        assert.ok(Array.isArray(r.groups));
        assert.equal(
          r.analysisCount,
          r.groups.reduce((n, g) => n + g.analyses.length, 0),
        );
        for (const g of r.groups)
          for (const a of g.analyses)
            for (const [key, s] of Object.entries(a.forms))
              if (!key.includes('幹'))
                assert.equal(E.phonotactics(E.fromModern(s)), true, `${word}: ${key} ${s}`);
      }
});
test('HTML と辞書データが現在の資料・ソースに同期している', () => {
  for (const s of data.sources)
    assert.equal(
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join('..', s.path || s.file)))
        .digest('hex'),
      s.sha256,
      s.file,
    );
  const html = fs.readFileSync('../generator/index.html', 'utf8');
  assert.ok(!html.includes('/*__'));
  assert.ok(html.includes(fs.readFileSync('engine.js', 'utf8')));
  for (const source of ['proto.js', 'proto-paradigm.js', '../辞書/morphology.js'])
    assert.ok(html.includes(fs.readFileSync(source, 'utf8')), source);
  assert.ok(!/<script[^>]+src=/i.test(html));
});
