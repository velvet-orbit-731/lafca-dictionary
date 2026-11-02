/* 検索の索引と絞り込み。DOMや編集状態には依存しない。 */
(function (root) {
  'use strict';
  const T = root.LafcaTaxonomy || require('./taxonomy.js');
  const normalize = (text) => text.normalize('NFC').toLowerCase();
  const meaningSenses = T.lines;
  const formatMeaning = (value) => meaningSenses(value).join('\n');
  const meaningTerms = (value) =>
    value
      .split(/[,、]/)
      .map((term) => term.trim())
      .filter(Boolean);
  const fields = (values) =>
    values
      .filter(Boolean)
      .flatMap((value) => [value, ...value.split(/[、,;；\n／/]+/).map((term) => term.trim())]);

  function meaningFields(value) {
    const terms = meaningSenses(value).flatMap((sense) => [sense, ...meaningTerms(sense)]);
    return [...terms, ...fields([formatMeaning(value)])].flatMap((term) => {
      const plain = term.replace(/（[^（）]*）|\([^()]*\)/g, '').trim();
      return [term, plain, plain.replace(/^[〜～]+|[〜～]+$/g, '').trim()].filter(Boolean);
    });
  }

  function kindMatches(entry, kind) {
    return (
      !kind ||
      entry.kind === kind ||
      (['接頭辞', '接尾辞'].includes(kind) && T.tags(entry).includes(kind))
    );
  }

  function createIndex(entries) {
    return entries.map((entry) => {
      const tags = T.all(entry);
      const values = {
        head: [entry.head],
        trans: meaningFields(entry.meaning),
        forms: fields(
          entry.tables.flatMap((table) =>
            table.rows.flatMap((row) => row.cells.map((cell) => cell.value)),
          ),
        ),
        full: fields([...entry.protoForms, ...tags]),
      };
      const search = Object.fromEntries(
        Object.entries(values).map(([key, terms]) => [key, terms.map(normalize)]),
      );
      return {
        entry,
        tags,
        search,
      };
    });
  }

  function select(index, options = {}) {
    const {
      scope = 'both',
      mode = 'partial',
      includeInflections = true,
      id = '',
      kind = '',
      pos = '',
      numeral = '',
      gender = '',
      className = '',
      tag = '',
    } = options;
    const query = normalize((options.query || '').trim());
    const tokens = query.split(/\s+/).filter(Boolean);
    return index
      .filter(({ entry, tags, search }) => {
        if (
          (id && entry.id !== id) ||
          !kindMatches(entry, kind) ||
          (pos && entry.pos !== pos) ||
          (gender && entry.gender !== gender) ||
          (className && T.label(entry.class) !== className) ||
          (tag && !tags.includes(tag)) ||
          (numeral && !tags.includes(numeral === 'all' ? '数詞' : numeral))
        )
          return false;
        let values =
          scope === 'head'
            ? search.head
            : scope === 'trans'
              ? search.trans
              : [...search.head, ...search.trans];
        if (scope === 'full') values = [...values, ...search.full];
        if (scope !== 'trans' && includeInflections) values = [...values, ...search.forms];
        return (
          (mode === 'exact' && values.includes(query)) ||
          tokens.every((token) =>
            values.some((value) =>
              mode === 'exact'
                ? value === token
                : mode === 'prefix'
                  ? value.startsWith(token)
                  : value.includes(token),
            ),
          )
        );
      })
      .map((item) => item.entry);
  }

  const api = {
    normalize,
    meaningSenses,
    formatMeaning,
    kindMatches,
    createIndex,
    select,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.LafcaSearch = api;
})(globalThis);
