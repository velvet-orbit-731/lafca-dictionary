'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
const data = require('./data.json');
const forms = (input, language, options) => E.reconstruct(input, language, options).candidates.map((c) => c.form);

test('中央語派の長母音保持とɣ消失の両方を再建する', () => {
  assert.deepEqual(new Set(forms('tā', 'aldian')), new Set(['*tā', '*taɣ']));
  for (const form of ['*rēdog', '*reɣdog']) assert.ok(forms('rēdog', 'aldian').includes(form));
  assert.ok(forms('dēa', 'aldian').includes('*deɣā'));
});
test('東語派のウムラウト・語末母音脱落・g/q/kを条件順に照合する', () => {
  for (const [word, form] of [['fäq', '*fag-i'], ['žänk', '*tsang-i'], ['fös', '*faws-i'],
    ['capič', '*kāpitʃ'], ['čeq', '*tʃeɣ'], ['jure', '*juraj'], ['tino', '*tinaw'], ['cavev', '*kawew-i']])
    assert.ok(forms(word, 'lafca').includes(form), `${word}: ${form}`);
  assert.ok(!forms('fäq', 'lafca').includes('*fag'), '引き金のない短 a をウムラウトしない');
  assert.ok(!forms('capič', 'lafca').includes('*kapitʃ'), '短 a + i は ä となるため排除');
  assert.ok(!forms('taq', 'lafca').includes('*tag-i'), '短 a + 消失 i もウムラウトを引き起こす');
});
test('弱化əと語頭子音群のw保持を照合する', () => {
  assert.ok(forms('žuser', 'lafca').includes('*tsusər-u'));
  assert.ok(forms('bidiš', 'lafca').includes('*bidəš-u'));
  assert.ok(forms('swet', 'lafca').includes('*swet'));
  assert.ok(!forms('sve', 'lafca').length, '語頭 sw の w を v にしない');
});
test('不定形を指定した場合は-enを保持し、脱落語尾を追加しない', () => {
  const result = E.reconstruct('nifen', 'lafca', { pos: 'verb' });
  assert.ok(result.candidates.length);
  assert.ok(result.candidates.every((c) => c.form.endsWith('en') && !c.settings.lostEnding));
});
test('登録祖語を保持し、未登録項目と未知語の両方に祖語候補を追加する', () => {
  const before = JSON.stringify(data);
  const known = E.generate('jure', {}, data).groups[0].analyses[0];
  assert.deepEqual(known.protoForms, ['*juraj']);
  assert.equal(known.reconstruction, undefined);
  const missing = E.generate('hlenqorn', { language: 'lafca' }, data).groups[0].analyses[0];
  assert.deepEqual(missing.protoForms, []);
  assert.ok(missing.reconstruction.candidates.length);
  const unknown = E.generate('zamar', { language: 'lafca' }, { entries: [], excluded: [] });
  assert.equal(unknown.kind, 'reconstructed');
  assert.ok(unknown.reconstruction.candidates.some((c) => c.form === '*zamar'));
  const aldian = E.generate('rēdog', { language: 'aldian' }, data);
  assert.ok(aldian.reconstruction.candidates.some((c) => c.form === '*reɣdog'));
  assert.equal(JSON.stringify(data), before, '正本由来のデータを再建候補で書き換えない');
});
test('関連形・非同源は入力形との共通祖形として再建しない', () => {
  const original = data.entries.find((e) => e.head === 'jure');
  const fixture = { entries: [{ ...original, protoForms: [], aliases: [{ form: 'testroot', relation: '語根参照' }] }], excluded: [] };
  const analysis = E.generate('testroot', { language: 'aldian' }, fixture).groups[0].analyses[0];
  assert.equal(analysis.reconstruction.input, 'jure');
  assert.ok(analysis.reconstruction.candidates.every((c) => c.language === 'lafca'));
  assert.ok(!E.lookup('awenaklohac', data, 'aldian').some((e) => e.head === 'hlenqorn'));
});
test('自動判定は両言語の解釈を保持し、全候補を順方向で入力と照合する', () => {
  assert.deepEqual(new Set(E.reconstruct('zamar').candidates.map((c) => c.language)), new Set(['lafca', 'aldian']));
  for (const [word, lang] of [['rēdog', 'aldian'], ['fäq', 'lafca'], ['cavev', 'lafca'],
    ['bidiš', 'lafca'], ['kōri', 'aldian'], ['shwit', 'aldian'], ['zamar', 'auto']]) {
    const result = E.reconstruct(word, lang);
    assert.ok(result.candidates.length, word);
    for (const c of result.candidates) {
      assert.equal(E.forwardProto(c.tokens, c.language, c.settings)?.output, word);
      assert.ok(c.trace.length && c.form.startsWith('*'));
    }
  }
});
test('無効入力と上限を明示し、列挙の途中集合を表示しない', () => {
  for (const word of ['', '<img src=x>', 'a b', 'a'.repeat(65), 'xy'])
    assert.deepEqual(E.reconstruct(word).candidates, []);
  const result = E.reconstruct('zamar', 'auto', { protoLimit: 2 });
  assert.equal(result.complete, false);
  assert.deepEqual(result.candidates, []);
  assert.match(result.issues.join(''), /上限/);
  assert.deepEqual(forms('fäq', 'lafca'), forms('FÄQ'.normalize('NFD'), 'lafca'));
});
