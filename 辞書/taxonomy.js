/* Shared taxonomy; grammatical labels belong to lexemes, functional labels to senses. */
(function (root) {
  'use strict';
  const config =
    typeof module !== 'undefined' ? require('./taxonomy.json') : root.LafcaTaxonomyConfig;
  const M = root.LafcaMorphology || require('./morphology.js');
  const unique = (xs) => [...new Set(xs.filter(Boolean))];
  const label = (t) => config.labels[t] || t;
  const lines = (meaning) =>
    meaning
      .split(/\r\n?|\n/)
      .map((s) =>
        s
          .split(/[,、]/)
          .map((x) => x.trim())
          .filter(Boolean)
          .join(', '),
      )
      .filter(Boolean);
  const groups = (e) =>
    config.senseGroups.filter(
      (g) =>
        (!g.pos.length || g.pos.includes(e.pos)) &&
        (e.kind !== '接辞' || g.name === '使用域・待遇'),
    );
  const allowed = (e) => groups(e).flatMap((g) => g.tags);

  function leaves(tags) {
    const expanded = (t) => (config.parents[t] || []).flatMap((x) => [x, ...expanded(x)]);
    tags = unique(tags.map(label));
    return tags.filter((t) => !expanded(t).some((x) => tags.includes(x)));
  }

  function senses(e) {
    return lines(e.meaning).map((meaning) => ({
      meaning,
      tags: leaves(
        (e.senseTags || [])
          .filter((s) => lines(s.meaning).join('\n') === meaning)
          .flatMap((s) => s.tags),
      ),
    }));
  }

  function normalizeSenses(e) {
    const permitted = allowed(e);
    const old = e.tags || [];
    // Legacy numerals have no sense metadata. Once metadata exists, it is authoritative.
    const defaults = Object.hasOwn(e, 'senseTags')
      ? []
      : [
          e.numeralType,
          ...old.filter((t) => permitted.includes(label(t))).map(label),
          ...(e.pos === '代名詞' && old.includes('疑問') && old.includes('数量')
            ? ['数量疑問']
            : []),
        ];
    return senses(e)
      .map((s) => ({
        ...s,
        tags: leaves([...s.tags, ...defaults].filter((t) => permitted.includes(t))),
      }))
      .filter((s) => s.tags.length);
  }

  function tags(e, extra = e.tags || []) {
    extra = unique(extra.map(label));
    const p = e.pos,
      f = M.map(e),
      gender = {
        M: '男性',
        F: '女性',
        N: '中性',
      };
    const result = [
      p,
      e.kind === '接辞'
        ? e.head.endsWith('-')
          ? '接頭辞'
          : '接尾辞'
        : e.kind === '慣用句'
          ? '慣用句'
          : '',
    ];
    if (p === '名詞')
      result.push(
        gender[e.gender],
        label(e.class),
        config.patterns[M.nounPattern(e, M.infer(e).settings)],
        {
          singular: '単数のみ',
          plural: '複数のみ',
        }[e.numberRestriction],
        extra.includes('人名') ? '人名' : '',
      );
    if (p === '動詞')
      result.push(e.class, ...['不規則活用', '無主語'].filter((t) => extra.includes(t)));
    if (p === '形容詞') {
      result.push(e.class);
      if (f['中性単数主格'])
        result.push(f['中性単数主格'] === e.head ? '中性同形' : '中性ウムラウト');
      const settings = M.infer(e).settings;
      if (
        extra.includes('女性語幹短縮') ||
        (settings.femaleStem &&
          !/[aeiouäöü]$/.test(e.head) &&
          settings.femaleStem.length < e.head.length)
      )
        result.push('女性語幹短縮');
    }
    return unique(result);
  }

  function normalize(e) {
    const senseTags = normalizeSenses(e),
      result = {
        ...e,
        tags: tags(e),
      };
    if (senseTags.length || Object.hasOwn(e, 'senseTags')) result.senseTags = senseTags;
    return result;
  }

  function all(e) {
    const set = new Set([...tags(e), ...senses(e).flatMap((s) => s.tags)]);
    if (!Object.hasOwn(e, 'senseTags') && e.numeralType) set.add(e.numeralType);
    let size;
    do {
      size = set.size;
      for (const [p, children] of Object.entries(config.parents))
        if (children.some((c) => set.has(c))) set.add(p);
    } while (size !== set.size);
    return [...set];
  }

  function validate(e) {
    if (!Object.hasOwn(e, 'senseTags')) return;
    const keys = lines(e.meaning),
      seen = new Set(),
      permitted = allowed(e);
    if (!Array.isArray(e.senseTags)) throw Error('語義の分類が不正です。');
    for (const s of e.senseTags) {
      if (
        !s ||
        Object.keys(s).sort().join(',') !== 'meaning,tags' ||
        typeof s.meaning !== 'string' ||
        !keys.includes(s.meaning) ||
        seen.has(s.meaning) ||
        !Array.isArray(s.tags) ||
        s.tags.some((t) => !permitted.includes(t)) ||
        new Set(s.tags).size !== s.tags.length
      )
        throw Error('語義と分類が一致しません。');
      if (s.tags.includes('可算') && s.tags.includes('不可算'))
        throw Error('同じ語義に可算と不可算は指定できません。');
      if (s.tags.includes('基数') && s.tags.includes('序数'))
        throw Error('同じ語義に基数と序数は指定できません。');
      seen.add(s.meaning);
    }
  }
  const api = {
    ...config,
    label,
    lines,
    groups,
    allowed,
    leaves,
    senses,
    normalizeSenses,
    tags,
    normalize,
    all,
    validate,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.LafcaTaxonomy = api;
})(globalThis);
