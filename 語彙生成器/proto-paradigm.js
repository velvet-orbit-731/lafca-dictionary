/* 祖語候補から導いた語幹で登録済みの曲用・活用を検査する。実語形による上書きは禁止。 */
(function (root) {
  'use strict';
  const Proto = typeof module !== 'undefined' && module.exports ? require('./proto.js') : root.LafcaProto;
  const Morph = typeof module !== 'undefined' && module.exports ? require('../辞書/morphology.js') : root.LafcaMorphology;
  const norm = (s) => (s || '').normalize('NFC').trim().toLowerCase();
  const V = new Set(['a', 'e', 'i', 'o', 'u', 'ə', 'ā', 'ē', 'ī', 'ō', 'ū', 'aw', 'ew', 'aj', 'ej', 'oj']);
  const WEAK = { a: 'ə', e: 'i', o: 'u', aw: 'u', ew: 'u', aj: 'i' };
  const POS = { 名詞: 'noun', 動詞: 'verb', 形容詞: 'adjective' };
  const lastV = (tokens) => tokens.findLastIndex((t) => V.has(t));
  const replace = (tokens, i, value) => tokens.map((t, n) => n === i ? value : t);
  // 語尾の付く位置の語幹を求める。仮の e は検査用文脈であり、祖形に付け足して採用しない。
  function stem(tokens, ablaut = false) {
    return Proto.forward([...tokens, 'e'], 'lafca', { lostEnding: true, asStem: true, ablaut })?.output;
  }
  function umlautCheck(tokens, base, ablaut = false) {
    // 現代の a/o へ合流した旧長母音を、現代語形だけで短母音と同様に変化させない。
    const historical = Proto.forward([...tokens, 'i'], 'lafca', { lostEnding: true, asStem: true, ablaut })?.output;
    return { base, historical, modern: Morph.umlaut(base) };
  }
  function gradeVariants(tokens, direction) {
    const i = lastV(tokens);
    if (i < 0) return [];
    const source = tokens[i];
    const values = direction === 'weak' ? (WEAK[source] ? [WEAK[source]] : [])
      : Object.entries(WEAK).filter(([, weak]) => weak === source).map(([strong]) => strong);
    return values.map((value) => ({ tokens: replace(tokens, i, value),
      rule: `祖語の階梯：*${source} → *${value}（${direction === 'weak' ? '弱' : '強'}階梯、文法 2.2.4・2.4.3）` }));
  }

  function derive(candidate, entry, spec) {
    const tokens = candidate.tokens, p = spec.pos, type = spec.class;
    const shared = { impersonal: (entry.paradigmTags || []).includes('無主語'),
      gerundDeclension: entry.forms.some((f) => f.label.startsWith('動名詞単数')) };
    if (p === '動詞') {
      if (type === '母音幹' || !spec.head.endsWith('en') || tokens.slice(-2).join('') !== 'en')
        return { reason: '母音幹・補充形または不定形の歴史を個別に検討する必要があります。', models: [] };
      const root = tokens.slice(0, -2), strong = stem(root), i = lastV(root);
      if (!strong || i < 0) return { reason: '祖語候補から強語幹を導けません。', models: [] };
      const required = { 'a/e交替': ['a'], 'e/i交替': ['e', 'aj'], 'o/u交替': ['o', 'aw'] }[type];
      if (required && !required.includes(root[i]))
        return { reason: `${type} と祖語母音 *${root[i]} が両立しません。長母音は弱化しません。`, models: [] };
      if (!required && type !== '非交替')
        return { reason: '活用型が未指定または対応範囲外です。', models: [] };
      const variants = required ? gradeVariants(root, 'weak') : [{ tokens: root, rule: '辞書の非交替型に従い同じ語幹を使用' }];
      return { models: variants.flatMap((v) => {
        const weak = stem(v.tokens, !!required);
        return weak ? [{ settings: { ...shared, strongStem: strong, presentStem: weak },
          stems: { 強語幹: strong, 現在語幹: weak }, trace: [v.rule] }] : [];
      }), reason: '祖語の強弱階梯から登録された語幹を導けません。' };
    }
    if (p === '形容詞') {
      if (type !== '子音幹') return { reason: '母音幹形容詞の語幹再編は個別の検討が必要です。', models: [] };
      if (candidate.settings.lostEnding && tokens.at(-1) === 'i')
        return { reason: '男性見出しを中性の *-i 形として再建することはできません。', models: [] };
      const s = Proto.forward(tokens, 'lafca', { ...candidate.settings, asStem: true })?.output;
      return { models: s ? [{ settings: { adjectiveStem: s }, stems: { 形容詞語幹: s },
        umlaut: umlautCheck(candidate.settings.lostEnding ? tokens.slice(0, -1) : tokens, s),
        trace: ['祖語候補から子音幹を導出し、現代の性・格一致と比較形を生成（文法 1.4・2.3）'] }] : [],
      reason: '形容詞の語幹を導けません。' };
    }
    if (p !== '名詞') return { reason: 'この品詞の屈折は祖語候補の検査に未対応です。', models: [] };
    const pattern = Morph.nounPattern(spec, {});
    if (!['consonant', 'a', 'o', 'short', 'glide'].includes(pattern))
      return { reason: '複数専用・特殊な曲用の歴史は個別に検討する必要があります。', models: [] };
    if (!['固定型', 'Ⅰ型', 'Ⅱ型'].includes(type) || !['M', 'F', 'N'].includes(spec.gender))
      return { reason: '性・曲用型が未指定または対応範囲外です。', models: [] };
    const ending = candidate.settings.lostEnding ? tokens.at(-1) : '';
    if (pattern === 'consonant' && ((spec.gender === 'N' && ending !== 'i') || (spec.gender !== 'N' && ending === 'i')))
      return { reason: '復元した *-i 幹と辞書の性・語幹類が両立しません。', models: [] };
    if (pattern === 'a' && tokens.at(-1) !== 'ā')
      return { reason: '女性 -a 幹には長 *-ā の保持が必要です。', models: [] };
    if (pattern === 'o' && tokens.at(-1) !== 'aw')
      return { reason: '男性 -o 幹の *-aw 系列に一致しません。', models: [] };
    if (pattern === 'short' && spec.gender === 'N' && spec.head.endsWith('i') && tokens.at(-1) !== 'ī')
      return { reason: '語末 -i を保持する中性の長 *-ī 幹に一致しません。', models: [] };
    const rootTokens = ending || ['a', 'o', 'short'].includes(pattern) ? tokens.slice(0, -1) : tokens;
    if (type === '固定型') {
      // 消失 -i によるウムラウトは語幹に保持。長母音と短母音の現代語での合流を保つ。
      const s = pattern === 'consonant' || pattern === 'glide'
        ? Proto.forward(tokens, 'lafca', { ...candidate.settings, asStem: true })?.output : stem(rootTokens);
      return { models: s ? [{ settings: { nounPattern: pattern, obliqueStem: s }, stems: { 斜格語幹: s },
        ...(['consonant', 'glide'].includes(pattern) ? { umlaut: umlautCheck(rootTokens, s) } : {}),
        trace: [`性 ${spec.gender}・${type}・${pattern} 型を保持し、祖語候補から斜格語幹を導出`] }] : [], reason: '斜格語幹を導けません。' };
    }
    if (spec.gender === 'N') return { reason: '中性の交替型の歴史は個別の検討が必要です。', models: [] };
    return { models: gradeVariants(rootTokens, type === 'Ⅰ型' ? 'strong' : 'weak').flatMap((v) => {
      const s = stem(v.tokens, type === 'Ⅱ型');
      return s ? [{ settings: { nounPattern: pattern, obliqueStem: s }, stems: { 斜格語幹: s },
        ...(['consonant', 'glide'].includes(pattern) ? { umlaut: umlautCheck(v.tokens, s, type === 'Ⅱ型') } : {}),
        trace: [v.rule] }] : [];
    }), reason: `${type} の斜格語幹を導く強弱階梯が祖語候補にありません。` };
  }

  function reconstruct(entry, options = {}, validLafca) {
    // 入力がどちらの言語でも、同じ項目の見出し・曲用活用を根拠にする。
    const spec = { ...entry.paradigm, head: norm(entry.head) };
    const result = Proto.reconstruct(entry.head, 'lafca', { ...options, pos: POS[spec.pos] || 'other' }, validLafca);
    result.scope = [...result.scope,
      '登録語の候補はラフカ語の語幹から屈折形を生成し、保存された全語形と照合します。実語形による上書きや例外の自動追加は行いません。',
      'この検査は現代の曲用・活用との整合性を確認するもので、全屈折語尾の歴史的な唯一の起源を証明するものではありません。'];
    result.sources = [...result.sources, 'ラフカ語文法 §2.2.4–2.2.7・§2.3・§2.4.2–2.4.9', ...(entry.source?.url ? [entry.source.url] : [])];
    const initial = result.candidates.length, rejected = new Map(), accepted = [];
    const reject = (reason) => rejected.set(reason, (rejected.get(reason) || 0) + 1);
    result.paradigm = { entryId: entry.id, head: entry.head, pos: spec.pos, gender: spec.gender, class: spec.class,
      registeredCount: entry.forms.length, testedCount: initial, acceptedCount: 0, rejected: [] };
    // 屈折語で表・主要形が欠けている場合に、一致したと判定しない。
    const values = Object.fromEntries(entry.forms.map((f) => [f.label, f.value]));
    const required = spec.pos === '名詞' ? [spec.numberRestriction === 'plural' ? '複数属格' : '単数属格']
      : spec.pos === '動詞' ? ['不定形', '現在3単数', 'アオリスト']
      : spec.pos === '形容詞' ? ['女性単数主格', '男性単数属格'] : [];
    for (const candidate of result.candidates) {
      if (!entry.paradigm) { reject('曲用・活用の分類情報がありません。'); continue; }
      if (required.some((label) => !values[label])) { reject('検査に必要な登録語形が不足しています。'); continue; }
      if (!required.length && !entry.forms.length) {
        accepted.push({ ...candidate, morphology: { status: 'not-applicable', checkedForms: [],
          stems: {}, trace: ['この項目には曲用・活用表がありません。音対応だけの再建候補です。'] } });
        continue;
      }
      const derived = derive(candidate, entry, spec);
      if (!derived.models.length) { reject(derived.reason); continue; }
      let matched = false;
      const failures = [];
      for (const model of derived.models) {
        if (model.umlaut && entry.forms.some((f) => spec.pos === '形容詞'
          ? /^(中性単数|男性.*与格|中性複数与格|文語最上級)/u.test(f.label) : f.label.includes('与格'))) {
          if (model.umlaut.historical !== model.umlaut.modern) {
            failures.push(`ウムラウト幹：祖語候補からは ${model.umlaut.historical || '導出不可'}、曲用・一致には ${model.umlaut.modern} が必要です。旧長母音の保護を無視できません。`);
            continue;
          }
          model.trace.push(`歴史的な i によるウムラウト幹 ${model.umlaut.historical}- も照合（旧長母音は保護）`);
        }
        let predicted;
        try {
          // 第3引数（overrides）は使わない。登録語形を予測値として流し込まない。
          predicted = Morph.forms({ tables: Morph.generate(spec, model.settings) });
        } catch {
          failures.push('祖語候補から現代の屈折表を生成できません。');
          continue;
        }
        const byLabel = new Map(predicted.map((f) => [f.label, norm(f.value)]));
        const mismatch = entry.forms.find((f) => !byLabel.has(f.label) || byLabel.get(f.label) !== norm(f.value));
        if (mismatch) {
          failures.push(`${mismatch.label}：候補からは ${byLabel.get(mismatch.label) || '生成未対応'}、登録形は ${mismatch.value}`);
          continue;
        }
        matched = true;
        accepted.push({ ...candidate, morphology: { status: 'compatible', entryId: entry.id,
          stems: model.stems, settings: model.settings, trace: model.trace,
          checkedForms: entry.forms.map((f) => ({ label: f.label, registered: f.value, predicted: byLabel.get(f.label) })) } });
      }
      if (!matched) reject(failures[0] || derived.reason);
    }
    result.candidates = accepted;
    result.paradigm.acceptedCount = accepted.length;
    result.paradigm.rejected = [...rejected].map(([reason, count]) => ({ reason, count }));
    if (!accepted.length) {
      result.complete = false;
      result.status = 'pending';
      result.issues.push('登録された曲用・活用と両立する祖語候補を確認できないため保留します。辞書の語形は変更しません。');
    }
    return result;
  }
  const api = { reconstruct };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LafcaProtoParadigm = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
