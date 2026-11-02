/* Lafca grammar §§1.4, 2.2.4–2.2.7, 2.4.2–2.4.9. */
(function (root) {
  'use strict';
  const V = 'aeiouäöü',
    CASES = ['主格', '属格', '与格', '奪格', '再帰格'];
  const PATTERNS = ['auto', 'consonant', 'a', 'o', 'short', 'glide', 'plural-a', 'plural-i', 'aq'];
  const STRINGS = [
    'nounPattern',
    'obliqueStem',
    'strongStem',
    'presentStem',
    'adjectiveStem',
    'femaleStem',
    'neuterStem',
    'neuterForm',
    'conjugation',
    'pronounPattern',
  ];
  const BOOLEANS = ['impersonal', 'gerundDeclension'];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const forms = (e) => e.tables.flatMap((t) => t.rows.flatMap((r) => r.cells));
  const map = (e) => Object.fromEntries(forms(e).map((f) => [f.label, f.value]));
  const stem = (s) => (s || '').trim().normalize('NFC').replace(/-$/, '');
  const vowel = (s) => Boolean(s) && V.includes(s.slice(-1));

  function umlaut(s) {
    for (let i = s.length - 1; i >= 0; i--)
      if (V.includes(s[i].toLowerCase()))
        return (
          s.slice(0, i) +
          ({
            a: 'ä',
            o: 'ö',
            u: 'ü',
            A: 'Ä',
            O: 'Ö',
            U: 'Ü',
          }[s[i]] || s[i]) +
          s.slice(i + 1)
        );
    return s;
  }

  function join(s, ending) {
    return (
      s + (vowel(s) && vowel(ending[0]) ? ('ieäüö'.includes(s.slice(-1)) ? 'j' : 'w') : '') + ending
    );
  }

  function bare(s) {
    return s.endsWith('g')
      ? s.slice(0, -1) + ('nrl'.includes(s.slice(-2, -1)) && s.length > 1 ? 'k' : 'q')
      : s.endsWith('c')
        ? s.slice(0, -1) + 'k'
        : s;
  }

  function change(s, a, b) {
    const i = s.lastIndexOf(a);
    if (i < 0) throw Error(a + '/' + b + '交替の語幹を入力してください。');
    return s.slice(0, i) + b + s.slice(i + 1);
  }

  function participle(s) {
    let body;
    if (s.endsWith('bb')) body = s.slice(0, -2) + 'pt';
    else if (s.endsWith('nd')) body = s.slice(0, -2) + 'nt';
    else if (s.endsWith('ld')) body = s.slice(0, -2) + 'lt';
    else if (s.endsWith('d')) body = s.slice(0, -1) + 'tt';
    else if (/[sšžt]$/.test(s)) body = s + 'et';
    else if (/[^aeiouäöürlmnwj][rl]$/.test(s)) body = s.slice(0, -1) + 'e' + s.slice(-1) + 't';
    else
      body =
        s.slice(0, -1) +
        ({
          g: 'ct',
          v: 'ft',
          b: 'pt',
          q: 'ht',
        }[s.slice(-1)] || s.slice(-1) + 't');
    return join('di', body);
  }

  function table(title, columns, labels, values) {
    return {
      title,
      columns,
      rows: labels.map(([label, keys]) => ({
        label,
        cells: keys.map((k) => ({
          label: k,
          value: values[k],
        })),
      })),
    };
  }

  function single(title, keys, values) {
    return table(
      title,
      ['語形'],
      keys.map((k) => [k, [k]]),
      values,
    );
  }

  function nounPattern(e, o) {
    if (o.nounPattern && o.nounPattern !== 'auto') return o.nounPattern;
    if (e.numberRestriction === 'plural' && e.head.endsWith('a')) return 'plural-a';
    if (e.numberRestriction === 'plural' && e.head.endsWith('i')) return 'plural-i';
    if (e.gender === 'F' && e.head.endsWith('a')) return 'a';
    if (e.gender === 'M' && e.head.endsWith('o')) return 'o';
    if (vowel(e.head))
      return (e.gender === 'F' && e.head.endsWith('ü')) || e.head.endsWith('ö') ? 'glide' : 'short';
    return 'consonant';
  }

  function nounStem(e, o, p) {
    if (stem(o.obliqueStem)) return stem(o.obliqueStem);
    if (['Ⅰ型', 'Ⅱ型', '不規則型'].includes(e.class)) throw Error('斜格語幹を入力してください。');
    if (['a', 'o', 'short', 'plural-a', 'plural-i'].includes(p)) return e.head.slice(0, -1);
    if (p === 'aq') return e.head;
    if (e.head.endsWith('q'))
      throw Error('語末 q を保つか g に戻すか、斜格語幹で指定してください。');
    if (e.head.endsWith('k')) return e.head.slice(0, -1) + (/n[k]$/.test(e.head) ? 'g' : 'c');
    return e.head;
  }

  function noun(e, o) {
    const p = nounPattern(e, o),
      s = nounStem(e, o, p),
      values = {},
      numbers =
        e.numberRestriction === 'singular'
          ? ['単数']
          : e.numberRestriction === 'plural'
            ? ['複数']
            : ['単数', '複数'];
    if (!s) throw Error('斜格語幹を入力してください。');
    if (['plural-a', 'plural-i'].includes(p) && e.numberRestriction !== 'plural')
      throw Error('集合名詞の語尾には「複数のみ」を指定してください。');
    for (let i = 0; i < CASES.length; i++) {
      let sg, pl;
      if (p === 'plural-a' || p === 'plural-i') {
        pl =
          i === 0
            ? e.head
            : join(
                s,
                (p === 'plural-a'
                  ? ['a', 'an', 'ar', 'o', 'al']
                  : ['i', 'ins', 'irs', 'us', 'ils'])[i],
              );
      } else if (p === 'short') {
        const v = e.head.slice(-1);
        if (!V.includes(v)) throw Error('短語尾母音幹の見出しは母音で終わります。');
        sg = s + [v, v + 'n', v + 'r', e.gender === 'F' && v === 'ä' ? 'o' : 'u', v + 'l'][i];
        pl = sg + (e.gender === 'N' && i === 0 ? '' : 's');
      } else if (p === 'a' || p === 'o') {
        const ending = (p === 'a' ? ['a', 'an', 'ar', 'o', 'al'] : ['o', 'on', 'or', 'u', 'ol'])[i];
        sg = i === 0 ? e.head : join(s, ending);
        pl = join(s, ending) + 's';
      } else if (p === 'aq') {
        sg = e.head + ['', 'en', 'er', 'u', 'el'][i];
        pl = e.head + ['es', 'ens', 'ers', 'us', 'els'][i];
      } else {
        sg = i === 0 ? e.head : join(i === 2 ? umlaut(s) : s, ['', 'en', 'er', 'u', 'el'][i]);
        const ending = (
          e.gender === 'N' ? ['i', 'ins', 'irs', 'us', 'ils'] : ['es', 'ens', 'ers', 'us', 'els']
        )[i];
        pl = join(e.gender !== 'N' && i === 2 ? umlaut(s) : s, ending);
      }
      values['単数' + CASES[i]] = sg;
      values['複数' + CASES[i]] = pl;
    }
    return [
      table(
        '曲用',
        numbers,
        CASES.map((c) => [c, numbers.map((n) => n + c)]),
        values,
      ),
    ];
  }

  function verb(e, o, overrides) {
    const [lemma, ...rest] = e.head.split(' '),
      tail = rest.length ? ' ' + rest.join(' ') : '';
    const type = e.class || o.conjugation || '非交替',
      isVowel = type === '母音幹',
      pair = type.match(/^([aeo])\/([eiu])交替$/),
      values = {
        不定形: lemma,
      };
    let strong = stem(o.strongStem),
      weak = stem(o.presentStem);
    if (isVowel) {
      weak =
        weak ||
        {
          jen: 'ji',
          bajen: 'ba',
        }[lemma] ||
        (lemma.endsWith('n') ? lemma.slice(0, -1) : vowel(lemma) ? lemma : '');
      if (!weak || !vowel(weak)) throw Error('母音で終わる現在語幹を入力してください。');
      const a = weak.endsWith('e') ? weak.slice(0, -1) + 'a' : weak;
      Object.assign(values, {
        現在1単数: a + 's',
        現在2単数: weak + 'č',
        現在3単数: weak,
        現在1複数: weak + 'v',
        現在2複数: weak + 'g',
        現在3複数: weak + 'si',
        アオリスト: weak + 't',
        命令単数: weak,
        命令複数: weak + 'g',
        接続法: weak + 's',
        条件法: a + 'n',
        動名詞: weak + 'd',
        過去分詞: join('di', weak + 't'),
      });
    } else {
      strong = strong || (lemma.endsWith('en') ? lemma.slice(0, -2) : '');
      if (!strong) throw Error('強語幹を入力してください。');
      weak = weak || (pair ? change(strong, pair[1], pair[2]) : strong);
      const verbBare = (s) =>
        /[^aeiouäöürlmnwj][rl]$/.test(s) ? s.slice(0, -1) + 'e' + s.slice(-1) : bare(s);
      const thirdPlural = /[dt]$/.test(weak)
        ? weak.slice(0, -1) + 'ži'
        : /[sž]$/.test(weak)
          ? weak + 'i'
          : /[^aeiouäöürlmnwj][rl]$/.test(weak)
            ? weak.slice(0, -1) + 'e' + weak.slice(-1) + 'si'
            : weak + 'si';
      Object.assign(values, {
        現在1単数: join(weak, 'as'),
        現在2単数: join(weak, 'eč'),
        現在3単数: verbBare(weak),
        現在1複数: join(weak, 'ev'),
        現在2複数: join(weak, 'eg'),
        現在3複数: thirdPlural,
        アオリスト: pair ? verbBare(strong) : join(strong, 'it'),
        命令単数: verbBare(strong),
        命令複数: join(strong, 'eg'),
        接続法: join(weak, 'es'),
        条件法: join(strong, 'an'),
        動名詞: join(weak, 'ad'),
        過去分詞: participle(weak),
      });
    }
    if (isVowel) {
      // Lexical irregularities specified in grammar §2.4.8.
      const special = {
        len: {
          アオリスト: 'lit',
          動名詞: 'lad',
          過去分詞: 'dilt',
        },
        zen: {
          アオリスト: 'zit',
          過去分詞: 'dizit',
        },
        jen: {
          現在1単数: 'jas',
          アオリスト: 'je',
          命令単数: 'ja',
          命令複数: 'jag',
          接続法: 'jes',
          条件法: 'jan',
          動名詞: 'jad',
          過去分詞: 'dijet',
        },
      };
      Object.assign(values, special[lemma] || {});
    }
    for (const k of Object.keys(values)) values[k] += tail;
    Object.assign(values, overrides);
    const current = o.impersonal
      ? single('現在', ['現在3単数'], values)
      : table(
          '現在の人称活用',
          ['単数', '複数'],
          [1, 2, 3].map((p) => [p + '人称', ['現在' + p + '単数', '現在' + p + '複数']]),
          values,
        );
    const labels = [
      '不定形',
      'アオリスト',
      ...(!o.impersonal ? ['命令単数', '命令複数'] : []),
      '接続法',
      '条件法',
      ...(!tail ? ['動名詞', '過去分詞'] : []),
    ];
    const tables = [current, single('時制・法・非定形', labels, values)];
    if (o.gerundDeclension && !tail) {
      const gerund = values['動名詞'];
      if (gerund && /^[A-Za-zÄÖÜŠŽČäöüšžč]+$/.test(gerund)) {
        const t = noun(
          {
            head: gerund,
            gender: 'N',
            class: '固定型',
            numberRestriction: '',
          },
          {
            nounPattern: 'consonant',
            obliqueStem: gerund,
          },
        )[0];
        t.title = '動名詞の曲用';
        for (let i = 0; i < t.rows.length; i++)
          for (const f of t.rows[i].cells) {
            if (f.label.startsWith('複数') && i !== 3)
              f.value = join(umlaut(gerund), ['i', 'ins', 'irs', 'us', 'ils'][i]);
            f.label = '動名詞' + f.label;
          }
        tables.push(t);
      }
    }
    return tables;
  }

  function adjective(e, o) {
    const s =
      stem(o.adjectiveStem) ||
      (e.head.endsWith('q') || e.head.endsWith('nk')
        ? e.head.slice(0, -1) + 'g'
        : e.head.endsWith('k')
          ? e.head.slice(0, -1) + 'c'
          : e.head);
    const female = stem(o.femaleStem) || s,
      neuter = stem(o.neuterStem) || umlaut(s),
      values = {};
    values['男性単数主格'] = e.head;
    values['女性単数主格'] = join(female, 'a');
    values['中性単数主格'] = stem(o.neuterForm) || bare(neuter);
    for (let i = 0; i < CASES.length; i++) {
      const c = CASES[i];
      if (i) {
        values['男性単数' + c] = join(i === 2 ? umlaut(s) : s, ['', 'en', 'er', 'u', 'el'][i]);
        values['女性単数' + c] = join(female, ['', 'an', 'ar', 'o', 'al'][i]);
        values['中性単数' + c] = join(neuter, ['', 'en', 'er', 'u', 'el'][i]);
      }
      values['男性複数' + c] = join(i === 2 ? umlaut(s) : s, ['es', 'ens', 'ers', 'us', 'els'][i]);
      values['中性複数' + c] = values['男性複数' + c];
      values['女性複数' + c] = join(female, ['as', 'ans', 'ars', 'os', 'als'][i]);
    }
    const tables = ['単数', '複数'].map((n) =>
      table(
        '性・格の一致（' + n + '）',
        ['男性', '女性', '中性'],
        CASES.map((c) => [c, ['男性', '女性', '中性'].map((g) => g + n + c)]),
        values,
      ),
    );
    if (!e.numeralType) {
      Object.assign(values, {
        比較級: join(s, 'ar'),
        最上級: 'uc' + e.head,
        文語最上級: join(umlaut(s), 'ist'),
        副詞形: join(s, 'u'),
      });
      tables.push(single('比較・派生', ['比較級', '最上級', '文語最上級', '副詞形'], values));
    }
    return tables;
  }

  function pronoun(e, o) {
    if (o.pronounPattern === 'none' || (o.pronounPattern !== 'caq' && e.head !== 'čaq')) return [];
    const values = {},
      cases = ['主格', '属格', '対格', '与格', '奪格', '再帰格'];
    cases.forEach((c, i) => (values['単数' + c] = e.head + ['', 'en', 'et', 'er', 'ü', 'el'][i]));
    return [
      table(
        '曲用',
        ['単数'],
        cases.map((c) => [c, ['単数' + c]]),
        values,
      ),
    ];
  }

  function generate(e, o = {}, overrides = {}) {
    if (!e.head) return [];
    if (!/^-?[A-Za-zÄÖÜŠŽČäöüšžč]+(?: [A-Za-zÄÖÜŠŽČäöüšžč]+)*-?$/.test(e.head))
      throw Error('見出し語を入力してください。');
    if (e.kind === '接辞') return [];
    const tables =
      e.pos === '名詞'
        ? noun(e, o)
        : e.pos === '動詞'
          ? verb(e, o, overrides)
          : e.pos === '形容詞'
            ? adjective(e, o)
            : e.pos === '代名詞'
              ? pronoun(e, o)
              : [];
    for (const t of tables)
      for (const r of t.rows)
        for (const f of r.cells)
          if (Object.hasOwn(overrides, f.label)) f.value = overrides[f.label];
    return tables;
  }

  function infer(e) {
    if (e.inflection) return clone(e.inflection);
    const f = map(e),
      o = {},
      head = e.head,
      first = (v) => (v || '').split(' ')[0],
      cut = (v, ending) => (v && v.endsWith(ending) ? v.slice(0, -ending.length) : '');
    if (e.pos === '名詞') {
      let p = nounPattern(e, {});
      if (e.numberRestriction === 'plural')
        p = head.endsWith('a') ? 'plural-a' : head.endsWith('i') ? 'plural-i' : 'consonant';
      else if (f['単数属格'] === head + 'n' && vowel(head))
        p = head.endsWith('a') ? 'a' : head.endsWith('o') ? 'o' : 'short';
      else if (vowel(head) && f['単数属格']?.endsWith('en')) p = 'glide';
      if (
        head.length > 3 &&
        head.endsWith('aq') &&
        f['単数与格'] === head + 'er' &&
        f['複数主格'] === head + 'es'
      )
        p = 'aq';
      o.nounPattern = p === nounPattern(e, {}) ? 'auto' : p;
      const gen = f[(e.numberRestriction === 'plural' ? '複数' : '単数') + '属格'];
      let s = cut(
        gen,
        p === 'plural-i'
          ? 'ins'
          : p === 'plural-a' || p === 'a'
            ? 'an'
            : p === 'o'
              ? 'on'
              : p === 'short'
                ? head.slice(-1) + 'n'
                : 'en',
      );
      // Preserve lexical stem alternations, while allowing regular stems to follow a renamed lemma.
      let defaultStem;
      try {
        defaultStem = nounStem(
          e,
          {
            nounPattern: p,
          },
          p,
        );
      } catch {}
      if (s && s !== defaultStem) o.obliqueStem = s;
    } else if (e.pos === '動詞') {
      const lemma = head.split(' ')[0],
        p3 = first(f['現在3単数']);
      const type = e.class || (vowel(p3) ? '母音幹' : '非交替');
      o.conjugation = type;
      if (type === '母音幹') {
        const regular = lemma.endsWith('n') ? lemma.slice(0, -1) : lemma;
        if (p3 && p3 !== regular) o.presentStem = p3;
      } else {
        const strong = lemma.endsWith('en') ? lemma.slice(0, -2) : '',
          pair = type.match(/^([aeo])\/([eiu])交替$/);
        let regular;
        try {
          regular = pair ? change(strong, pair[1], pair[2]) : strong;
        } catch {}
        const weak = cut(first(f['現在1単数']), 'as');
        if (weak && weak !== regular) o.presentStem = weak;
      }
      o.impersonal = e.tags.includes('無主語');
      o.gerundDeclension = Object.keys(f).some((l) => l.startsWith('動名詞単数'));
    } else if (e.pos === '形容詞') {
      const s =
        head.endsWith('q') || head.endsWith('nk')
          ? head.slice(0, -1) + 'g'
          : head.endsWith('k')
            ? head.slice(0, -1) + 'c'
            : head;
      const female = cut(f['女性単数属格'], 'an'),
        neuter = cut(f['中性単数属格'], 'en');
      if (female && female !== s) o.femaleStem = female;
      if (neuter && neuter !== umlaut(s)) o.neuterStem = neuter;
      if (f['中性単数主格'] && f['中性単数主格'] !== bare(neuter || umlaut(s)))
        o.neuterForm = f['中性単数主格'];
    }
    if (e.pos === '代名詞' && e.head === 'čaq') o.pronounPattern = 'caq';
    let generated = {};
    try {
      generated = map({
        tables: generate(e, o),
      });
    } catch {}
    const overrides = {};
    for (const [label, value] of Object.entries(f))
      if (Object.hasOwn(generated, label) && generated[label] !== value) overrides[label] = value;
    const omitted = Object.keys(generated).filter((k) => !Object.hasOwn(f, k));
    return {
      version: 1,
      settings: o,
      overrides,
      omitted,
    };
  }

  function update(e, model, oldGenerated = []) {
    const generated = generate(e, model.settings, model.overrides),
      oldKeys = new Set(
        forms({
          tables: oldGenerated,
        }).map((f) => f.label),
      ),
      newKeys = new Set(
        forms({
          tables: generated,
        }).map((f) => f.label),
      );
    const excluded = {
      singular: '複数',
      plural: '単数',
    }[e.numberRestriction];
    const allowed = (f) =>
      !model.omitted.includes(f.label) && (!excluded || !f.label.includes(excluded));
    // Keep original grid layouts and custom tables, updating only generated cells.
    const values = map({
        tables: generated,
      }),
      seen = new Set(),
      tables = [];
    for (const t of e.tables) {
      const rows = [];
      for (const r of t.rows) {
        const cells = r.cells
          .filter((f) => allowed(f) && (newKeys.has(f.label) || !oldKeys.has(f.label)))
          .map((f) => {
            seen.add(f.label);
            return {
              label: f.label,
              value: Object.hasOwn(values, f.label) ? values[f.label] : f.value,
            };
          });
        if (cells.length)
          rows.push({
            ...r,
            cells,
          });
      }
      if (rows.length) {
        if (rows.some((r) => r.cells.length !== t.columns.length))
          tables.push(
            single(
              t.title,
              rows.flatMap((r) => r.cells).map((f) => f.label),
              Object.fromEntries(rows.flatMap((r) => r.cells).map((f) => [f.label, f.value])),
            ),
          );
        else
          tables.push({
            ...t,
            rows,
          });
      }
    }
    for (const t of generated) {
      const remaining = forms({
        tables: [t],
      }).filter((f) => allowed(f) && !seen.has(f.label));
      if (!remaining.length) continue;
      if (
        remaining.length ===
        forms({
          tables: [t],
        }).length
      )
        tables.push(t);
      else
        tables.push(
          single(
            t.title,
            remaining.map((f) => f.label),
            Object.fromEntries(remaining.map((f) => [f.label, f.value])),
          ),
        );
    }
    return {
      tables,
      generated,
    };
  }

  function validate(model) {
    if (
      !model ||
      model.version !== 1 ||
      !model.settings ||
      typeof model.settings !== 'object' ||
      Array.isArray(model.settings) ||
      !model.overrides ||
      typeof model.overrides !== 'object' ||
      Array.isArray(model.overrides) ||
      !Array.isArray(model.omitted)
    )
      throw Error('自動補完の設定が不正です。');
    if (
      Object.keys(model).some((k) => !['version', 'settings', 'overrides', 'omitted'].includes(k))
    )
      throw Error('自動補完の設定が不正です。');
    for (const [k, v] of Object.entries(model.settings)) {
      if (STRINGS.includes(k)) {
        if (typeof v !== 'string' || (k === 'nounPattern' && !PATTERNS.includes(v)))
          throw Error('語幹の設定が不正です。');
        if (
          k === 'conjugation' &&
          !['', 'a/e交替', 'e/i交替', 'o/u交替', '非交替', '母音幹'].includes(v)
        )
          throw Error('活用分類が不正です。');
        if (k === 'pronounPattern' && !['none', 'caq'].includes(v))
          throw Error('代名詞の曲用規則が不正です。');
        if (
          !['nounPattern', 'conjugation', 'pronounPattern'].includes(k) &&
          v &&
          !/^[A-Za-zÄÖÜŠŽČäöüšžč]+-?$/.test(v)
        )
          throw Error('語幹はラフカ語で入力してください。');
      } else if (!BOOLEANS.includes(k) || typeof v !== 'boolean')
        throw Error('自動補完の設定が不正です。');
    }
    if (
      Object.entries(model.overrides).some(
        ([k, v]) => !k.trim() || typeof v !== 'string' || !v.trim(),
      ) ||
      model.omitted.some((v) => typeof v !== 'string' || !v.trim())
    )
      throw Error('語形の補完設定が不正です。');
    return model;
  }
  const api = {
    generate,
    infer,
    update,
    validate,
    forms,
    map,
    umlaut,
    join,
    bare,
    nounPattern,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.LafcaMorphology = api;
})(globalThis);
