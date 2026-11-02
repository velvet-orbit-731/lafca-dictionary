'use strict';
const $ = (id) => document.getElementById(id);
const T = globalThis.LafcaTaxonomy;
const PAGE_SIZE = 24;
DATA.entries = DATA.entries.map(T.normalize);
let page = 0,
  tag = '';
const Search = globalThis.LafcaSearch;
const { normalize, meaningSenses, formatMeaning, kindMatches } = Search;
const makeIndex = () => Search.createIndex(DATA.entries);
let index = makeIndex(),
  order = index;

function refreshIndex() {
  index = makeIndex();
  order = index;
  $('stat').textContent = DATA.entries.length.toLocaleString() + ' 項目';
  syncFilters();
  render();
}

function node(name, text, cls) {
  const el = document.createElement(name);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

function options(values) {
  return [...new Set(values.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .map((value) => {
      const option = node('option', value);
      option.value = value;
      return option;
    });
}
$('pos').append(
  ...DATA.partsOfSpeech.map((value) => {
    const option = node('option', value);
    option.value = value;
    return option;
  }),
);

function syncTagFilter() {
  const entries = DATA.entries.filter(
    (e) => kindMatches(e, $('kind').value) && (!$('pos').value || e.pos === $('pos').value),
  );
  const present = new Set(entries.flatMap(T.all));
  const all = node('option', '指定なし');
  all.value = '';
  const select = $('tag-filter');
  select.replaceChildren(all);
  const used = new Set();
  const groups = [
    {
      name: '文法',
      tags: [...present].filter(
        (t) => !T.senseGroups.some((g) => g.tags.includes(t)) && !Object.hasOwn(T.parents, t),
      ),
    },
    {
      name: '分類全体',
      tags: Object.keys(T.parents),
    },
    ...T.senseGroups,
  ];
  for (const g of groups) {
    const group = node('optgroup');
    group.label = g.name;
    for (const t of g.tags)
      if (present.has(t) && !used.has(t)) {
        used.add(t);
        const o = node('option', t);
        o.value = t;
        group.append(o);
      }
    if (group.children.length) select.append(group);
  }
  if (!present.has(tag)) tag = '';
  select.value = tag;
}

function syncFilters() {
  const kind = $('kind').value;
  const hasPos = !['接辞', '接頭辞', '接尾辞'].includes(kind);
  $('pos-filter').hidden = !hasPos;
  $('pos').disabled = !hasPos;
  for (const option of $('pos').options) {
    option.disabled = Boolean(
      option.value &&
        kind &&
        !DATA.entries.some((e) => kindMatches(e, kind) && e.pos === option.value),
    );
  }
  if (!hasPos || $('pos').selectedOptions[0]?.disabled) $('pos').value = '';
  const pos = $('pos').value;
  const hasNumeral =
    !['接辞', '接頭辞', '接尾辞'].includes(kind) &&
    kind !== '慣用句' &&
    ['', '名詞', '形容詞', '連体詞'].includes(pos);
  $('numeral-filter').hidden = !hasNumeral;
  $('numeral').disabled = !hasNumeral;
  if (!hasNumeral) $('numeral').value = '';
  const noun = pos === '名詞';
  $('gender-filter').hidden = !noun;
  $('gender').disabled = !noun;
  if (!noun) $('gender').value = '';
  const classes = ['名詞', '動詞', '形容詞'].includes(pos)
    ? DATA.entries
        .filter((e) => e.pos === pos && kindMatches(e, kind))
        .map((e) => T.label(e.class))
        .filter(Boolean)
    : [];
  const selected = $('class').value;
  const all = node('option', 'すべて');
  all.value = '';
  $('class').replaceChildren(all, ...options(classes));
  $('class').value = classes.includes(selected) ? selected : '';
  $('class-filter').firstChild.textContent =
    pos === '名詞' ? '交替型 ' : pos === '動詞' ? '活用型 ' : '語幹 ';
  $('class-filter').hidden = !classes.length;
  $('class').disabled = !classes.length;
  syncTagFilter();
}
$('stat').textContent = DATA.entries.length.toLocaleString() + ' 項目';

function clearHash() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function reset() {
  HTMLFormElement.prototype.reset.call($('search-form'));
  syncFilters();
  order = index;
  tag = '';
  page = 0;
  clearHash();
}

function chooseTag(value, sourcePos = '') {
  const grammatical = [
    '男性',
    '女性',
    '中性',
    '固定型',
    'Ⅰ型',
    'Ⅱ型',
    '個別交替型',
    ...Object.values(T.patterns),
    '単数のみ',
    '複数のみ',
    '人名',
  ].includes(value)
    ? '名詞'
    : ['不規則活用', '無主語', '交替', 'a/e交替', 'e/i交替', 'o/u交替', '非交替'].includes(value)
      ? '動詞'
      : ['中性ウムラウト', '中性同形', '女性語幹短縮', '子音幹'].includes(value)
        ? '形容詞'
        : value === '母音幹'
          ? sourcePos
          : '';
  $('pos').value = DATA.partsOfSpeech.includes(value) ? value : grammatical;
  $('kind').value = ['接辞', '接頭辞', '接尾辞', '慣用句'].includes(value) ? value : '';
  $('numeral').value = ['基数', '序数'].includes(value) ? value : value === '数詞' ? 'all' : '';
  $('gender').value = '';
  $('class').value = '';
  tag = DATA.partsOfSpeech.includes(value) || $('kind').value || $('numeral').value ? '' : value;
  syncFilters();
  page = 0;
  clearHash();
  render();
}

function tagButton(t, pos = '') {
  const b = node('button', t, 'tag' + (t === pos ? ' pos' : ''));
  b.type = 'button';
  b.title = t + 'で絞り込む';
  b.addEventListener('click', () => chooseTag(t, pos));
  return b;
}

function tableView(table) {
  const wrapper = node('div', undefined, 'table-wrap'),
    el = node('table'),
    head = node('thead'),
    hr = node('tr');
  el.setAttribute('aria-label', table.title);
  hr.append(node('th', '区分'));
  table.columns.forEach((c) => {
    const th = node('th', c);
    th.scope = 'col';
    hr.append(th);
  });
  head.append(hr);
  el.append(head);
  const body = node('tbody');
  for (const row of table.rows) {
    const tr = node('tr'),
      th = node('th', row.label);
    th.scope = 'row';
    tr.append(th);
    for (const f of row.cells) {
      const td = node('td');
      td.append(node('span', f.value, 'cell-value'));
      tr.append(td);
    }
    body.append(tr);
  }
  el.append(body);
  wrapper.append(el);
  return wrapper;
}

function meaningView(e) {
  const senses = T.senses(e),
    multi = senses.length > 1;
  const list = node(multi ? 'ol' : 'p', undefined, multi ? 'meaning senses' : 'meaning');
  senses.forEach((s) => {
    const row = multi ? node('li') : list;
    row.append(node('span', s.meaning, 'sense-meaning'));
    if (s.tags.length) {
      const tags = node('span', undefined, 'sense-tags');
      s.tags.forEach((t) => tags.append(tagButton(t)));
      row.append(tags);
    }
    if (multi) list.append(row);
  });
  return list;
}

function entryView(e, open = false) {
  const card = node('article', undefined, 'entry');
  card.id = 'entry-' + e.id;
  const heading = node('div', undefined, 'entry-head');
  heading.append(node('h2', e.head));
  if (e.tables.length) {
    const toggle = node('button', e.pos === '動詞' ? '活用' : '曲用', 'conjbtn');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-controls', 'forms-' + e.id);
    const details = node('div', undefined, 'forms');
    details.id = 'forms-' + e.id;
    details.hidden = !open;
    toggle.addEventListener('click', () => {
      details.hidden = !details.hidden;
      toggle.setAttribute('aria-expanded', String(!details.hidden));
    });
    for (const table of e.tables) details.append(node('h3', table.title), tableView(table));
    heading.append(toggle);
    card.append(details);
  }
  card.prepend(heading);
  const tags = node('div', undefined, 'tags');
  T.tags(e).forEach((t) => tags.append(tagButton(t, e.pos)));
  const meaning = meaningView(e);
  heading.after(tags, meaning);
  if (e.protoForms.length) meaning.after(node('p', '祖語型：' + e.protoForms.join(' / '), 'etym'));
  if (e.relations.length) {
    const relations = node('div', undefined, 'relations');
    e.relations.forEach((r) => {
      relations.append(node('span', r.title));
      const b = node('button', r.head, 'relation');
      b.type = 'button';
      b.addEventListener('click', () => showEntry(r.id));
      relations.append(b);
    });
    card.append(relations);
  }
  if (window.lafcaEditControls) card.append(window.lafcaEditControls(e));
  return card;
}

function showEntry(id) {
  reset();
  location.hash = 'word=' + id;
  render();
  window.scrollTo({
    top: 0,
    behavior: 'smooth',
  });
}

function renderPager(id, pages) {
  const nav = $(id);
  nav.replaceChildren();
  nav.hidden = pages <= 1;
  if (nav.hidden) return;
  const current = page + 1;
  const numbers = new Set([1, Math.ceil(pages / 2), pages]);
  const start = Math.max(1, Math.min(current - 1, pages - 2));
  for (let n = start; n <= Math.min(pages, start + 2); n++) numbers.add(n);
  if (pages <= 7) for (let n = 1; n <= pages; n++) numbers.add(n);

  function button(text, target, disabled = false) {
    const b = node('button', text);
    b.type = 'button';
    b.dataset.page = target - 1;
    b.disabled = disabled;
    if (typeof text === 'number') {
      b.setAttribute('aria-label', text + 'ページ');
      if (target === current) b.setAttribute('aria-current', 'page');
    }
    nav.append(b);
  }
  button('前へ', current - 1, current === 1);
  let previous = 0;
  for (const n of [...numbers].sort((a, b) => a - b)) {
    if (n - previous === 2) button(previous + 1, previous + 1);
    else if (n - previous > 2) {
      const gap = node('span', '…', 'gap');
      gap.setAttribute('aria-hidden', 'true');
      nav.append(gap);
    }
    button(n, n);
    previous = n;
  }
  button('次へ', current + 1, current === pages);
}

function render() {
  const scope = document.querySelector('input[name="scope"]:checked').value;
  $('useinfl').disabled = scope === 'trans';
  const id = location.hash.startsWith('#word=') ? location.hash.slice(6) : '';
  const matched = Search.select(order, {
    query: $('query').value,
    scope,
    mode: document.querySelector('input[name="mode"]:checked').value,
    includeInflections: $('useinfl').checked,
    id,
    kind: $('kind').value,
    pos: $('pos').value,
    numeral: $('numeral').value,
    gender: $('gender').value,
    className: $('class').value,
    tag,
  });
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  page = Math.min(page, pages - 1);
  $('count').textContent =
    matched.length.toLocaleString() + ' 件 / ' + DATA.entries.length.toLocaleString() + ' 項目';
  $('active-tag').textContent = tag ? 'タグ：' + tag : '';
  $('clear-tag').hidden = !tag;
  $('results').replaceChildren(
    ...matched
      .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
      .map((e) => entryView(e, Boolean(id))),
  );
  if (!matched.length)
    $('results').append(
      node('p', '該当する語がありません。検索語や分類を変えてみてください。', 'empty'),
    );
  $('shuffle').disabled = matched.length < 2;
  renderPager('pager-top', pages);
  renderPager('pager-bottom', pages);
}

function changed() {
  page = 0;
  clearHash();
  render();
}
$('query').addEventListener('input', changed);
$('search-form').addEventListener('change', (e) => {
  if (['pos', 'kind'].includes(e.target.id)) {
    $('gender').value = '';
    $('class').value = '';
    tag = '';
    syncFilters();
  }
  if (e.target.id === 'tag-filter') tag = e.target.value;
  if (e.target.id !== 'query') changed();
});
$('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  changed();
});
$('reset').addEventListener('click', () => {
  reset();
  render();
  $('query').focus();
});
$('clear-tag').addEventListener('click', () => chooseTag(''));
$('shuffle').addEventListener('click', () => {
  order = [...index];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  page = 0;
  render();
});
for (const id of ['pager-top', 'pager-bottom'])
  $(id).addEventListener('click', (e) => {
    const button = e.target.closest('button[data-page]');
    if (!button || button.disabled) return;
    page = Number(button.dataset.page);
    render();
    $('pager-top').querySelector('[aria-current="page"]').focus({
      preventScroll: true,
    });
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  });
window.addEventListener('hashchange', () => {
  page = 0;
  render();
});
syncFilters();
render();
