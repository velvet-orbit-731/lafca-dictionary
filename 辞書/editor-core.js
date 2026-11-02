/* Browser and Node share the same editing and validation rules. */
(function (root) {
  'use strict';
  const T = root.LafcaTaxonomy || require('./taxonomy.js');
  const POS = [
    '名詞',
    '代名詞',
    '動詞',
    '形容詞',
    '連体詞',
    '副詞',
    '前置詞',
    '接続詞',
    '小辞',
    '間投詞',
  ];
  const CLASSES = {
    名詞: ['固定型', 'Ⅰ型', 'Ⅱ型', '不規則型'],
    動詞: ['a/e交替', 'e/i交替', 'o/u交替', '非交替', '母音幹'],
    形容詞: ['子音幹', '母音幹'],
  };
  const GENDERS = {
    M: '男性',
    F: '女性',
    N: '中性',
  };
  const RELATION_TYPES = ['派生', '類義', '対義'];
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function normalizeRelations(entry) {
    if (entry == null) return entry;
    T.validate(entry);
    const result = T.normalize(clone(entry));
    result.tags = tags(result, result.tags);
    for (const r of result.relations)
      if (r.title === '派生語' || r.title === '派生元') r.title = '派生';
    return result;
  }
  const canonical = (x) =>
    JSON.stringify(x, function (k, v) {
      return v && !Array.isArray(v) && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, v[k]]),
          )
        : v;
    });
  const equal = (a, b) => canonical(a) === canonical(b);
  const changeId = (c) => (c.after || c.before).id;
  const forms = (e) => e.tables.flatMap((t) => t.rows.flatMap((r) => r.cells));

  function validate(e) {
    const fail = (m) => {
      throw new Error((e?.head || '語彙') + '：' + m);
    };
    if (!e || !/^[a-f0-9]{16}$/.test(e.id)) fail('項目IDが不正です。');
    const keys = [
      'id',
      'head',
      'pos',
      'kind',
      'numeralType',
      'numberRestriction',
      'meaning',
      'tags',
      'gender',
      'class',
      'protoForms',
      'relations',
      'tables',
    ];
    if (
      Object.keys(e).some((k) => !keys.includes(k) && !['inflection', 'senseTags'].includes(k)) ||
      keys.some((k) => !Object.hasOwn(e, k))
    )
      fail('語彙データの形式が不正です。');
    T.validate(e);
    if (Object.hasOwn(e, 'inflection'))
      (root.LafcaMorphology || require('./morphology.js')).validate(e.inflection);
    if (
      typeof e.head !== 'string' ||
      !/^-?[A-Za-zÄÖÜŠŽČäöüšžč]+(?: [A-Za-zÄÖÜŠŽČäöüšžč]+)*-?$/.test(e.head)
    )
      fail('見出しには個別の語・接辞・慣用句を入力してください。');
    if (
      !['単語', '接辞', '慣用句'].includes(e.kind) ||
      !(POS.includes(e.pos) || (e.kind === '接辞' && e.pos === ''))
    )
      fail('品詞を選んでください。');
    if (typeof e.meaning !== 'string' || !e.meaning.trim()) fail('意味を入力してください。');
    if (e.pos === '名詞' ? !GENDERS[e.gender] : e.gender !== '')
      fail('性は名詞に指定してください。');
    if (
      CLASSES[e.pos]
        ? !(CLASSES[e.pos].includes(e.class) || (e.kind === '慣用句' && e.class === ''))
        : e.class !== ''
    )
      fail('品詞に合う分類を選んでください。');
    if (
      !['', '基数', '序数'].includes(e.numeralType) ||
      (e.numeralType && !['名詞', '形容詞', '連体詞'].includes(e.pos))
    )
      fail('数詞の分類が品詞と合いません。');
    if (
      !['', 'singular', 'plural'].includes(e.numberRestriction) ||
      (e.numberRestriction && e.pos !== '名詞')
    )
      fail('数の制限が不正です。');
    for (const key of ['tags', 'protoForms'])
      if (!Array.isArray(e[key]) || e[key].some((v) => typeof v !== 'string' || !v.trim()))
        fail(key + 'が不正です。');
    if (e.protoForms.some((v) => !v.startsWith('*'))) fail('祖語型は * で始めてください。');
    if (!Array.isArray(e.tables) || !Array.isArray(e.relations)) fail('語形・関連語が不正です。');
    const labels = new Set();
    for (const t of e.tables) {
      if (
        !t.title?.trim() ||
        !Array.isArray(t.columns) ||
        !t.columns.length ||
        t.columns.some((c) => typeof c !== 'string' || !c.trim()) ||
        !Array.isArray(t.rows) ||
        !t.rows.length
      )
        fail('空の語形表は削除するか入力してください。');
      for (const r of t.rows) {
        if (!r.label?.trim() || !Array.isArray(r.cells) || r.cells.length !== t.columns.length)
          fail('語形表の行・列が一致しません。');
        for (const f of r.cells) {
          if (
            typeof f.label !== 'string' ||
            !f.label.trim() ||
            typeof f.value !== 'string' ||
            !f.value.trim()
          )
            fail('語形を入力してください。存在しない形は行を削除してください。');
          if (labels.has(f.label)) fail('語形名が重複しています：' + f.label);
          labels.add(f.label);
          const excluded = {
            singular: '複数',
            plural: '単数',
          }[e.numberRestriction];
          if (excluded && f.label.includes(excluded)) fail('数の制限と語形が一致しません。');
        }
      }
    }
    if (['名詞', '動詞', '形容詞'].includes(e.pos) && !e.tables.length)
      fail((e.pos === '動詞' ? '活用' : '曲用') + 'を入力してください。');
    if (
      e.relations.some(
        (r) => !r.title?.trim() || !/^[a-f0-9]{16}$/.test(r.id) || typeof r.head !== 'string',
      )
    )
      fail('関連語が不正です。');
    return e;
  }

  function validateEntries(entries) {
    const ids = new Set(),
      words = new Set();
    for (const e of entries) {
      validate(e);
      const word = e.head.normalize('NFC') + '\0' + e.pos + '\0' + e.kind;
      if (ids.has(e.id)) throw new Error('項目IDが重複しています。');
      if (words.has(word)) throw new Error('同じ見出し・品詞が既にあります：' + e.head);
      ids.add(e.id);
      words.add(word);
    }
    for (const e of entries)
      for (const r of e.relations)
        if (!ids.has(r.id)) throw new Error('関連語が見つかりません：' + r.head);
    return entries;
  }

  function apply(entries, replacements, deletedIds = []) {
    if (!Array.isArray(deletedIds) || deletedIds.some((id) => !/^[a-f0-9]{16}$/.test(id)))
      throw new Error('削除対象のIDが不正です。');
    const deleted = new Set(deletedIds);
    const byId = new Map(entries.map((e) => [e.id, normalizeRelations(e)]));
    for (const id of deleted) byId.delete(id);
    for (const e of byId.values()) e.relations = e.relations.filter((r) => !deleted.has(r.id));
    const symmetric = (r) => RELATION_TYPES.includes(r.title);
    const same = (a, b) => a.title === b.title && a.id === b.id;

    function complete() {
      for (const e of byId.values()) {
        e.relations = e.relations.filter(
          (r, i, all) => !symmetric(r) || all.findIndex((x) => same(x, r)) === i,
        );
        for (const r of e.relations.filter(symmetric)) {
          if (r.id === e.id) throw new Error('自分自身を関連語には指定できません。');
          const target = byId.get(r.id);
          if (target && !target.relations.some((x) => x.title === r.title && x.id === e.id))
            target.relations.push({
              title: r.title,
              id: e.id,
              head: e.head,
            });
        }
      }
    }
    complete();
    const before = new Map([...byId].map(([id, e]) => [id, clone(e)]));
    replacements = replacements.map(normalizeRelations);
    for (const e of replacements) {
      if (deleted.has(e.id)) throw new Error('同じ語を編集と削除の両方には指定できません。');
      e.relations = e.relations.filter((r) => !deleted.has(r.id));
      byId.set(e.id, e);
    }
    // Remove both ends before completing additions, so a stale reverse link
    // cannot recreate a relation the user just removed or changed.
    for (const e of replacements)
      for (const r of (before.get(e.id)?.relations || []).filter(symmetric)) {
        if (!e.relations.some((x) => same(x, r))) {
          const target = byId.get(r.id);
          if (target)
            target.relations = target.relations.filter(
              (x) => !(x.title === r.title && x.id === e.id),
            );
        }
      }
    complete();
    const result = [...byId.values()];
    for (const e of result)
      for (const r of e.relations) if (byId.has(r.id)) r.head = byId.get(r.id).head;
    const key = (e) =>
      e.head
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0308\u030c]/g, '');
    result.sort((a, b) =>
      key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : 0,
    );
    return validateEntries(result);
  }

  function merge(remoteEntries, changes) {
    remoteEntries = remoteEntries.map(normalizeRelations);
    changes = changes.map((c) => ({
      before: normalizeRelations(c.before),
      after: normalizeRelations(c.after),
    }));
    const byId = new Map(remoteEntries.map((e) => [e.id, e]));
    // A public repair may already contain some fields of a pending edit (such as
    // its relation), while the draft also contains inflection settings. Accept
    // only fields matching before or after; unrelated remote updates still conflict.
    const compatible = (c) => {
      const remote = byId.get(changeId(c)) || null;
      if (equal(remote, c.before) || equal(remote, c.after)) return true;
      return (
        remote &&
        c.before &&
        c.after &&
        [
          ...new Set([...Object.keys(remote), ...Object.keys(c.before), ...Object.keys(c.after)]),
        ].every((k) => equal(remote[k], c.before[k]) || equal(remote[k], c.after[k]))
      );
    };
    const conflicts = changes.filter((c) => !compatible(c));
    if (conflicts.length)
      throw new Error(
        '別の場所で更新されています：' +
          conflicts.map((c) => (c.after || c.before).head).join('、') +
          '。変更をバックアップし、公開版を読み直してから編集してください。',
      );
    return applyDraft(remoteEntries, {
      version: 1,
      changes,
    });
  }

  function validateDraft(draft) {
    if (!draft || draft.version !== 1 || !Array.isArray(draft.changes))
      throw new Error('この辞書の編集バックアップではありません。');
    draft = clone(draft);
    const ids = new Set();
    for (const c of draft.changes) {
      if (!c || (c.before === null && c.after === null)) throw new Error('変更対象がありません。');
      if (c.after !== null) validate(c.after);
      if (c.before !== null) {
        validate(c.before);
        if (c.after && c.before.id !== c.after.id) throw new Error('変更前後のIDが一致しません。');
      }
      const id = changeId(c);
      if (ids.has(id)) throw new Error('編集対象が重複しています。');
      ids.add(id);
      c.before = normalizeRelations(c.before);
      c.after = normalizeRelations(c.after);
    }
    return draft;
  }

  function applyDraft(entries, draft) {
    return apply(
      entries,
      draft.changes.filter((c) => c.after).map((c) => c.after),
      draft.changes.filter((c) => c.after === null).map(changeId),
    );
  }

  function draftFromEntries(published, entries, draft) {
    const originals = new Map(published.map((e) => [e.id, e]));
    const previous = new Map(draft.changes.map((c) => [changeId(c), c]));
    const changes = [];
    for (const after of entries) {
      const before = previous.has(after.id)
        ? previous.get(after.id).before
        : originals.get(after.id) || null;
      if (!equal(before, after))
        changes.push({
          before: clone(before),
          after: clone(after),
        });
    }
    const remaining = new Set(entries.map((e) => e.id));
    for (const id of new Set([...originals.keys(), ...previous.keys()]))
      if (!remaining.has(id)) {
        const before = previous.has(id) ? previous.get(id).before : originals.get(id);
        if (before)
          changes.push({
            before: clone(before),
            after: null,
          });
      }
    return validateDraft({
      version: 1,
      changes,
    });
  }

  function materializeDraft(published, draft) {
    draft = validateDraft(draft);
    return draftFromEntries(published, applyDraft(published, draft), draft);
  }

  function updateDraft(published, draft, entry) {
    draft = validateDraft(draft);
    const current = applyDraft(published, draft);
    return draftFromEntries(published, apply(current, [entry]), draft);
  }

  function deleteDraft(published, draft, id) {
    draft = validateDraft(draft);
    return draftFromEntries(published, apply(applyDraft(published, draft), [], [id]), draft);
  }

  function revertDraft(published, draft, id) {
    draft = validateDraft(draft);
    let entries = applyDraft(published, draft);
    const original = published.find((e) => e.id === id);
    if (original) {
      if (!entries.some((e) => e.id === id))
        for (const e of entries) {
          (published.find((x) => x.id === e.id)?.relations || []).forEach((r, i) => {
            // 元の位置へ戻す（末尾に足すと並びが変わり、取り消し後も差分が残る）
            if (r.id === id && !e.relations.some((x) => x.id === id && x.title === r.title))
              e.relations.splice(i, 0, clone(r));
          });
        }
      const restored = clone(original),
        available = new Set([...entries.map((e) => e.id), id]);
      restored.relations = restored.relations.filter((r) => available.has(r.id));
      entries = apply(entries, [restored]);
    } else entries = apply(entries, [], [id]);
    draft.changes = draft.changes.filter((c) => changeId(c) !== id);
    return draftFromEntries(published, entries, draft);
  }
  const tags = (e, extra) => T.tags(e, extra);
  const api = {
    POS,
    CLASSES,
    GENDERS,
    RELATION_TYPES,
    normalizeRelations,
    clone,
    equal,
    changeId,
    forms,
    validate,
    validateEntries,
    validateDraft,
    apply,
    applyDraft,
    merge,
    materializeDraft,
    updateDraft,
    deleteDraft,
    revertDraft,
    tags,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.LafcaEditor = api;
})(globalThis);
