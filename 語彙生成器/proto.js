/* 有限な逆対応と順方向照合による祖語候補。辞書の祖語形とは別に扱う。 */
(function (root) {
  'use strict';
  const LONG = { ā: 'a', ē: 'e', ī: 'i', ō: 'o', ū: 'u' };
  const LAFCA = { ā: 'a', ē: 'ä', ī: 'i', ō: 'o', ū: 'ü', aw: 'o', ew: 'ü', aj: 'e', ej: 'i', oj: 'ö' };
  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'ə', ...Object.keys(LAFCA)]);
  const UML = { a: 'ä', o: 'ö', u: 'ü', aw: 'ö' };
  const LABEL = { lafca: 'ラフカ語', aldian: 'アルディア語' };
  const norm = (s) => s.normalize('NFC').trim().toLowerCase();
  const isV = (s) => VOWELS.has(s);
  const SCOPE = [
    '子音対応・長母音・二重母音・ə・ウムラウト・語末 g・語末短母音の脱落を逆にたどり、同じ規則で入力へ戻る候補を表示します。',
    '強勢位置は未指定。ə は後続音節に強勢があったこと、語末短母音の脱落は無強勢だったことを仮定します。',
    '任意の語中母音の復元・ʔ 消失後の縮約・緩衝音の除去・類推・借用・複合語の成立年代は、この音対応モデルの範囲外です。',
    '候補は未採用の再建案です。語の実在、語義、両言語での同語根性を確定せず、辞書へ自動登録しません。',
  ];

  function split(input, language) {
    const units = [], multi = language === 'lafca'
      ? ['pf'] : ['sch', 'sh', 'ch', 'pf', 'au', 'ao', 'ai', 'ei', 'oi'];
    for (let i = 0; i < input.length;) {
      let s = multi.find((s) => input.startsWith(s, i)) || input[i];
      // §9の既定の音節区切り：母音前の w/j は子音、それ以外の aw/ew/aj 等は二重母音。
      if (language === 'aldian' && /^(aw|ew|aj|ej|oj)/u.test(input.slice(i)) &&
          !/[aeiouāēīōūǖáóø]/u.test(input[i + 2] || '!')) s = input.slice(i, i + 2);
      units.push(s);
      i += s.length;
    }
    return units;
  }

  function alternatives(s, language, index, units) {
    let choices;
    if (language === 'lafca') {
      const vowels = { a: ['a', 'ā'], e: ['e', 'ə', 'aj'], i: ['i', 'ī', 'ej', 'ə'], o: ['o', 'ō', 'aw'],
        u: ['u'], ä: ['ē', 'a'], ö: ['oj', 'o', 'aw'], ü: ['ū', 'ew', 'u'] };
      const consonants = { c: ['k'], k: ['k', 'g'], q: ['ɣ', 'g'], ž: ['ts'], č: ['tʃ'],
        h: ['x'], v: ['w'], pf: ['pf', 'pw'] };
      choices = vowels[s] || consonants[s] || [s];
      if ((s === 'k' || s === 'q') && index !== units.length - 1) choices = choices.slice(0, 1);
    } else {
      const dip = { au: 'aw', ao: 'aw', aw: 'aw', ó: 'aw', ew: 'ew', ǖ: 'ew',
        ai: 'aj', aj: 'aj', á: 'aj', ei: 'ej', ej: 'ej', oi: 'oj', oj: 'oj', ø: 'oj' };
      const consonants = { c: 'ts', ch: 'tʃ', sch: 's tʃ', sh: 'š', h: 'x', 'ʼ': 'ʔ', "'": 'ʔ', v: 'w' };
      if (LONG[s]) choices = [s, LONG[s] + ' ɣ'];
      else if (dip[s]) choices = [dip[s]];
      else if (consonants[s]) choices = [consonants[s]];
      else if (s === 'p') choices = ['p', 'pw'];
      else if (s === 'i') choices = ['i', 'ə', ...(index === units.length - 1 ? ['ī'] : [])];
      else if (s === 'a' && index === units.length - 1) choices = ['a', 'ā'];
      else choices = [s];
    }
    return choices.map((value) => ({ tokens: value.split(' '),
      rule: `*${value.replaceAll(' ', '')} → ${s}（${LABEL[language]}、音の位置 ${index + 1}）` }));
  }

  // 音節核と複子音を区別した祖語トークンを受け取る。強勢・語尾脱落は候補ごとの条件。
  function forward(tokens, language, { lostEnding = false, spellingUnits = [], pos = 'auto', asStem = false, ablaut = false } = {}, validLafca = () => true) {
    let trace = [], ts = tokens.map((raw) => ({ raw, s: raw, vowel: isV(raw) }));
    const nuclei = ts.map((t, i) => t.vowel ? i : -1).filter((i) => i >= 0);
    if (!nuclei.length) return null;
    // ə は前強勢弱化の反映としてのみ候補にする。末音節の ə には後続強勢が置けない。
    if (tokens.includes('ə') && (!nuclei.some((i) => i > tokens.lastIndexOf('ə')) || tokens.filter((t) => t === 'ə').length > 1)) return null;
    if (language === 'aldian') {
      const units = [];
      const cons = { ts: 'c', 'tʃ': 'ch', š: 'sh', x: 'h', pw: 'p', 'ʔ': 'ʼ' };
      for (let i = 0; i < ts.length; i++) {
        const raw = ts[i].raw;
        if (ts[i + 1]?.raw === 'ɣ' && 'aeiou'.includes(raw) && raw.length === 1) {
          units.push(Object.keys(LONG).find((v) => LONG[v] === raw));
          trace.push(`*${raw}ɣ → ${units.at(-1)}（ɣ 消失・代償延長）`);
          i++;
        } else if (raw === 'ɣ') return null;
        else if (raw === 'w') {
          // v 表記には w の反映という追加条件を明示し、任意の環境では許さない。
          const prev = ts[i - 1], next = ts[i + 1];
          units.push(prev?.vowel && next?.vowel ? 'v/w' : 'w');
        } else units.push(cons[raw] || (raw === 'ə' ? 'i' : raw));
      }
      if (lostEnding) {
        if (!['i', 'u'].includes(tokens.at(-1)) || nuclei.length < 2) return null;
        units.pop();
        trace.push(`語末 *-${tokens.at(-1)} の脱落`);
      }
      // 中央語派の -ā 保持は現代表記 -a と対応。集合的 -ī > -i は語末だけの仮説。
      if (units.at(-1) === 'ā' && spellingUnits.at(-1) === 'a') units[units.length - 1] = 'a';
      if (units.at(-1) === 'ī' && spellingUnits.at(-1) === 'i') {
        units[units.length - 1] = 'i';
        trace.push('語末 -i を古い長 *-ī の反映とする仮説（再検討案 §6.5）');
      }
      const canonical = (s) => ({ au: 'aw', ao: 'aw', ó: 'aw', ai: 'aj', á: 'aj', ei: 'ej', oi: 'oj', ø: 'oj', ǖ: 'ew', "'": 'ʼ', sch: 'sch' }[s] || s);
      const target = spellingUnits.map(canonical).join('');
      let output = units.join('');
      // 同じ音価の綴りを照合し、表示には入力の綴りを保つ。
      if (output.includes('v/w')) {
        const expression = '^' + output.replaceAll('v/w', '[vw]') + '$';
        if (!new RegExp(expression, 'u').test(target)) return null;
        trace.push('母音間の *w の w/v 表記を許容（比較語の綴りに依存する仮定）');
      } else if (output !== target) return null;
      return { output: spellingUnits.join(''), trace: [...trace, '*ts/c、*tʃ/ch、*x/h 等の中央語派の対応を照合'] };
    }
    const cons = { ts: 'ž', 'tʃ': 'č', x: 'h', 'ɣ': 'q', pw: 'pf' };
    ts.forEach((t, i) => {
      t.s = cons[t.raw] || LAFCA[t.raw] || t.raw;
      if (t.raw === 'ə') {
        const adjacent = ['š', 'ts', 'tʃ'].some((s) => tokens[i - 1] === s || tokens[i + 1] === s);
        t.s = nuclei[0] !== i && adjacent ? 'i' : 'e';
      }
    });
    for (let n = 0; n < nuclei.length - 1; n++) {
      const i = nuclei[n], j = nuclei[n + 1];
      const weakI = ablaut && ts[j].raw === 'ə' && ts[j].s === 'i';
      if (UML[ts[i].raw] && (['i', 'ī'].includes(ts[j].raw) || weakI || ts[j - 1]?.raw === 'j')) {
        ts[i].s = UML[ts[i].raw];
        trace.push(`*${ts[i].raw} → ${ts[i].s}（後続 i/ī/j によるウムラウト）`);
      }
    }
    const changeW = () => ts.forEach((t, i) => {
      if (t.s !== 'w' || (i === 1 && ['s', 'š', 'g', 'k', 'h', 't', 'd'].includes(ts[0].s))) return;
      const before = ts[i - 1], after = ts[i + 1];
      if (!after || !after.vowel || 'eiäöü'.includes(after.s) || (before?.vowel && after.vowel)) t.s = 'v';
    });
    changeW();
    const canDrop = nuclei.length > 1 && ['i', 'u', 'e', 'o'].includes(tokens.at(-1));
    if (lostEnding && !canDrop) return null;
    if (lostEnding) {
      ts.pop();
      trace.push(`無強勢の語末 *-${tokens.at(-1)} を脱落（H5）`);
    } else if (canDrop && pos !== 'verb') {
      trace.push('語末短母音を保持する系列を仮定');
    }
    changeW();
    if (!asStem && ts.at(-1)?.s === 'g') {
      const prev = ts.at(-2);
      if (prev?.vowel) ts[ts.length - 1].s = 'q';
      else if (prev?.s === 'n') ts[ts.length - 1].s = 'k';
      else return null;
      trace.push('語末 *g の q/nk 化（文法 1.4）');
    }
    const output = ts.map((t, i) => t.s === 'k' && (asStem || i !== ts.length - 1) ? 'c' : t.s).join('');
    if (!asStem && !validLafca(output)) return null;
    return { output, trace: [...trace, '長母音・二重母音の反映と c/k・ž・č 等の綴字を照合'] };
  }

  function reconstruct(input, language = 'auto', options = {}, validLafca = () => true) {
    input = norm(input);
    const result = { input, status: 'candidate', candidates: [], complete: true, issues: [], scope: SCOPE,
      sources: ['ラフカ語文法 §1.3–1.4', '系統と設計ノート §2–4', '音変化再検討案 §2–3・§6・§9'] };
    const languages = language === 'auto' ? ['lafca', 'aldian'] : [language];
    const limit = Math.min(50000, Math.max(1, options.protoLimit || 12000));
    let visits = 0;
    try {
      for (const lang of languages) {
        const allowed = lang === 'lafca' ? /^[a-wzäöüšžč]+$/u : /^[a-pr-wzāēīōūǖáóøʼ']+$/u;
        if (!LABEL[lang] || !input || input.length > 64 || !allowed.test(input) || /[xy\s]/u.test(input)) continue;
        const units = split(input, lang);
        const choices = units.map((s, i) => alternatives(s, lang, i, units));
        // 不定形 -en は屈折語尾として保持し、語尾の長母音化・二重母音化を増やさない。
        const verb = options.pos === 'verb' && input.endsWith('en');
        if (verb) choices.splice(choices.length - 2, 2,
          [{ tokens: ['e'], rule: '不定形 *-en を保持' }], [{ tokens: ['n'], rule: '不定形 *-en を保持' }]);
        const endings = verb || /[aeiouäöüāēīōūǖáóø]$/u.test(input) ? [''] : lang === 'lafca' ? ['', 'i', 'u', 'e', 'o'] : ['', 'i', 'u'];
        function walk(i, tokens, trace) {
          if (++visits > limit) throw new Error('limit');
          if (i < choices.length) {
            for (const choice of choices[i]) walk(i + 1, [...tokens, ...choice.tokens], [...trace, choice.rule]);
            return;
          }
          for (const ending of endings) {
            if (++visits > limit) throw new Error('limit');
            const proto = [...tokens, ...(ending ? [ending] : [])];
            const settings = { lostEnding: !!ending, spellingUnits: units, pos: options.pos };
            const check = forward(proto, lang, settings, validLafca);
            if (!check || norm(check.output) !== input) continue;
            const form = '*' + tokens.join('') + (ending ? '-' + ending : '');
            result.candidates.push({ form, language: lang, input, tokens: proto, settings,
              trace: [...new Set([...trace, ...check.trace])], verifiedOutput: check.output });
          }
        }
        walk(0, [], []);
      }
    } catch (error) {
      if (error.message !== 'limit') throw error;
      result.candidates = [];
      result.complete = false;
      result.issues.push('祖語候補の分岐が計算上限に達したため、途中の候補を破棄しました。入力言語を指定するか、語を構成要素に分けて検索してください。');
    }
    if (result.complete && !result.candidates.length) {
      result.complete = false;
      result.issues.push('実装した音対応では入力に戻る祖語候補が見つかりません。綴り・入力言語を確認してください。縮約・類推・借用・複合語の形成には個別の検討が必要です。');
    }
    result.candidates.sort((a, b) => a.tokens.length - b.tokens.length || a.form.localeCompare(b.form));
    return result;
  }
  const api = { reconstruct, forward };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LafcaProto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
