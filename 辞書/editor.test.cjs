'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs');
const E = require('./editor-core.js'),
  G = require('./github-save.js'),
  M = require('./morphology.js');
const html = fs.readFileSync('ラフカ語辞書.html', 'utf8');
const data = JSON.parse(
  html.match(/<script id="dictionary-data">const DATA = ([\s\S]*?);<\/script>/)[1],
);
const entries = data.entries,
  byHead = (h) => entries.find((e) => e.head === h);
const copy = E.clone,
  changed = (head, meaning) => {
    const e = copy(byHead(head));
    e.senseTags = (e.senseTags || []).map((s) => ({
      ...s,
      meaning,
    }));
    e.meaning = meaning;
    return e;
  };
(async () => {
  E.validateEntries(entries);
  assert.deepEqual(E.RELATION_TYPES, ['派生', '類義', '対義']);
  // Metadata remains authoritative, but noun stem tags must survive every save.
  const oldName = copy(byHead('Ämhor'));
  oldName.tags = ['人名', '名詞', '男性', '固定型', '単数のみ', '人名'];
  const orderedName = ['名詞', '男性', '固定型', '子音幹型', '単数のみ', '人名'];
  assert.deepEqual(E.tags(oldName, oldName.tags), orderedName);
  assert.deepEqual(E.normalizeRelations(oldName).tags, orderedName);
  assert.deepEqual(E.normalizeRelations(oldName).tables, oldName.tables);
  assert.deepEqual(E.tags(byHead('amalbuh'), ['子音幹']), ['名詞', '男性', '固定型', '子音幹型']);
  assert.deepEqual(
    E.tags(byHead('bannen'), [
      '女性',
      'II型',
      '-a幹',
      '中性ウムラウト',
      '人名',
      '確認用',
      '確認用',
    ]),
    ['動詞', 'a/e交替'],
  );
  assert.deepEqual(E.tags(byHead('bod'), ['子音幹', '中性ウムラウト', '子音幹']), [
    '形容詞',
    '子音幹',
    '中性ウムラウト',
  ]);
  const legacyTagDraft = {
    version: 1,
    changes: [
      {
        before: oldName,
        after: {
          ...copy(oldName),
          meaning: 'エムホル（男性人名）・編集試験',
        },
      },
    ],
  };
  const tagPublished = E.apply(entries, []);
  assert.equal(
    E.merge(tagPublished, legacyTagDraft.changes).find((e) => e.id === oldName.id).meaning,
    legacyTagDraft.changes[0].after.meaning,
  );
  for (const e of entries)
    assert.deepEqual(E.tags(e, e.tags), e.tags, e.head + ' uses canonical tag order');
  const emptyDraft = {
    version: 1,
    changes: [],
  };
  const deletedWord = byHead('manž'),
    deletion = E.deleteDraft(entries, emptyDraft, deletedWord.id);
  assert.ok(deletion.changes.some((c) => c.after === null && c.before.id === deletedWord.id));
  const deletedEntries = E.applyDraft(entries, deletion);
  assert.ok(!deletedEntries.some((e) => e.id === deletedWord.id));
  assert.ok(deletedEntries.every((e) => e.relations.every((r) => r.id !== deletedWord.id)));
  assert.deepEqual(E.materializeDraft(entries, deletion), deletion);
  assert.deepEqual(
    E.validateDraft(JSON.parse(JSON.stringify(deletion))),
    deletion,
    'deletion backup round trip',
  );
  assert.deepEqual(
    E.revertDraft(entries, deletion, deletedWord.id),
    emptyDraft,
    'undo restores the word and all incoming links',
  );
  assert.deepEqual(
    E.merge(deletedEntries, deletion.changes),
    deletedEntries,
    'deletion publish retries are idempotent',
  );
  assert.throws(
    () => E.merge(E.apply(entries, [changed('manž', '別の語義')]), deletion.changes),
    /別の場所/,
  );
  assert.throws(
    () =>
      E.merge(deletedEntries, [
        {
          before: deletedWord,
          after: changed('manž', '古い編集'),
        },
      ]),
    /別の場所/,
    'stale edit cannot recreate a deleted word',
  );
  const doubleDelete = E.deleteDraft(entries, deletion, byHead('manča').id);
  const restoredOne = E.applyDraft(entries, E.revertDraft(entries, doubleDelete, deletedWord.id));
  assert.ok(restoredOne.some((e) => e.id === deletedWord.id));
  assert.ok(!restoredOne.some((e) => e.head === 'manča'));
  E.validateEntries(restoredOne);
  assert.throws(
    () =>
      E.validateDraft({
        version: 1,
        changes: [
          {
            before: null,
            after: null,
          },
        ],
      }),
    /変更対象/,
  );
  assert.throws(
    () =>
      E.validateDraft({
        version: 1,
        changes: [
          {
            before: deletedWord,
            after: null,
          },
          {
            before: deletedWord,
            after: deletedWord,
          },
        ],
      }),
    /重複/,
  );
  const temporary = {
    ...copy(byHead('fissa')),
    id: '0123456789abcdef',
    head: 'fissay',
  };
  assert.deepEqual(
    E.deleteDraft(entries, E.updateDraft(entries, emptyDraft, temporary), temporary.id),
    emptyDraft,
    'deleting an unpublished addition cancels it without a tombstone',
  );
  const oldAmalbuh = copy(byHead('amalbuh'));
  oldAmalbuh.relations = [];
  const pendingAmalbuh = copy(byHead('amalbuh'));
  pendingAmalbuh.inflection = M.infer(pendingAmalbuh);
  assert.deepEqual(
    E.merge(entries, [
      {
        before: oldAmalbuh,
        after: pendingAmalbuh,
      },
    ]).find((e) => e.id === pendingAmalbuh.id),
    pendingAmalbuh,
    'public relation repair does not block the pre-existing local draft',
  );
  assert.throws(
    () =>
      E.merge(E.apply(entries, [changed('amalbuh', '別の編集')]), [
        {
          before: oldAmalbuh,
          after: pendingAmalbuh,
        },
      ]),
    /別の場所/,
  );
  const a = copy(byHead('fissa')),
    b = copy(byHead('bonna'));
  const related = (e, title, target) => ({
    ...copy(e),
    relations: [
      ...e.relations,
      {
        title,
        id: target.id,
        head: target.head,
      },
    ],
  });
  const has = (es, source, title, target) =>
    es
      .find((e) => e.id === source.id)
      .relations.some((r) => r.title === title && r.id === target.id);
  for (const title of E.RELATION_TYPES) {
    const link = related(a, title, b),
      draft = E.updateDraft(entries, emptyDraft, link);
    assert.equal(draft.changes.length, 2, 'both entries are included in a single draft');
    const linked = E.apply(
      entries,
      draft.changes.map((c) => c.after),
    );
    assert.ok(has(linked, a, title, b) && has(linked, b, title, a));
    assert.deepEqual(
      E.materializeDraft(entries, {
        version: 1,
        changes: [
          {
            before: a,
            after: link,
          },
        ],
      }),
      draft,
      'legacy one-sided backup expands both ends',
    );
    assert.deepEqual(E.materializeDraft(entries, draft), draft, 'materialization is idempotent');
    assert.deepEqual(E.revertDraft(entries, draft, a.id), emptyDraft);
    assert.deepEqual(E.revertDraft(entries, draft, b.id), emptyDraft, 'undo from either endpoint');
    const removed = E.apply(linked, [a]);
    assert.ok(!has(removed, a, title, b) && !has(removed, b, title, a));
    assert.deepEqual(
      E.apply(linked, [a, linked.find((e) => e.id === b.id)]),
      removed,
      'batch stale backlink cannot resurrect removal',
    );
    const changedType = E.apply(linked, [related(a, title === '派生' ? '類義' : '派生', b)]);
    assert.ok(!has(changedType, b, title, a));
    assert.ok(has(changedType, b, title === '派生' ? '類義' : '派生', a));
    const changedTarget = E.apply(linked, [related(a, title, byHead('len'))]);
    assert.ok(!has(changedTarget, b, title, a));
    assert.ok(has(changedTarget, byHead('len'), title, a));
    const duplicate = E.apply(entries, [related(link, title, b)]);
    assert.equal(
      duplicate
        .find((e) => e.id === a.id)
        .relations.filter((r) => r.title === title && r.id === b.id).length,
      1,
    );
    const chain = E.apply(linked, [
      related(
        linked.find((e) => e.id === b.id),
        title,
        byHead('len'),
      ),
    ]);
    assert.ok(!has(chain, a, title, byHead('len')), 'relationships are not transitive');
    const renamed = {
      ...copy(linked.find((e) => e.id === b.id)),
      head: 'bonnax',
    };
    assert.equal(
      E.apply(linked, [renamed])
        .find((e) => e.id === a.id)
        .relations.find((r) => r.id === b.id).head,
      'bonnax',
    );
    assert.throws(
      () => E.merge(E.apply(entries, [changed('bonna', '別端末からの編集')]), draft.changes),
      /別の場所/,
      'automatic counterpart snapshots protect concurrent edits',
    );
    assert.deepEqual(E.merge(linked, draft.changes), linked, 'reciprocal publish retry');
  }
  const newWord = {
    ...copy(a),
    id: '1234567890abcdef',
    head: 'fissax',
    relations: [],
  };
  let newDraft = E.updateDraft(entries, emptyDraft, related(newWord, '派生', b));
  let editedB = copy(
    E.apply(
      entries,
      newDraft.changes.map((c) => c.after),
    ).find((e) => e.id === b.id),
  );
  editedB.meaning = '月（編集試験）';
  newDraft = E.updateDraft(entries, newDraft, editedB);
  const cancelled = E.revertDraft(entries, newDraft, newWord.id);
  assert.equal(cancelled.changes.length, 1);
  assert.equal(cancelled.changes[0].after.meaning, editedB.meaning);
  assert.deepEqual(
    cancelled.changes[0].after.relations,
    b.relations,
    'undo new word removes backlinks but preserves independent edits',
  );
  const stale = {
    version: 1,
    changes: [
      {
        before: a,
        after: changed('fissa', '下書き'),
      },
    ],
  };
  assert.deepEqual(
    E.materializeDraft(E.apply(entries, [changed('fissa', '新しい公開版')]), stale).changes[0]
      .before,
    a,
    'do not rebase stale conflict snapshots',
  );
  assert.throws(() => E.apply(entries, [related(a, '派生', a)]), /自分自身/);
  const snapshot = copy(entries);
  E.apply(entries, [related(a, '類義', b)]);
  assert.deepEqual(entries, snapshot, 'source data is not mutated');
  for (const title of ['派生語', '派生元']) {
    const before = copy(byHead('manž'));
    before.relations[0].title = title;
    const after = {
        ...copy(before),
        meaning: '人、男（旧下書き）',
      },
      legacy = {
        version: 1,
        changes: [
          {
            before,
            after,
          },
        ],
      };
    const normalized = E.validateDraft(legacy);
    assert.equal(normalized.changes[0].before.relations[0].title, '派生');
    assert.equal(normalized.changes[0].after.relations[0].title, '派生');
    assert.equal(legacy.changes[0].after.relations[0].title, title);
    const merged = E.merge(entries, legacy.changes).find((e) => e.id === after.id);
    assert.equal(merged.meaning, after.meaning);
    assert.equal(merged.relations[0].title, '派生');
    const changed = copy(byHead('manž'));
    changed.relations[0].title = '対義';
    assert.throws(() => E.merge(E.apply(entries, [changed]), legacy.changes), /別の場所/);
  }
  const fissa = changed('fissa', '魚肉・編集試験');
  fissa.inflection = M.infer(fissa);
  const c = {
    before: copy(byHead('fissa')),
    after: fissa,
  };
  assert.equal(E.merge(entries, [c]).find((e) => e.id === fissa.id).meaning, fissa.meaning);
  assert.throws(() => E.merge(E.apply(entries, [changed('fissa', '他の端末')]), [c]), /別の場所/);
  assert.equal(
    E.merge(E.apply(entries, [changed('bonna', '他の語')]), [c]).find((e) => e.head === 'bonna')
      .meaning,
    '他の語',
  );
  assert.deepEqual(
    E.merge(E.apply(entries, [fissa]), [c]),
    E.apply(entries, [fissa]),
    'retry after uncertain success is idempotent',
  );
  const renamed = {
    ...copy(byHead('manča')),
    head: 'mančax',
  };
  assert.ok(
    E.apply(entries, [renamed])
      .find((e) => e.head === 'manž')
      .relations.some((r) => r.head === 'mančax' && r.id === renamed.id),
  );
  assert.throws(
    () =>
      E.validate({
        ...fissa,
        gender: '',
      }),
    /性/,
  );
  assert.throws(
    () =>
      E.validate({
        ...fissa,
        inflection: null,
      }),
    /設定が不正/,
  );
  assert.throws(
    () =>
      E.validate({
        ...copy(byHead('len')),
        class: 'Ⅰ型',
      }),
    /分類/,
  );
  assert.throws(
    () =>
      E.validate({
        ...fissa,
        head: 'fissa 等',
      }),
    /見出し/,
  );
  assert.throws(
    () =>
      E.validate({
        ...fissa,
        tables: [],
      }),
    /曲用/,
  );
  const empty = copy(fissa);
  empty.tables[0].rows[0].cells[0].value = '';
  assert.throws(() => E.validate(empty), /語形/);
  const plural = copy(fissa);
  plural.tables[0].rows[0].cells[0].label = '複数主格';
  assert.throws(() => E.validate(plural), /数の制限/);
  assert.throws(
    () =>
      E.apply(entries, [
        {
          ...fissa,
          id: '1234567890123456',
        },
      ]),
    /同じ見出し/,
  );
  assert.throws(
    () =>
      E.validateDraft({
        version: 1,
        changes: [c, c],
      }),
    /重複/,
  );
  // Mock the Git object API: publish all artifacts in one non-forced commit.
  let posts = [],
    urls = [];
  const owner = {
    id: 337917858,
    login: 'velvet-orbit-731',
    type: 'User',
  };
  const repo = {
    owner,
    permissions: {
      push: true,
    },
  };
  const manifest = {
    entries: entries.length,
    htmlSha256: await G.sha256(html),
    grammarMdSha256: 'unchanged',
  };
  const blobs = {
    index: html,
    version: JSON.stringify(manifest),
    dictionary: JSON.stringify({
      version: 1,
      entries,
      metadata: { [fissa.id]: { note: 'preserve annotations' }, [byHead('amalbuh').id]: { note: 'remove on deletion' } },
      deletedIds: [],
    }),
  };
  manifest.dictionarySha256 = await G.sha256(blobs.dictionary);
  blobs.version = JSON.stringify(manifest);
  const response = (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
  async function request(url, opts) {
    urls.push(url);
    assert.ok(
      url === 'https://api.github.com/user' ||
        url.startsWith('https://api.github.com/repos/velvet-orbit-731/lafca-dictionary'),
    );
    assert.equal(opts.redirect, 'error');
    assert.equal(opts.cache, 'no-store');
    assert.equal(opts.credentials, 'omit');
    assert.equal(opts.headers.Authorization, 'Bearer test-token');
    if (url === 'https://api.github.com/user') return response(owner);
    const p = url.split('/lafca-dictionary')[1];
    if (p === '') return response(repo);
    if (opts.method !== 'GET')
      posts.push({
        p,
        body: JSON.parse(opts.body),
      });
    if (p === '/git/ref/heads/main')
      return response({
        object: {
          sha: 'head',
        },
      });
    if (p === '/git/commits/head')
      return response({
        tree: {
          sha: 'tree',
        },
      });
    if (p === '/git/trees/tree')
      return response({
        tree: [
          {
            path: 'index.html',
            type: 'blob',
            sha: 'index',
          },
          {
            path: 'version.json',
            type: 'blob',
            sha: 'version',
          },
          {
            path: 'dictionary.json',
            type: 'blob',
            sha: 'dictionary',
          },
        ],
      });
    if (p.startsWith('/git/blobs/'))
      return response({
        encoding: 'base64',
        content: Buffer.from(blobs[p.split('/').pop()]).toString('base64'),
      });
    if (p === '/git/trees')
      return response({
        sha: 'next-tree',
      });
    if (p === '/git/commits')
      return response({
        sha: 'next-commit',
      });
    if (p === '/git/refs/heads/main') return response({});
    throw Error(p);
  }
  // No repository writes before the token's identity and owner permissions are verified.
  for (const identity of [
    {
      ...owner,
      id: 123,
    },
    {
      ...owner,
      type: 'Bot',
    },
    {},
  ]) {
    urls = [];
    posts = [];
    const denied = (url, opts) => (url.endsWith('/user') ? response(identity) : request(url, opts));
    await assert.rejects(() => G.authenticate('test-token', denied), /所有者だけ/);
    await assert.rejects(() => G.publish([c], 'test-token', () => {}, denied), /所有者だけ/);
    assert.deepEqual(urls, []);
    assert.deepEqual(posts, []);
  }
  for (const deniedRepo of [
    {
      ...repo,
      owner: {
        id: 123,
      },
    },
    {
      ...repo,
      permissions: {
        push: false,
      },
    },
    {
      owner,
    },
    {
      ...repo,
      archived: true,
    },
  ]) {
    const denied = (url, opts) =>
      url.endsWith('/lafca-dictionary') ? response(deniedRepo) : request(url, opts);
    posts = [];
    await assert.rejects(() => G.publish([c], 'test-token', () => {}, denied), /編集権限/);
    assert.deepEqual(posts, []);
  }
  await assert.rejects(() => G.authenticate(''), /トークンを入力/);
  await assert.rejects(
    () => G.authenticate('test-token', async () => response({}, 403)),
    /アクセスできません/,
  );
  assert.deepEqual(await G.authenticate('test-token', request), {
    id: owner.id,
    login: owner.login,
  });
  urls = [];
  posts = [];
  const result = await G.publish([c], 'test-token', () => {}, request);
  assert.equal(result.commit, 'next-commit');
  assert.deepEqual(urls.slice(0, 2), [
    'https://api.github.com/user',
    'https://api.github.com/repos/velvet-orbit-731/lafca-dictionary',
  ]);
  assert.deepEqual(
    posts.map((p) => p.p),
    ['/git/trees', '/git/commits', '/git/refs/heads/main'],
  );
  assert.equal(posts[0].body.base_tree, 'tree');
  assert.deepEqual(posts[2].body, {
    sha: 'next-commit',
    force: false,
  });
  const files = Object.fromEntries(posts[0].body.tree.map((f) => [f.path, f.content]));
  assert.deepEqual(Object.keys(files), ['index.html', 'dictionary.json', 'version.json']);
  assert.ok(!JSON.stringify(files).includes('test-token'));
  const saved = JSON.parse(files['version.json']);
  assert.equal(saved.htmlSha256, await G.sha256(files['index.html']));
  assert.ok(!('zpdicSha256' in saved));
  assert.equal(saved.dictionarySha256, await G.sha256(files['dictionary.json']));
  assert.equal(JSON.parse(files['dictionary.json']).entries.find((e) => e.id === fissa.id).id, fissa.id);
  assert.equal(JSON.parse(files['dictionary.json']).entries.find((e) => e.id === fissa.id).meaning, fissa.meaning);
  assert.deepEqual(JSON.parse(files['dictionary.json']).entries.find((e) => e.id === fissa.id).inflection, fissa.inflection);
  const publishedData = JSON.parse(
    files['index.html'].match(/<script id="dictionary-data">const DATA = ([\s\S]*?);<\/script>/)[1],
  );
  assert.equal(publishedData.entries.find((e) => e.id === fissa.id).meaning, fissa.meaning);
  assert.equal(E.zpdic, undefined);
  // Even a one-sided imported edit publishes both endpoints to HTML and dictionary.json.
  posts = [];
  await G.publish(
    [
      {
        before: a,
        after: related(a, '類義', b),
      },
    ],
    'test-token',
    () => {},
    request,
  );
  const reciprocalFiles = Object.fromEntries(posts[0].body.tree.map((f) => [f.path, f.content]));
  const reciprocalEdits = JSON.parse(reciprocalFiles['dictionary.json']).entries;
  assert.equal(reciprocalEdits.length, entries.length);
  assert.ok(has(reciprocalEdits, a, '類義', b) && has(reciprocalEdits, b, '類義', a));
  const reciprocalData = JSON.parse(
    reciprocalFiles['index.html'].match(
      /<script id="dictionary-data">const DATA = ([\s\S]*?);<\/script>/,
    )[1],
  );
  assert.ok(has(reciprocalData.entries, a, '類義', b) && has(reciprocalData.entries, b, '類義', a));
  // Deletions remove previously edited entries and persist across later publishes.
  posts = [];
  const originalBlobs = {
      ...blobs,
    },
    amalbuh = byHead('amalbuh');
  await G.publish(
    E.deleteDraft(entries, emptyDraft, amalbuh.id).changes,
    'test-token',
    () => {},
    request,
  );
  const deletedFiles = Object.fromEntries(posts[0].body.tree.map((f) => [f.path, f.content]));
  const savedDeletion = JSON.parse(deletedFiles['dictionary.json']);
  assert.deepEqual(savedDeletion.deletedIds, [amalbuh.id]);
  assert.ok(!savedDeletion.entries.some((e) => e.id === amalbuh.id));
  assert.ok(!(amalbuh.id in savedDeletion.metadata));
  assert.deepEqual(savedDeletion.metadata[fissa.id], { note: 'preserve annotations' });
  const deletedData = JSON.parse(
    deletedFiles['index.html'].match(/const DATA = ([\s\S]*?);<\/script>/)[1],
  );
  assert.equal(deletedData.entries.length, entries.length - 1);
  assert.equal(JSON.parse(deletedFiles['version.json']).entries, entries.length - 1);
  assert.ok(
    deletedData.entries.every(
      (e) => e.id !== amalbuh.id && e.relations.every((r) => r.id !== amalbuh.id),
    ),
  );
  blobs.index = deletedFiles['index.html'];
  blobs.dictionary = deletedFiles['dictionary.json'];
  blobs.version = deletedFiles['version.json'];
  posts = [];
  await G.publish([c], 'test-token', () => {}, request);
  assert.deepEqual(
    JSON.parse(posts[0].body.tree.find((f) => f.path === 'dictionary.json').content).deletedIds,
    [amalbuh.id],
  );
  Object.assign(blobs, originalBlobs);
  // A corrupt canonical file or a mismatched HTML snapshot must not cause any writes.
  for (const corrupted of [blobs.dictionary + ' ', JSON.stringify({ ...JSON.parse(blobs.dictionary), entries: [] })]) {
    posts = [];
    blobs.dictionary = corrupted;
    await assert.rejects(() => G.publish([c], 'test-token', () => {}, request), /整合性/);
    assert.equal(posts.length, 0);
    Object.assign(blobs, originalBlobs);
  }
  // Token errors, conflicts, branch races and interrupted requests never report success.
  await assert.rejects(
    () =>
      G.publish(
        [c],
        'test-token',
        () => {},
        async () => response({}, 401),
      ),
    /トークンが無効/,
  );
  await assert.rejects(
    () =>
      G.publish(
        [c],
        'test-token',
        () => {},
        async () => {
          throw Error('network');
        },
      ),
    /端末に残っています/,
  );
  await assert.rejects(
    () =>
      G.publish(
        [c],
        'test-token',
        () => {},
        (url, opts) =>
          url.endsWith('/git/refs/heads/main') ? response({}, 422) : request(url, opts),
      ),
    /更新されている/,
  );
  posts = [];
  blobs.index = html.replace(
    JSON.stringify(byHead('fissa')),
    JSON.stringify(changed('fissa', '競合')),
  );
  blobs.dictionary = JSON.stringify({ ...JSON.parse(blobs.dictionary), entries: entries.map((e) => e.id === fissa.id ? changed('fissa', '競合') : e) });
  blobs.version = JSON.stringify({
    ...manifest,
    htmlSha256: await G.sha256(blobs.index),
    dictionarySha256: await G.sha256(blobs.dictionary),
  });
  await assert.rejects(() => G.publish([c], 'test-token', () => {}, request), /別の場所/);
  assert.equal(posts.length, 0);
  console.log('Editor validation, concurrent updates and atomic GitHub publishing: OK');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
