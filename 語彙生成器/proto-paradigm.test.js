'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
const P = require('./proto-paradigm.js');
const data = require('./data.json');
const entries = [...data.entries, ...data.excluded];
const entry = (head) => entries.find((e) => e.head === head);
function result(head, input = head, language = 'lafca', options = {}) {
  return E.generate(input, { language, ...options }, data).groups.flatMap((g) => g.analyses)
    .find((e) => e.id === entry(head).id).reconstruction;
}
const forms = (r) => r.candidates.map((c) => c.form);

test('a/e 活用は長母音を排除し、不定形から過去分詞まで検査する', () => {
  const r = result('bannen');
  assert.deepEqual(forms(r), ['*bannen']);
  assert.deepEqual(r.candidates[0].morphology.stems, { 強語幹: 'bann', 現在語幹: 'benn' });
  assert.equal(r.candidates[0].morphology.checkedForms.length, 14);
  assert.ok(r.candidates[0].morphology.checkedForms.some((f) => f.label === '過去分詞' && f.predicted === 'dibennt'));
  assert.match(r.paradigm.rejected.map((v) => v.reason).join(''), /長母音/);
  assert.deepEqual(result('bannen', 'bannen', 'aldian', { pos: 'noun', gender: 'N', grade: 'fixed' }), r,
    '検索言語や未知語用条件で登録語の活用制約を回避しない');
});

test('語末 q の祖語 g/ɣ を斜格と性一致で区別する', () => {
  const r = result('buq');
  assert.ok(forms(r).includes('*bug'));
  assert.ok(r.candidates.every((c) => c.tokens.includes('g') && !c.tokens.includes('ɣ')));
  assert.ok(r.candidates.every((c) => c.morphology.checkedForms.length === 34));
  const checked = r.candidates[0].morphology.checkedForms;
  assert.equal(checked.find((f) => f.label === '女性単数主格').predicted, 'buga');
  assert.equal(checked.find((f) => f.label === '中性単数主格').predicted, 'büq');
  assert.deepEqual(result('buq', 'bug', 'aldian'), r);
  const singular = result('bisviq');
  assert.ok(singular.candidates.length);
  assert.ok(singular.candidates.every((c) => c.morphology.stems.斜格語幹 === 'bisvig'));
  assert.ok(singular.candidates.every((c) => c.morphology.checkedForms.length === 5 && c.morphology.checkedForms.every((f) => !f.label.includes('複数'))));
});

test('現代語で合流した長母音も歴史的なウムラウトと照合する', () => {
  const r = result('bod');
  assert.ok(forms(r).includes('*bod') && forms(r).includes('*bawd'));
  assert.ok(!r.candidates.some((c) => c.tokens.includes('ō')));
  assert.ok(r.candidates.every((c) => !c.settings.lostEnding || c.tokens.at(-1) !== 'i'));
  assert.match(r.paradigm.rejected.map((v) => v.reason).join(''), /旧長母音/);
});

test('性・語幹類・名詞の強弱階梯を保持し、同形の異なる歴史を残す', () => {
  const neuter = result('bänn');
  assert.ok(neuter.candidates.length);
  assert.ok(neuter.candidates.every((c) => c.settings.lostEnding && c.tokens.at(-1) === 'i'));
  const feminine = result('davara');
  assert.deepEqual(new Set(forms(feminine)), new Set(['*dawarā', '*dāwarā']));
  assert.ok(feminine.candidates.every((c) => c.morphology.stems.斜格語幹 === 'daver'));
  const conditional = result('habera');
  assert.ok(conditional.candidates.length);
  assert.ok(conditional.candidates.every((c) => c.morphology.stems.斜格語幹 === 'häbir' && c.tokens[1] === 'a'));
  const weakNominative = result('aralun').candidates.filter((c) => c.form === '*aralun');
  assert.equal(weakNominative.length, 2);
  assert.notDeepEqual(weakNominative[0].morphology.trace, weakNominative[1].morphology.trace);
  const ou = result('japfož');
  assert.ok(ou.candidates.length);
  assert.ok(ou.candidates.every((c) => c.morphology.stems.斜格語幹 === 'japfuž' && !c.tokens.includes('ō')));
});

test('e/i 交替と子音群の緩衝音・過去分詞も照合する', () => {
  assert.deepEqual(new Set(forms(result('žegen'))), new Set(['*tsegen', '*tsajgen']));
  const r = result('bisčlen');
  assert.ok(r.candidates.length);
  for (const c of r.candidates) {
    const checked = c.morphology.checkedForms;
    assert.equal(checked.find((f) => f.label === '現在3単数').predicted, 'bisčel');
    assert.equal(checked.find((f) => f.label === '過去分詞').predicted, 'dibisčelt');
  }
});

test('一語形でも不一致なら例外上書きせず保留し、未対応の表も一致としない', () => {
  for (const mutate of [
    (e) => { e.forms.find((f) => f.label === '過去分詞').value = 'dibannt'; },
    (e) => { e.forms.push({ label: '個別の未定義形', value: 'benn' }); },
    (e) => { e.forms.push({ label: '現在1単数', value: 'bannas' }); },
    (e) => { e.forms = e.forms.filter((f) => f.label !== 'アオリスト'); },
    (e) => { delete e.paradigm; },
  ]) {
    const e = structuredClone(entry('bannen'));
    mutate(e);
    const before = JSON.stringify(e), r = P.reconstruct(e);
    assert.equal(r.status, 'pending');
    assert.equal(r.complete, false);
    assert.deepEqual(r.candidates, []);
    assert.ok(r.paradigm.rejected.length);
    assert.equal(JSON.stringify(e), before);
  }
  const vowel = result('lämo');
  assert.equal(vowel.status, 'pending');
  assert.match(vowel.paradigm.rejected.map((v) => v.reason).join(''), /母音幹/);
  assert.deepEqual(result('bannen', 'bannen', 'lafca', { protoLimit: 1 }).candidates, []);
});

test('不変化語・未知語に曲用検証済みの表示を付けず、登録祖語を保持する', () => {
  const plain = entries.find((e) => !e.protoForms.length && e.paradigm.pos === '接続詞' && !e.forms.length);
  const r = P.reconstruct(plain);
  assert.ok(r.candidates.length);
  assert.ok(r.candidates.every((c) => c.morphology.status === 'not-applicable' && !c.morphology.checkedForms.length));
  const unknown = E.generate('zamar', { language: 'lafca' }, { entries: [], excluded: [] });
  assert.ok(unknown.reconstruction.candidates.every((c) => !c.morphology));
  const known = E.generate('jure', { language: 'lafca' }, data).groups[0].analyses[0];
  assert.deepEqual(known.protoForms, ['*juraj']);
  assert.equal(known.reconstruction, undefined);
});

test('正本の祖語未登録項目全件で、採用候補の全登録語形が一致しデータを変更しない', () => {
  const before = JSON.stringify(data);
  let compatible = 0, pending = 0;
  for (const e of entries.filter((e) => !e.protoForms.length)) {
    const r = P.reconstruct(e, {}, (s) => E.phonotactics(E.fromModern(s)));
    if (!r.candidates.length) {
      assert.equal(r.status, 'pending', e.head);
      pending++;
    }
    for (const c of r.candidates) {
      if (c.morphology.status !== 'compatible') {
        assert.equal(e.forms.length, 0, e.head);
        continue;
      }
      compatible++;
      assert.equal(c.morphology.checkedForms.length, e.forms.length, e.head);
      assert.ok(e.forms.length, e.head);
      for (const f of c.morphology.checkedForms) assert.equal(f.predicted, E.norm(f.registered), `${e.head}: ${f.label}`);
      assert.equal(E.forwardProto(c.tokens, 'lafca', c.settings)?.output, E.norm(e.head), e.head);
    }
  }
  assert.ok(compatible > 0 && pending > 0);
  assert.equal(JSON.stringify(data), before);
});
