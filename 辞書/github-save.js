(function (root) {
  'use strict';
  const REPO = 'velvet-orbit-731/lafca-dictionary';
  const OWNER_ID = 337917858;
  const REPO_PATH = '/repos/' + REPO;
  const DATA_PATTERN = /(<script id="dictionary-data">)const DATA = ([\s\S]*?);(<\/script>)/;
  const json = (value) => JSON.stringify(value, null, 2) + '\n';
  const decode = (content) =>
    new TextDecoder('utf-8', {
      fatal: true,
    }).decode(Uint8Array.from(atob(content.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
  async function sha256(content) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function authError(message) {
    return Object.assign(new Error(message), {
      code: 'AUTH',
    });
  }

  function client(token, request) {
    if (typeof token !== 'string' || !token.trim())
      throw authError('GitHubのトークンを入力してください。');
    return async function api(path, method = 'GET', body) {
      let response;
      try {
        response = await request('https://api.github.com' + path, {
          method,
          cache: 'no-store',
          redirect: 'error',
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + token.trim(),
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body
              ? {
                  'Content-Type': 'application/json',
                }
              : {}),
          },
          ...(body
            ? {
                body: JSON.stringify(body),
              }
            : {}),
        });
      } catch {
        throw new Error(
          'GitHubに接続できません。変更は端末に残っています。通信状態を確認して再度保存してください。',
        );
      }
      if (!response.ok) {
        if (response.status === 401)
          throw authError('GitHubのトークンが無効、または期限切れです。');
        if ([403, 404].includes(response.status))
          throw authError(
            'このリポジトリにアクセスできません。トークンの対象を lafca-dictionary、Contents を Read and write にしてください。',
          );
        if ([409, 422].includes(response.status))
          throw new Error(
            'GitHubが更新されているか、書き込みが制限されています。変更は端末に残っています。再度保存して確認してください。',
          );
        throw new Error(
          'GitHubへの保存に失敗しました（' + response.status + '）。変更は端末に残っています。',
        );
      }
      return response.json();
    };
  }
  async function verifyOwner(api) {
    // Authenticate the token itself; a public profile lookup cannot prove ownership.
    const user = await api('/user');
    if (user.id !== OWNER_ID || user.type !== 'User')
      throw authError(
        'この辞書を編集できるのは所有者だけです。所有者のGitHubトークンを使ってください。',
      );
    const repo = await api(REPO_PATH);
    if (
      repo.owner?.id !== OWNER_ID ||
      repo.permissions?.push !== true ||
      repo.archived ||
      repo.disabled
    )
      throw authError('所有者の編集権限を確認できません。');
    return {
      id: user.id,
      login: user.login,
    };
  }
  async function authenticate(token, request = fetch) {
    return verifyOwner(client(token, request));
  }
  async function publish(changes, token, progress = () => {}, request = fetch) {
    const E = root.LafcaEditor || require('./editor-core.js');
    changes = E.validateDraft({
      version: 1,
      changes,
    }).changes;
    if (!changes.length) throw new Error('保存する変更がありません。');
    const github = client(token, request);
    progress('所有者を確認しています…');
    // Recheck on every publish, even if the editor was previously unlocked.
    await verifyOwner(github);
    const api = (path, method, body) => github(REPO_PATH + path, method, body);
    progress('GitHubの最新版を確認しています…');
    const ref = await api('/git/ref/heads/main'),
      head = ref.object.sha;
    const commit = await api('/git/commits/' + head);
    const tree = await api('/git/trees/' + commit.tree.sha);
    async function read(name) {
      const file = tree.tree.find((f) => f.path === name && f.type === 'blob');
      if (!file) throw new Error('公開リポジトリに ' + name + ' がありません。');
      const blob = await api('/git/blobs/' + file.sha);
      if (blob.encoding !== 'base64') throw new Error('GitHubのファイルを読み取れません。');
      return decode(blob.content);
    }
    const [html, manifestText, dictionaryText] = await Promise.all(
      ['index.html', 'version.json', 'dictionary.json'].map(read),
    );
    const match = html.match(DATA_PATTERN);
    if (!match) throw new Error('公開版を再読み込みしてから保存してください。');
    const data = JSON.parse(match[2]),
      manifest = JSON.parse(manifestText),
      dictionary = JSON.parse(dictionaryText);
    if (
      manifest.htmlSha256 !== (await sha256(html)) ||
      manifest.dictionarySha256 !== (await sha256(dictionaryText)) ||
      dictionary.version !== 1 ||
      !Array.isArray(dictionary.entries) ||
      !E.equal(data.entries, dictionary.entries)
    )
      throw new Error('公開ファイルの整合性を確認できません。変更は端末に残っています。');
    E.validateEntries(dictionary.entries);
    const existingIds = new Set(dictionary.entries.map((e) => e.id));
    const deletedIds = dictionary.deletedIds || [];
    const metadata = dictionary.metadata || {};
    if (
      manifest.entries !== dictionary.entries.length ||
      !Array.isArray(deletedIds) ||
      deletedIds.some((id) => typeof id !== 'string' || !/^[a-f0-9]{16}$/.test(id) || existingIds.has(id)) ||
      new Set(deletedIds).size !== deletedIds.length ||
      typeof metadata !== 'object' || Array.isArray(metadata) ||
      Object.entries(metadata).some(([id, value]) => !existingIds.has(id) || !value || typeof value !== 'object' || Array.isArray(value))
    ) throw new Error('公開ファイルの整合性を確認できません。変更は端末に残っています。');
    const entries = E.merge(dictionary.entries, changes);
    const deleted = new Set(deletedIds);
    for (const c of changes) {
      if (c.after) deleted.delete(E.changeId(c));
      else deleted.add(E.changeId(c));
    }
    const currentIds = new Set(entries.map((e) => e.id));
    const savedDictionary = {
      ...dictionary,
      entries,
      metadata: Object.fromEntries(Object.entries(metadata)
        .filter(([id]) => currentIds.has(id))),
      deletedIds: [...deleted].sort(),
    };
    const newData = {
      ...data,
      entries,
    };
    const newHtml = html.replace(
      DATA_PATTERN,
      (_, before, _old, after) =>
        before + 'const DATA = ' + JSON.stringify(newData).replace(/</g, '\\u003c') + ';' + after,
    );
    const dictionaryJson = json(savedDictionary);
    const version = {
      ...manifest,
      entries: entries.length,
      htmlSha256: await sha256(newHtml),
      dictionarySha256: await sha256(dictionaryJson),
    };
    progress('辞書を保存しています…');
    const files = {
      'index.html': newHtml,
      'dictionary.json': dictionaryJson,
      'version.json': json(version),
    };
    const nextTree = await api('/git/trees', 'POST', {
      base_tree: commit.tree.sha,
      tree: Object.entries(files).map(([path, content]) => ({
        path,
        mode: '100644',
        type: 'blob',
        content,
      })),
    });
    const nextCommit = await api('/git/commits', 'POST', {
      message:
        'Update dictionary entries: ' +
        changes.map((c) => (c.after ? c.after.head : 'Delete ' + c.before.head)).join(', '),
      tree: nextTree.sha,
      parents: [head],
    });
    await api('/git/refs/heads/main', 'PATCH', {
      sha: nextCommit.sha,
      force: false,
    });
    return {
      entries,
      commit: nextCommit.sha,
      url: 'https://github.com/' + REPO + '/commit/' + nextCommit.sha,
    };
  }
  const api = {
    authenticate,
    publish,
    sha256,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.LafcaGitHub = api;
})(globalThis);
