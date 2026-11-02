'use strict';
(() => {
  const E = LafcaEditor,
    M = LafcaMorphology,
    KEY = 'lafca-dictionary:edits:v1';
  let model = null,
    previousGenerated = [],
    automaticError = '';
  let ownerToken = '',
    loginAttempt = 0;
  let published = E.apply(DATA.entries, []),
    draft = {
      version: 1,
      changes: [],
    },
    editing = false,
    working = null,
    openingChange;
  const toolbar = node('div', undefined, 'editor-toolbar');
  toolbar.hidden = true;
  const notice = node('p', '', 'edit-status');
  notice.setAttribute('role', 'status');

  function button(text, action, cls = '') {
    const b = node('button', text, cls);
    b.type = 'button';
    b.addEventListener('click', action);
    return b;
  }
  const mode = button('所有者ログイン', () => {
    if (ownerToken) logout();
    else showLogin();
  });
  mode.id = 'edit-mode';
  $('stat').after(mode);
  const add = button('語彙を追加', () => openEditor());
  add.id = 'add-entry';
  const manage = button('未公開の変更を公開…', showChanges);
  manage.id = 'manage-edits';
  const backup = button('変更をバックアップ', () => {
    if (ownerToken)
      download('lafca-edits.json', JSON.stringify(draft, null, 2) + '\n', 'application/json');
  });
  const importInput = node('input');
  importInput.type = 'file';
  importInput.accept = '.json,application/json';
  importInput.hidden = true;
  importInput.id = 'import-edits';
  const importButton = button('変更を読み込む', () => {
    if (ownerToken) importInput.click();
  });
  toolbar.append(add, manage, backup, importButton, importInput, notice);
  document.querySelector('header').after(toolbar);

  function dialog(id, title) {
    const d = node('dialog', undefined, 'editor-dialog');
    d.id = id;
    const h = node('h2', title);
    h.id = id + '-title';
    d.setAttribute('aria-labelledby', h.id);
    d.append(h);
    document.body.append(d);
    return d;
  }
  const loginDialog = dialog('owner-login', '所有者ログイン'),
    loginForm = node('form');
  const loginStatus = node('p', '', 'edit-error');
  loginStatus.id = 'login-status';
  loginStatus.setAttribute('role', 'alert');
  const authInfo = node(
    'p',
    '所有者のGitHubトークンで認証します。対象を lafca-dictionary、権限を Contents: Read and write にしてください。',
  );
  const link = node('a', 'トークンを作成');
  link.href =
    'https://github.com/settings/personal-access-tokens/new?name=Lafca%20dictionary&description=Lafca%20dictionary%20editor&target_name=velvet-orbit-731&contents=write';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const tokenLabel = node('label', 'GitHubトークン'),
    token = node('input');
  token.type = 'password';
  token.id = 'github-token';
  token.autocomplete = 'off';
  token.spellcheck = false;
  token.required = true;
  tokenLabel.append(token);
  const loginButton = node('button', 'ログイン', 'primary');
  loginButton.type = 'submit';
  loginButton.id = 'owner-login-submit';
  loginForm.append(
    authInfo,
    link,
    tokenLabel,
    node('p', 'トークンは保存せず、編集を終了すると破棄します。'),
    loginStatus,
    loginButton,
    button('キャンセル', () => loginDialog.close()),
  );
  loginDialog.append(loginForm);

  function showLogin(message = '') {
    loginStatus.textContent = message;
    loginDialog.showModal();
    token.focus();
  }

  function requireOwner() {
    if (!ownerToken) throw new Error('編集には所有者ログインが必要です。');
  }
  loginDialog.addEventListener('close', () => {
    token.value = '';
    loginAttempt++;
    loginButton.disabled = false;
  });
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const attempt = ++loginAttempt;
    let credential = token.value.trim();
    token.value = '';
    loginButton.disabled = true;
    loginStatus.textContent = '所有者を確認しています…';
    try {
      await LafcaGitHub.authenticate(credential);
      if (attempt !== loginAttempt || !loginDialog.open) return;
      ownerToken = credential;
      editing = true;
      toolbar.hidden = false;
      mode.textContent = '編集を終了';
      loginDialog.close();
      try {
        draft = readDraft();
        refresh();
      } catch {
        fail(new Error('保存済みの変更を読み込めません。元の保存内容は保持しています。'));
      }
    } catch (error) {
      if (attempt === loginAttempt) loginStatus.textContent = error.message;
    } finally {
      credential = '';
      if (attempt === loginAttempt) loginButton.disabled = false;
    }
  });

  function logout() {
    ownerToken = '';
    loginAttempt++;
    editing = false;
    draft = {
      version: 1,
      changes: [],
    };
    toolbar.hidden = true;
    mode.textContent = '所有者ログイン';
    for (const d of [editor, changesDialog, loginDialog]) if (d.open) d.close();
    token.value = '';
    form.reset();
    working = null;
    model = null;
    previousGenerated = [];
    tables.replaceChildren();
    relations.replaceChildren();
    changesList.replaceChildren();
    refresh();
  }
  // Clear the credential on navigation, including a page kept in the back/forward cache.
  window.addEventListener('pagehide', logout);
  const editor = dialog('entry-editor', '語彙を編集'),
    form = node('form');
  const errors = node('p', '', 'edit-error');
  errors.setAttribute('role', 'alert');
  errors.id = 'editor-error';
  const grid = node('div', undefined, 'editor-grid');

  function field(label, id, type = 'input', choices) {
    const l = node('label', label),
      input = node(type);
    input.id = id;
    if (choices)
      for (const [value, text] of choices) {
        const o = node('option', text);
        o.value = value;
        input.append(o);
      }
    if (type === 'input') {
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
    }
    l.append(input);
    grid.append(l);
    return input;
  }
  const head = field('見出し語', 'edit-head');
  head.required = true;
  const kind = field(
    '項目',
    'edit-kind',
    'select',
    ['単語', '接頭辞', '接尾辞', '慣用句'].map((v) => [v, v]),
  );
  const entryKind = () => (['接頭辞', '接尾辞'].includes(kind.value) ? '接辞' : kind.value);
  const pos = field('品詞', 'edit-pos', 'select', [['', '—'], ...E.POS.map((v) => [v, v])]);
  const gender = field('性', 'edit-gender', 'select', Object.entries(E.GENDERS));
  const cls = field('分類', 'edit-class', 'select');
  const number = field('数', 'edit-number', 'select', [
    ['', '単数・複数'],
    ['singular', '単数のみ'],
    ['plural', '複数のみ'],
  ]);
  const numeral = {
    value: '',
    disabled: false,
  };
  const pattern = field('曲用語尾', 'edit-pattern', 'select', [
    ['auto', '自動'],
    ['consonant', '子音幹型'],
    ['a', '-a型'],
    ['o', '-o型'],
    ['short', '短語尾母音型'],
    ['glide', '緩衝子音型'],
    ['plural-a', '-a型（複数のみ）'],
    ['plural-i', '複数-i型'],
    ['aq', '-aq 派生語'],
  ]);
  const oblique = field('斜格語幹', 'edit-oblique');
  oblique.placeholder = '通常は自動。Ⅰ・Ⅱ型などは指定';
  const strong = field('強語幹', 'edit-strong');
  strong.placeholder = '不定形から自動';
  const present = field('現在語幹', 'edit-present');
  present.placeholder = '分類・不定形から自動';
  const impersonal = field('人称', 'edit-impersonal', 'select', [
    ['', '人称あり'],
    ['yes', '無主語'],
  ]);
  const gerund = field('動名詞の曲用', 'edit-gerund', 'select', [
    ['yes', '表示する'],
    ['', '表示しない'],
  ]);
  const adjStem = field('形容詞語幹', 'edit-adjective-stem');
  adjStem.placeholder = '見出しから自動';
  const femaleStem = field('女性語幹', 'edit-female-stem');
  femaleStem.placeholder = '自動';
  const neuterStem = field('中性語幹', 'edit-neuter-stem');
  neuterStem.placeholder = 'ウムラウトで自動';
  const neuterForm = field('中性単数主格の例外', 'edit-neuter-form');
  neuterForm.placeholder = '中性語幹から自動';
  const pronounPattern = field('曲用の規則', 'edit-pronoun-pattern', 'select', [
    ['none', '不変化'],
    ['caq', 'čaq と同じ'],
  ]);
  const settingInputs = {
    pronounPattern,
    nounPattern: pattern,
    obliqueStem: oblique,
    strongStem: strong,
    presentStem: present,
    adjectiveStem: adjStem,
    femaleStem,
    neuterStem,
    neuterForm,
  };
  const senseRows = node('div', undefined, 'wide');
  senseRows.id = 'edit-senses';
  grid.append(senseRows);
  let editingSenses = [];
  const meaningHint = node(
    'p',
    '同じ語義の訳語は , または 、で区切ります。異なる語義は「語義を追加」で分けます。',
    'field-hint',
  );
  meaningHint.id = 'meaning-hint';
  grid.append(meaningHint);
  const addSense = button('語義を追加', () => {
    editingSenses.push({
      meaning: '',
      tags: [],
    });
    drawSenses();
    senseRows.lastElementChild.querySelector('textarea').focus();
  });
  addSense.id = 'add-sense';
  grid.append(addSense);
  const proto = field('祖語型（1行に1つ）', 'edit-proto', 'textarea');
  proto.rows = 2;
  const personName = field('人名', 'edit-person-name', 'select', [
    ['', '—'],
    ['yes', '人名'],
  ]);
  const irregular = field('不規則活用', 'edit-irregular', 'select', [
    ['', '—'],
    ['yes', '不規則活用'],
  ]);

  function readSenses() {
    return editingSenses.flatMap((s) =>
      T.lines(s.meaning).map((meaning) => ({
        meaning,
        tags: T.leaves(
          s.tags.filter((t) =>
            T.allowed({
              pos: pos.value,
              kind: entryKind(),
            }).includes(t),
          ),
        ),
      })),
    );
  }

  function updateNumeral() {
    numeral.value =
      readSenses()
        .flatMap((s) => s.tags)
        .find((t) => ['基数', '序数'].includes(t)) || '';
  }

  function drawSenses() {
    senseRows.replaceChildren();
    editingSenses.forEach((sense, i) => {
      const row = node('fieldset', undefined, 'sense-editor');
      row.append(node('legend', '語義 ' + (i + 1)));
      const input = node('textarea');
      input.rows = 2;
      input.value = sense.meaning;
      input.id = i ? 'edit-meaning-' + i : 'edit-meaning';
      input.setAttribute('aria-label', '語義 ' + (i + 1));
      input.setAttribute('aria-describedby', 'meaning-hint');
      input.addEventListener('input', () => {
        sense.meaning = input.value;
        updateNumeral();
      });
      row.append(input);
      const details = node('details'),
        summary = node('summary');
      details.append(summary);
      const selected = () => {
        summary.textContent = '分類' + (sense.tags.length ? '：' + sense.tags.join('・') : '');
      };
      const e = {
        pos: pos.value,
        kind: entryKind(),
      };
      sense.tags = sense.tags.filter((t) => T.allowed(e).includes(t));
      selected();
      for (const g of T.groups(e)) {
        const group = node('fieldset', undefined, 'sense-tag-group');
        group.append(node('legend', g.name));
        for (const tag of g.tags) {
          const label = node('label'),
            check = node('input');
          check.type = 'checkbox';
          check.value = tag;
          check.checked = sense.tags.includes(tag);
          check.addEventListener('change', () => {
            if (check.checked) {
              if (['数詞', '可算性'].includes(g.name)) {
                sense.tags = sense.tags.filter((t) => !g.tags.includes(t));
                for (const x of group.querySelectorAll('input')) x.checked = x === check;
              }
              sense.tags.push(tag);
            } else sense.tags = sense.tags.filter((t) => t !== tag);
            sense.tags = T.leaves(sense.tags);
            for (const x of details.querySelectorAll('input'))
              x.checked = sense.tags.includes(x.value);
            selected();
            updateNumeral();
            autocomplete();
          });
          label.append(check, document.createTextNode(tag));
          group.append(label);
        }
        details.append(group);
      }
      row.append(details);
      const actions = node('div', undefined, 'sense-actions');
      if (i) {
        const up = button('上へ', () => {
          [editingSenses[i - 1], editingSenses[i]] = [editingSenses[i], editingSenses[i - 1]];
          drawSenses();
        });
        up.setAttribute('aria-label', '語義 ' + (i + 1) + ' を上へ');
        actions.append(up);
      }
      if (editingSenses.length > 1) {
        const remove = button('語義を削除', () => {
          editingSenses.splice(i, 1);
          drawSenses();
          updateNumeral();
          autocomplete();
        });
        remove.setAttribute('aria-label', '語義 ' + (i + 1) + ' を削除');
        actions.append(remove);
      }
      row.append(actions);
      senseRows.append(row);
    });
  }
  const formsTitle = node('h3', '曲用'),
    tables = node('div');
  tables.id = 'edit-tables';
  const relationsTitle = node('h3', '関連語'),
    relations = node('div');
  relations.id = 'edit-relations';
  const addTable = button('表を追加', () => {
    working.tables.push({
      title: pos.value === '動詞' ? '活用' : '曲用',
      columns: ['語形'],
      rows: [
        {
          label: '',
          cells: [
            {
              label: '',
              value: '',
            },
          ],
        },
      ],
    });
    drawTables();
  });
  const addRelation = button('関連語を追加', () => {
    const r = {
      title: '派生',
      id: '',
      head: '',
    };
    working.relations.push(r);
    appendRelation(r).querySelector('input[role=combobox]').focus();
  });
  const actions = node('div', undefined, 'editor-actions');
  const save = node('button', '保存して公開…', 'primary');
  save.type = 'submit';
  save.id = 'save-entry';
  const saveDraft = node('button', '下書きに保存');
  saveDraft.type = 'submit';
  saveDraft.id = 'save-draft';
  const cancel = button('キャンセル', closeEditor);
  cancel.id = 'cancel-entry';
  const remove = button('単語を削除', deleteEntry, 'danger');
  remove.id = 'delete-entry';
  remove.hidden = true;
  actions.append(save, saveDraft, cancel, remove);
  form.append(
    errors,
    grid,
    formsTitle,
    tables,
    addTable,
    relationsTitle,
    relations,
    addRelation,
    actions,
  );
  editor.append(form);
  let initialForm = '';

  function showField(input, visible) {
    input.parentElement.hidden = !visible;
    input.disabled = !visible;
  }

  function syncEditor(posChanged = false) {
    const p = pos.value,
      noun = p === '名詞';
    showField(pos, entryKind() !== '接辞');
    showField(gender, noun);
    showField(number, noun);
    numeral.disabled = !['名詞', '形容詞', '連体詞'].includes(p) || kind.value !== '単語';
    showField(personName, noun);
    showField(irregular, p === '動詞');
    if (posChanged) {
      drawSenses();
      updateNumeral();
    }
    const selected = cls.value;
    cls.replaceChildren(
      ...(kind.value === '慣用句' ? ['', ...(E.CLASSES[p] || [])] : E.CLASSES[p] || []).map((v) => {
        const o = node('option', T.label(v));
        o.value = v;
        return o;
      }),
    );
    if (E.CLASSES[p]?.includes(selected) && !posChanged) cls.value = selected;
    showField(cls, Boolean(E.CLASSES[p]));
    formsTitle.textContent = p === '動詞' ? '活用' : '曲用';
    for (const input of [pattern, oblique]) showField(input, noun);
    showField(pronounPattern, p === '代名詞');
    for (const input of [present, impersonal, gerund]) showField(input, p === '動詞');
    showField(strong, p === '動詞' && cls.value !== '母音幹');
    for (const input of [adjStem, femaleStem, neuterStem, neuterForm])
      showField(input, p === '形容詞');
    for (const option of pattern.options)
      option.disabled = option.value.startsWith('plural-') && number.value !== 'plural';
    if (pattern.selectedOptions[0]?.disabled) pattern.value = 'auto';
    if (!noun) {
      gender.value = '';
      number.value = '';
    } else if (!gender.value) gender.value = 'M';
    if (numeral.disabled) numeral.value = '';
  }

  function controlsEntry() {
    return {
      ...working,
      head: head.value.trim().normalize('NFC'),
      kind: entryKind(),
      pos: pos.value,
      gender: gender.disabled ? '' : gender.value,
      class: cls.disabled ? '' : cls.value,
      numberRestriction: number.disabled ? '' : number.value,
      numeralType: numeral.disabled ? '' : numeral.value,
    };
  }

  function writeSettings() {
    for (const [key, input] of Object.entries(settingInputs))
      input.value =
        model.settings[key] ||
        (key === 'nounPattern' ? 'auto' : key === 'pronounPattern' ? 'none' : '');
    impersonal.value = model.settings.impersonal ? 'yes' : '';
    gerund.value = model.settings.gerundDeclension ? 'yes' : '';
  }

  function readSettings() {
    for (const [key, input] of Object.entries(settingInputs))
      if (!input.disabled) {
        const v = input.value.trim().normalize('NFC').replace(/-$/, '');
        if (v) model.settings[key] = v;
        else delete model.settings[key];
      }
    if (pos.value === '動詞') {
      model.settings.impersonal = impersonal.value === 'yes';
      model.settings.gerundDeclension = gerund.value === 'yes';
    }
  }

  function autocomplete(redraw = true) {
    if (!model) return;
    automaticError = '';
    try {
      readSettings();
      M.validate(model);
      const e = controlsEntry();
      if (e.head) {
        const result = M.update(e, model, previousGenerated);
        working.tables = result.tables;
        previousGenerated = result.generated;
      }
    } catch (error) {
      automaticError = error.message;
    }
    errors.textContent = automaticError;
    if (redraw) drawTables();
  }

  function changePos() {
    syncEditor(true);
    personName.value = '';
    irregular.value = '';
    working.tables = [];
    delete working.inflection;
    model = {
      version: 1,
      settings: {
        nounPattern: 'auto',
        gerundDeclension: pos.value === '動詞',
      },
      overrides: {},
      omitted: [],
    };
    previousGenerated = [];
    writeSettings();
    autocomplete();
  }
  pos.addEventListener('change', changePos);
  kind.addEventListener('change', () => {
    if (entryKind() === '接辞') pos.value = '';
    else if (!pos.value) pos.value = '名詞';
    changePos();
  });
  cls.addEventListener('change', () => {
    for (const key of ['obliqueStem', 'strongStem', 'presentStem']) delete model.settings[key];
    writeSettings();
    syncEditor();
    autocomplete();
  });
  for (const input of [gender, number])
    input.addEventListener('change', () => {
      syncEditor();
      autocomplete();
    });
  head.addEventListener('input', () => {
    if (pos.value === '形容詞' && head.value.trim())
      cls.value = /[aeiouäöü]$/.test(head.value.trim()) ? '母音幹' : '子音幹';
    autocomplete();
  });
  for (const input of Object.values(settingInputs))
    input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => autocomplete());
  for (const input of [impersonal, gerund]) input.addEventListener('change', () => autocomplete());

  function omit(label) {
    if (!label.trim()) return;
    if (!model.omitted.includes(label)) model.omitted.push(label);
    delete model.overrides[label];
  }

  function flattenTable(t, filter = () => true) {
    const values = E.forms({
      tables: [t],
    }).filter(filter);
    t.columns = ['語形'];
    t.rows = values.map((f) => ({
      label: f.label,
      cells: [f],
    }));
  }

  function textInput(value, label, onInput) {
    const input = node('input');
    input.type = 'text';
    input.value = value;
    input.required = true;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function drawTables() {
    tables.replaceChildren();
    working.tables.forEach((t, ti) => {
      const group = node('fieldset', undefined, 'edit-table');
      const legend = node('legend', '表 ' + (ti + 1));
      const top = node('div', undefined, 'edit-table-heading');
      top.append(
        textInput(t.title, '表の名前', (v) => (t.title = v)),
        button('表を削除', () => {
          M.forms({
            tables: [t],
          }).forEach((f) => omit(f.label));
          working.tables.splice(ti, 1);
          drawTables();
        }),
      );
      group.append(legend, top);
      // Keep the original table's shape; values and their grammatical labels are editable.
      t.rows.forEach((r) =>
        r.cells.forEach((f) => {
          const row = node('div', undefined, 'form-edit-row');
          row.append(
            textInput(f.label, '語形名', (v) => {
              omit(f.label);
              f.label = v;
              flattenTable(t);
            }),
            textInput(f.value, f.label || '語形', (v) => {
              f.value = v;
              if (
                f.label.trim() &&
                M.forms({
                  tables: previousGenerated,
                }).some((x) => x.label === f.label)
              ) {
                if (v.trim()) model.overrides[f.label] = v;
                else delete model.overrides[f.label];
              }
            }),
            button('削除', () => {
              omit(f.label);
              flattenTable(t, (x) => x !== f);
              if (!t.rows.length) working.tables.splice(ti, 1);
              drawTables();
            }),
          );
          row.children[1].addEventListener('change', () => autocomplete());
          if (Object.hasOwn(model.overrides, f.label)) {
            const reset = button('自動', () => {
              delete model.overrides[f.label];
              autocomplete();
            });
            reset.setAttribute('aria-label', f.label + 'を自動補完に戻す');
            row.append(reset);
          }
          group.append(row);
        }),
      );
      group.append(
        button('語形を追加', () => {
          flattenTable(t);
          t.rows.push({
            label: '',
            cells: [
              {
                label: '',
                value: '',
              },
            ],
          });
          drawTables();
        }),
      );
      tables.append(group);
    });
  }

  function relationPicker(r) {
    const picker = node('div', undefined, 'relation-picker'),
      input = node('input'),
      popup = node('div', undefined, 'relation-popup');
    const list = node('div', undefined, 'relation-options'),
      status = node('p', '', 'relation-status'),
      id = 'relation-' + randomId();
    input.type = 'text';
    input.required = true;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '見出し語・意味で検索';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', '関連語');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', id);
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-describedby', id + '-status');
    list.id = id;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '関連語の候補');
    status.id = id + '-status';
    status.setAttribute('role', 'status');
    const label = (e) => e.head + '（' + (e.pos || e.kind) + '）';
    const selected = DATA.entries.find((e) => e.id === r.id);
    input.value = selected ? label(selected) : '';
    let matches = [],
      active = -1,
      composing = false;

    function hide() {
      popup.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    }

    function highlight(index) {
      active = index;
      [...list.children].forEach((option, i) =>
        option.setAttribute('aria-selected', String(i === active)),
      );
      const option = list.children[active];
      if (option) {
        input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({
          block: 'nearest',
        });
      }
    }

    function choose(e) {
      r.id = e.id;
      r.head = e.head;
      input.value = label(e);
      input.setCustomValidity('');
      input.focus();
      hide();
    }

    function suggest() {
      if (composing) return;
      const query = normalize((r.id ? r.head : input.value).trim());
      list.replaceChildren();
      active = -1;
      input.removeAttribute('aria-activedescendant');
      if (!query) {
        matches = [];
        status.textContent = '';
        hide();
        return;
      }
      const terms = query.split(/\s+/);
      const found = DATA.entries
        .filter((e) => e.id !== working.id)
        .map((e) => ({
          e,
          head: normalize(e.head),
          text: normalize(e.head + ' ' + formatMeaning(e.meaning)),
        }))
        .filter((x) => terms.every((t) => x.text.includes(t)));
      const rank = (x) =>
        x.head === query ? 0 : x.head.startsWith(query) ? 1 : x.head.includes(query) ? 2 : 3;
      found.sort((a, b) => rank(a) - rank(b));
      matches = found.slice(0, 20).map((x) => x.e);
      matches.forEach((e, i) => {
        const option = button('', () => choose(e), 'relation-option');
        option.tabIndex = -1;
        option.id = id + '-' + i;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        const title = node('span', undefined, 'relation-option-title');
        title.append(node('strong', e.head), node('span', e.pos || e.kind, 'relation-pos'));
        const senses = meaningSenses(e.meaning),
          summary = senses.map((s, i) => (senses.length > 1 ? i + 1 + '. ' + s : s)).join('\n');
        option.append(title, node('span', summary, 'relation-meaning'));
        list.append(option);
      });
      status.textContent =
        found.length > 20
          ? found.length + ' 件中20件を表示。続けて入力すると絞り込めます。'
          : found.length
            ? found.length + ' 件'
            : '候補がありません。';
      popup.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    input.addEventListener('input', () => {
      r.id = '';
      r.head = '';
      input.setCustomValidity('候補から関連語を選んでください。');
      if (!composing) suggest();
    });
    input.addEventListener('focus', suggest);
    input.addEventListener('compositionstart', () => {
      composing = true;
      hide();
    });
    input.addEventListener('compositionend', () => {
      composing = false;
      suggest();
    });
    input.addEventListener('keydown', (event) => {
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (popup.hidden) suggest();
        if (matches.length)
          highlight(
            active < 0
              ? event.key === 'ArrowDown'
                ? 0
                : matches.length - 1
              : Math.max(
                  0,
                  Math.min(matches.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)),
                ),
          );
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (!popup.hidden && matches.length) choose(matches[Math.max(0, active)]);
      } else if (event.key === 'Escape' && !popup.hidden) {
        event.preventDefault();
        event.stopPropagation();
        hide();
      }
    });
    // Keep keyboard focus on the combobox while clicking a candidate.
    list.addEventListener('mousedown', (event) => event.preventDefault());
    picker.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!picker.contains(document.activeElement)) hide();
      }, 0);
    });
    popup.append(list, status);
    picker.append(input, popup);
    hide();
    return picker;
  }

  function appendRelation(r) {
    const row = node('div', undefined, 'relation-edit-row');
    const type = node('select');
    type.setAttribute('aria-label', '関係');
    const choices = [...E.RELATION_TYPES];
    if (!choices.includes(r.title)) choices.push(r.title);
    for (const value of choices) {
      const option = node('option', value);
      option.value = value;
      type.append(option);
    }
    type.value = r.title;
    type.addEventListener('change', () => {
      r.title = type.value;
    });
    row.append(
      type,
      relationPicker(r),
      button('削除', () => {
        working.relations.splice(working.relations.indexOf(r), 1);
        row.remove();
      }),
    );
    relations.append(row);
    return row;
  }

  function drawRelations() {
    relations.replaceChildren();
    working.relations.forEach(appendRelation);
  }

  function openEditor(id, duplicate = false) {
    if (!ownerToken) return;
    const existing = DATA.entries.find((e) => e.id === id);
    working = existing
      ? E.clone(existing)
      : {
          id: randomId(),
          head: '',
          pos: '名詞',
          kind: '単語',
          numeralType: '',
          numberRestriction: '',
          gender: 'M',
          class: '固定型',
          meaning: '',
          tags: [],
          protoForms: [],
          relations: [],
          tables: [],
        };
    model =
      existing && !duplicate
        ? M.infer(working)
        : {
            version: 1,
            settings: {
              nounPattern: 'auto',
              gerundDeclension: working.pos === '動詞',
            },
            overrides: {},
            omitted: [],
          };
    try {
      previousGenerated = M.generate(working, model.settings, model.overrides);
    } catch {
      previousGenerated = [];
    }
    if (duplicate) {
      working.id = randomId();
      working.head = '';
      working.relations = [];
      working.tables = [];
      delete working.inflection;
      previousGenerated = [];
    }
    openingChange = E.clone(draft.changes.find((c) => E.changeId(c) === working.id) || null);
    remove.hidden = !existing || duplicate;
    head.value = working.head;
    kind.value =
      working.kind === '接辞' ? (working.head.endsWith('-') ? '接頭辞' : '接尾辞') : working.kind;
    pos.value = working.pos;
    gender.value = working.gender;
    number.value = working.numberRestriction;
    numeral.value = working.numeralType;
    editingSenses = T.senses(working);
    if (!editingSenses.length)
      editingSenses = [
        {
          meaning: '',
          tags: [],
        },
      ];
    drawSenses();
    proto.value = working.protoForms.join('\n');
    personName.value = working.tags.includes('人名') ? 'yes' : '';
    irregular.value = working.tags.some((t) => ['不規則', '不規則活用'].includes(t)) ? 'yes' : '';
    syncEditor();
    cls.value = working.class;
    writeSettings();
    syncEditor();
    autocomplete(false);
    errors.textContent = automaticError;
    drawTables();
    drawRelations();
    $('entry-editor-title').textContent = existing && !duplicate ? '語彙を編集' : '語彙を追加';
    editor.showModal();
    head.focus();
    initialForm = formSnapshot();
  }

  function randomId() {
    return [...crypto.getRandomValues(new Uint8Array(8))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function formSnapshot() {
    return JSON.stringify([
      working,
      model,
      editingSenses,
      [...form.querySelectorAll('input,textarea,select')].map((i) => i.value),
    ]);
  }

  function closeEditor() {
    if (formSnapshot() !== initialForm && !confirm('入力中の変更を破棄しますか？')) return;
    editor.close();
  }
  editor.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeEditor();
  });

  function readDraft() {
    const text = localStorage.getItem(KEY);
    return text
      ? E.validateDraft(JSON.parse(text))
      : {
          version: 1,
          changes: [],
        };
  }

  function persist(next) {
    requireOwner();
    next = E.materializeDraft(published, next);
    localStorage.setItem(KEY, JSON.stringify(next));
    draft = next;
    refresh();
  }

  function refresh() {
    DATA.entries = ownerToken ? E.applyDraft(published, draft) : E.clone(published);
    refreshIndex();
    notice.textContent = draft.changes.length
      ? draft.changes.length + ' 件の未公開の変更（この端末に保存済み）'
      : '';
    manage.disabled = !draft.changes.length;
    backup.disabled = !draft.changes.length;
  }

  function fail(error) {
    if (!ownerToken) return;
    notice.textContent = error.message;
    render();
  }

  function deleteEntry() {
    try {
      requireOwner();
      const target = DATA.entries.find((e) => e.id === working.id);
      if (!target) throw new Error('この語は既に削除されています。');
      if (!confirm('「' + target.head + '」を削除しますか？ この語への関連リンクも削除します。'))
        return;
      const latest = readDraft(),
        current = latest.changes.find((c) => E.changeId(c) === working.id) || null;
      if (!E.equal(current, openingChange))
        throw new Error('別のタブでこの語を編集しています。開き直してください。');
      persist(E.deleteDraft(published, latest, working.id));
      editor.close();
      reset();
      render();
      if (draft.changes.length) showChanges();
    } catch (error) {
      errors.textContent = error.message;
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errors.textContent = '';
    try {
      requireOwner();
      if (entryKind() === '接辞' && head.value.trim()) {
        head.value =
          kind.value === '接頭辞'
            ? head.value.replace(/^-|-$/g, '') + '-'
            : '-' + head.value.replace(/^-|-$/g, '');
      }
      autocomplete(false);
      if (automaticError) throw new Error(automaticError);
      const e = {
        ...working,
        head: head.value.trim().normalize('NFC'),
        kind: entryKind(),
        pos: pos.value,
        gender: gender.disabled ? '' : gender.value,
        class: cls.disabled ? '' : cls.value,
        numberRestriction: number.disabled ? '' : number.value,
        numeralType: numeral.disabled ? '' : numeral.value,
        meaning: readSenses()
          .map((s) => s.meaning)
          .join('\n'),
        senseTags: readSenses().filter((s) => s.tags.length),
        protoForms: proto.value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => (s.startsWith('*') ? s : '*' + s)),
      };
      const extraValues = [
        e.pos === '名詞' && personName.value ? '人名' : '',
        e.pos === '動詞' && irregular.value ? '不規則活用' : '',
        e.pos === '動詞' && model.settings.impersonal ? '無主語' : '',
      ].filter(Boolean);
      if (['名詞', '動詞', '形容詞', '代名詞'].includes(e.pos)) e.inflection = E.clone(model);
      else delete e.inflection;
      e.tags = E.tags(e, extraValues);
      E.validate(e);
      E.apply(DATA.entries, [e]);
      const latest = readDraft(),
        current = latest.changes.find((c) => E.changeId(c) === e.id) || null;
      if (!E.equal(current, openingChange))
        throw new Error('別のタブでこの語を編集しています。入力を控え、開き直してください。');
      persist(E.updateDraft(published, latest, e));
      editor.close();
      showEntry(e.id);
      if (event.submitter !== saveDraft) showChanges();
    } catch (error) {
      errors.textContent =
        error.name === 'QuotaExceededError'
          ? '端末に保存する空き容量がありません。入力内容を控えてください。'
          : error.message;
    }
  });
  const changesDialog = dialog('changes-dialog', '未公開の変更を公開'),
    changesList = node('div'),
    publishStatus = node('p', '', 'edit-status');
  publishStatus.setAttribute('role', 'status');
  publishStatus.id = 'publish-status';
  const publish = button('公開する', publishDraft, 'primary');
  publish.id = 'publish-edits';
  const close = button('閉じる', () => changesDialog.close());
  changesDialog.append(changesList, publishStatus, publish, close);
  let publishing = false;
  changesDialog.addEventListener('cancel', (e) => {
    if (publishing) e.preventDefault();
  });

  function showChanges() {
    if (!ownerToken) return;
    changesList.replaceChildren();
    publishStatus.replaceChildren();
    for (const c of draft.changes) {
      const row = node('div', undefined, 'change-row'),
        entry = c.after || c.before;
      row.append(
        node('span', entry.head + '（' + (!c.after ? '削除' : c.before ? '編集' : '追加') + '）'),
      );
      if (c.after)
        row.append(
          button('編集', () => {
            changesDialog.close();
            openEditor(entry.id);
          }),
        );
      row.append(
        button('変更を取り消す', () => {
          if (!confirm(entry.head + ' の未公開の変更を取り消しますか？')) return;
          try {
            persist(E.revertDraft(published, readDraft(), entry.id));
            showChanges();
          } catch (e) {
            publishStatus.textContent = e.message;
          }
        }),
      );
      changesList.append(row);
    }
    publish.disabled = !draft.changes.length;
    if (!changesDialog.open) changesDialog.showModal();
  }
  async function publishDraft() {
    if (!ownerToken) return;
    const changes = E.clone(draft.changes);
    publishing = true;
    [...changesDialog.querySelectorAll('button')].forEach((b) => (b.disabled = true));
    try {
      const result = await LafcaGitHub.publish(
        changes,
        ownerToken,
        (m) => (publishStatus.textContent = m),
      );
      if (!ownerToken) return;
      // Retain any edits made in other tabs while the request was in flight.
      const latest = readDraft();
      latest.changes = latest.changes.filter((c) => !changes.some((sent) => E.equal(sent, c)));
      published = E.clone(result.entries);
      persist(latest);
      publishStatus.replaceChildren(
        node('span', 'GitHubに保存しました。公開ページへの反映には少し時間がかかります。 '),
      );
      const a = node('a', '保存した変更');
      a.href = result.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      publishStatus.append(a);
      changesList.replaceChildren();
    } catch (error) {
      if (error.code === 'AUTH') {
        logout();
        showLogin(error.message);
      } else publishStatus.textContent = error.message;
    } finally {
      publishing = false;
      [...changesDialog.querySelectorAll('button')].forEach((b) => (b.disabled = false));
      publish.disabled = !draft.changes.length;
    }
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(
        new Blob([text], {
          type,
        }),
      ),
      a = node('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  importInput.addEventListener('change', async () => {
    try {
      requireOwner();
      const file = importInput.files[0];
      if (!file) return;
      if (file.size > 10_000_000) throw new Error('ファイルが大きすぎます。');
      const imported = E.validateDraft(JSON.parse(await file.text())),
        latest = readDraft();
      for (const c of imported.changes) {
        const old = latest.changes.find((x) => E.changeId(x) === E.changeId(c));
        if (old && !E.equal(old, c))
          throw new Error('この端末の変更と重複しています：' + (c.after || c.before).head);
        if (!old) latest.changes.push(c);
      }
      E.applyDraft(published, latest);
      persist(latest);
    } catch (e) {
      fail(e);
    } finally {
      importInput.value = '';
    }
  });
  window.addEventListener('storage', (event) => {
    if (ownerToken && event.key === KEY) {
      try {
        draft = readDraft();
        refresh();
      } catch (e) {
        fail(e);
      }
    }
  });
  window.lafcaEditControls = (e) => {
    const controls = node('div', undefined, 'entry-edit-controls');
    if (ownerToken && editing)
      controls.append(
        button('編集', () => openEditor(e.id)),
        button('複製して追加', () => openEditor(e.id, true)),
      );
    return controls;
  };
  refresh();
})();
