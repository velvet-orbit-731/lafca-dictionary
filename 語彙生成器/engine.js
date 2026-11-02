/* Lafca2 §9 の有限な候補生成。辞書照合と推測を別の結果種別にする。 */
(function (root) {
  'use strict';
  const Proto = typeof module !== 'undefined' && module.exports ? require('./proto.js') : root.LafcaProto;
  const ProtoParadigm = typeof module !== 'undefined' && module.exports ? require('./proto-paradigm.js') : root.LafcaProtoParadigm;
  const V = new Set([...'aeiouäöü']);
  const FRONT = new Set([...'eiäöü']);
  const SHORT = new Set([...'aeiou']);
  const LONG = {
    ā: 'a',
    ē: 'ä',
    ī: 'i',
    ō: 'o',
    ū: 'ü',
  };
  const QLONG = {
    ā: 'a',
    ē: 'e',
    ī: 'i',
    ō: 'o',
    ū: 'u',
  };
  const DIP = {
    au: 'o',
    ao: 'o',
    aw: 'o',
    ew: 'ü',
    ai: 'e',
    aj: 'e',
    ei: 'i',
    ej: 'i',
    oi: 'ö',
    oj: 'ö',
    á: 'e',
    ó: 'o',
    ø: 'ö',
  };
  const UML = {
    a: 'ä',
    o: 'ö',
    u: 'ü',
  };
  const PROTECTED = new Set(['sw', 'šw', 'gw', 'kw', 'hw', 'tw', 'dw']);
  const DEFAULTS = {
    language: 'auto',
    pos: 'auto',
    long: 'all',
    i: 'all',
    p: 'all',
    ending: 'all',
    shortening: 'all',
    boundary: 'all',
    gender: 'all',
    grade: 'all',
    limit: 50000,
  };
  class Incomplete extends Error {}

  function norm(s) {
    return s.normalize('NFC').trim().toLowerCase();
  }

  function clone(ts) {
    return ts.map((t) => ({
      ...t,
    }));
  }
  const c = (s, at = -1) => ({
    kind: 'c',
    s,
    raw: s,
    at,
  });
  const v = (s, raw = s, at = -1, extra = {}) => ({
    kind: 'v',
    s,
    raw,
    at,
    short: SHORT.has(raw),
    ...extra,
  });
  const spelling = (ts) =>
    ts.map((t, i) => (t.s === 'k' ? (i === ts.length - 1 ? 'k' : 'c') : t.s)).join('');
  const lastV = (ts) => {
    for (let i = ts.length - 1; i >= 0; i--) if (ts[i].kind === 'v') return i;
    return -1;
  };

  function umlaut(ts) {
    const a = clone(ts),
      i = lastV(a);
    if (i >= 0 && UML[a[i].s]) a[i].s = UML[a[i].s];
    return a;
  }

  function rank(s) {
    return 'mn'.includes(s) ? 2 : 'rl'.includes(s) ? 3 : 'wj'.includes(s) ? 4 : 1;
  }

  function compact(cs) {
    return cs.filter((s, i) => !i || s !== cs[i - 1]);
  }

  function onset(cs) {
    if (cs.length > 3) return false;
    cs = compact(cs);
    if (cs.length > 1 && ['s', 'š'].includes(cs[0])) cs = cs.slice(1);
    return cs.every((s, i) => !i || rank(cs[i - 1]) < rank(s));
  }

  function coda(cs, final = false) {
    if (cs.length > 3) return false;
    cs = compact(cs);
    if (final && cs.join('') === 'sk') return true;
    while (cs.length > 1 && ['t', 's'].includes(cs.at(-1))) cs.pop();
    return cs.every((s, i) => !i || rank(cs[i - 1]) > rank(s));
  }

  function phonotactics(ts) {
    const nuclei = [];
    ts.forEach((t, i) => {
      if (t.kind === 'v') nuclei.push(i);
    });
    if (!nuclei.length) return false;
    if (!onset(ts.slice(0, nuclei[0]).map((t) => t.s))) return false;
    if (
      !coda(
        ts.slice(nuclei.at(-1) + 1).map((t) => t.s),
        true,
      )
    )
      return false;
    for (let n = 1; n < nuclei.length; n++) {
      const cs = ts.slice(nuclei[n - 1] + 1, nuclei[n]).map((t) => t.s);
      if (!cs.length) return false;
      let ok = false;
      for (let k = 0; k <= cs.length; k++)
        if (coda(cs.slice(0, k)) && onset(cs.slice(k))) {
          ok = true;
          break;
        }
      if (!ok) return false;
    }
    return true;
  }

  function bare(ts) {
    const a = clone(ts);
    if (a.at(-1)?.s === 'g') {
      const prev = a.at(-2);
      if (prev?.kind === 'v') a.at(-1).s = 'q';
      else if (prev && ['n', 'r', 'l'].includes(prev.s)) a.at(-1).s = 'k';
      else return null;
    }
    return a;
  }

  function fromModern(s) {
    const out = [];
    for (let i = 0; i < s.length; ) {
      const unit = s.startsWith('pf', i) ? 'pf' : s[i];
      i += unit.length;
      out.push(V.has(unit) ? v(unit) : c(unit === 'c' ? 'k' : unit));
    }
    return out;
  }

  function suffix(ts, ending) {
    const a = clone(ts),
      b = fromModern(ending);
    if (a.at(-1)?.kind === 'v' && b[0]?.kind === 'v') a.push(c(FRONT.has(a.at(-1).s) ? 'j' : 'w'));
    return [...a, ...b];
  }

  function surface(ts) {
    const a = bare(ts);
    return a ? spelling(a) : null;
  }

  function variants(arr, choices, fn, budget) {
    const out = [];
    for (const item of arr)
      for (const choice of choices) {
        out.push(fn(item, choice));
        if (out.length > budget)
          throw new Incomplete(
            '分岐が上限を超えたため、全列挙を完了できませんでした。長母音・短 i・短縮などの条件を絞ってください。',
          );
      }
    return out;
  }

  function tokenize(input, options) {
    const result = [];

    function walk(i, ts, trace) {
      options._tick?.();
      if (result.length > options.limit)
        throw new Incomplete('音の区切りの分岐が多すぎます。区切りを既定に限定してください。');
      if (i === input.length) {
        result.push({
          ts,
          trace,
        });
        return;
      }
      const rest = input.slice(i);
      const multi = [
        ['sch', 'sč'],
        ['spf', 'sp'],
        ['sh', 'š'],
        ['ch', 'č'],
        ['pf', 'p'],
      ].find(([a]) => rest.startsWith(a));
      if (multi) {
        const [a, b] = multi;
        const units = [...b].map((sound, offset) => c(sound, i + offset));
        walk(i + a.length, [...ts, ...units], [...trace, `${a} → ${b}（位置 ${i + 1}）`]);
        return;
      }
      const pair = input.slice(i, i + 2);
      if (pair.length === 2 && DIP[pair]) {
        const glide = ['w', 'j'].includes(pair[1]);
        const followedByV = /[aeiouāēīōūáóø]/u.test(input[i + 2] || '!');
        const maySplit = glide && (options.boundary === 'all' || followedByV);
        const dipTrace = `${pair} → ${DIP[pair]}（二重母音、位置 ${i + 1}）`;
        if (!glide || !followedByV || options.boundary === 'all')
          walk(
            i + 2,
            [
              ...ts,
              v(DIP[pair], pair, i, {
                short: false,
                diph: pair,
              }),
            ],
            [...trace, dipTrace],
          );
        if (maySplit)
          walk(
            i + 2,
            [...ts, v(pair[0], pair[0], i), c(pair[1], i + 1)],
            [...trace, `${pair[0]}.${pair[1]}（子音として区切る、位置 ${i + 1}）`],
          );
        return;
      }
      const x = input[i];
      if (LONG[x])
        walk(
          i + 1,
          [
            ...ts,
            v(LONG[x], x, i, {
              short: false,
              long: x,
            }),
          ],
          trace,
        );
      else if (DIP[x])
        walk(
          i + 1,
          [
            ...ts,
            v(DIP[x], x, i, {
              short: false,
              diph: x,
            }),
          ],
          [...trace, `${x} → ${DIP[x]}（位置 ${i + 1}）`],
        );
      else if (SHORT.has(x)) walk(i + 1, [...ts, v(x, x, i)], trace);
      else if (x === 'p')
        walk(
          i + 1,
          [
            ...ts,
            {
              ...c(x, i),
              pChoice: true,
            },
          ],
          trace,
        );
      else
        walk(
          i + 1,
          [...ts, c(x === 'c' ? 'ž' : x === 'k' ? 'k' : x, i)],
          x === 'c' ? [...trace, `c → ž（位置 ${i + 1}）`] : trace,
        );
    }
    walk(0, [], []);
    return result;
  }

  function lexicalBranches(states, options) {
    let out = [];
    for (const original of states) {
      let parts = [original];
      const sites = original.ts
        .filter((t) => t.long || t.raw === 'i' || t.pChoice)
        .map((t) => t.at);
      for (const at of sites) {
        const token = original.ts.find((t) => t.at === at);
        let choices;
        if (token.long) choices = options.long === 'all' ? ['plain', 'q'] : [options.long];
        else if (token.pChoice) choices = options.p === 'all' ? ['p', 'pf'] : [options.p];
        else {
          choices = options.i === 'all' ? ['fixed', 'weak'] : [options.i];
        }
        parts = variants(
          parts,
          choices,
          (x, choice) => {
            options._tick?.();
            const ts = clone(x.ts),
              trace = [...x.trace],
              n = ts.findIndex((t) => t.at === at),
              t = ts[n];
            if (t.long) {
              if (choice === 'q') {
                t.s = QLONG[t.long];
                t.short = true;
                t.qSeries = true;
                ts.splice(n + 1, 0, c('q', at + 0.1));
                trace.push(`${t.long} → ${t.s}q（q 保持系列、位置 ${at + 1}）`);
              } else trace.push(`${t.long} → ${t.s}（長母音系列、位置 ${at + 1}）`);
            } else if (t.pChoice) {
              t.s = choice;
              trace.push(`p → ${choice}（位置 ${at + 1}）`);
            } else {
              t.weak = choice === 'weak';
              if (t.weak) {
                const noninitial = ts.slice(0, n).some((z) => z.kind === 'v');
                const adjacent = [ts[n - 1]?.s, ts[n + 1]?.s].some((s) =>
                  ['š', 'ž', 'č'].includes(s),
                );
                t.s = noninitial && adjacent ? 'i' : 'e';
                trace.push(`i → ${t.s}（弱化系列・ウムラウトの引き金から除外、位置 ${at + 1}）`);
              } else trace.push(`i を維持（位置 ${at + 1}）`);
            }
            return {
              ts,
              trace,
            };
          },
          options.limit,
        );
      }
      out.push(...parts);
      if (out.length > options.limit)
        throw new Incomplete(
          '分岐が多すぎるため全列挙を完了できませんでした。条件を絞ってください。',
        );
    }
    return out;
  }

  function applyUmlaut(ts) {
    const a = clone(ts),
      nuclei = [];
    ts.forEach((t, i) => {
      if (t.kind === 'v') nuclei.push(i);
    });
    for (let n = 0; n < nuclei.length - 1; n++) {
      const i = nuclei[n],
        j = nuclei[n + 1],
        t = ts[i],
        next = ts[j];
      const trigger = (!next.weak && ['i', 'ī'].includes(next.raw)) || ts[j - 1]?.s === 'j';
      if (trigger && (!t.long || t.qSeries)) {
        if (['au', 'ao', 'aw', 'ó'].includes(t.diph)) a[i].s = 'ö';
        else if (t.short && UML[t.s]) a[i].s = UML[t.s];
      }
    }
    return a;
  }

  function wRule(ts) {
    const a = clone(ts);
    a.forEach((t, i) => {
      if (t.s !== 'w') return;
      if (i === 1 && PROTECTED.has(a[0].s + 'w')) return;
      const prev = a[i - 1],
        next = a[i + 1];
      if (
        !next ||
        next.kind === 'c' ||
        FRONT.has(next.s) ||
        (prev?.kind === 'v' && next.kind === 'v')
      )
        t.s = 'v';
    });
    return a;
  }

  function hiatus(ts) {
    const out = [];
    for (const t of ts) {
      if (t.kind === 'v' && out.at(-1)?.kind === 'v')
        out.push(c(FRONT.has(out.at(-1).s) ? 'j' : 'w'));
      out.push({
        ...t,
      });
    }
    return out;
  }

  function repair(ts, budget, tick = () => {}) {
    const a = bare(hiatus(ts));
    if (!a) return [];
    if (phonotactics(a))
      return [
        {
          ts,
          trace: [],
        },
      ];
    const spots = [];
    for (let i = 1; i < ts.length; i++)
      if (ts[i - 1].kind === 'c' && ts[i].kind === 'c' && ts[i - 1].s !== ts[i].s) spots.push(i);
    if (spots.length > 14)
      throw new Incomplete('緩衝母音の挿入位置が多すぎます。語を形態素ごとに確認してください。');
    // 最少個数の緩衝母音を、子音間の全位置について列挙する。
    for (let count = 1; count <= spots.length; count++) {
      const results = [];

      function choose(start, selected) {
        tick();
        if (selected.length === count) {
          const set = new Set(selected),
            fixed = [];
          ts.forEach((t, i) => {
            if (set.has(i)) fixed.push(v('e', 'buffer'));
            fixed.push({
              ...t,
            });
          });
          const check = bare(hiatus(fixed));
          if (check && phonotactics(check))
            results.push({
              ts: fixed,
              trace: [
                `緩衝母音 e を ${selected.join(', ')} 番目の子音境界に挿入（最少 ${count} 個）`,
              ],
            });
          return;
        }
        for (let k = start; k < spots.length; k++) choose(k + 1, [...selected, spots[k]]);
      }
      choose(0, []);
      if (results.length > budget) throw new Incomplete('緩衝母音の候補が多すぎます。');
      if (results.length) return results;
    }
    return [];
  }

  function shortening(state, options) {
    let arr = [state];
    const ts = state.ts;
    if (options.shortening !== 'keep') {
      const sites = ts
        .map((t, i) =>
          t.kind === 'v' &&
          t.short &&
          !t.qSeries &&
          i < ts.length - 1 &&
          (i === 0 || ts.slice(0, i).some((t) => t.kind === 'v'))
            ? i
            : -1,
        )
        .filter((i) => i >= 0);
      if (sites.length > 14)
        throw new Incomplete('短縮の分岐が多すぎます。短縮を「保持」に限定してください。');
      for (const i of sites)
        arr = variants(
          arr,
          [false, true],
          (x, drop) => {
            options._tick?.();
            return drop
              ? {
                  ts: x.ts.filter((t) => t !== x.ts.find((z) => z.at === ts[i].at)),
                  trace: [
                    ...x.trace,
                    `位置 ${ts[i].at + 1} の短母音を短縮（脱落期に無強勢と仮定）`,
                  ],
                }
              : x;
          },
          options.limit,
        );
      arr = arr.filter(
        (x) => x.ts.some((t) => t.kind === 'v') && bare(x.ts) && phonotactics(bare(hiatus(x.ts))),
      );
      // 短縮しない形は緩衝母音で修復できる場合もある。
      if (!arr.some((x) => x === state)) arr.unshift(state);
    }
    return arr;
  }

  function apocope(state, options, verb) {
    if (verb) return [state];
    const a = state.ts,
      t = a.at(-1);
    if (
      t?.kind !== 'v' ||
      !t.short ||
      !['e', 'o', 'i', 'u'].includes(t.raw) ||
      a.filter((t) => t.kind === 'v').length < 2
    )
      return [state];
    const cut = a.slice(0, -1),
      check = bare(cut);
    const legal = check && phonotactics(hiatus(check));
    if (!legal || options.ending === 'keep')
      return [
        {
          ...state,
          trace: [...state.trace, '語末短母音を保持'],
        },
      ];
    const dropped = {
      ts: cut,
      trace: [...state.trace, '元からある語末短母音を脱落'],
    };
    return options.ending === 'drop'
      ? [dropped]
      : [
          dropped,
          {
            ...state,
            trace: [...state.trace, '語末短母音を保持する系列'],
          },
        ];
  }

  function lastGrade(ts, value) {
    const a = clone(ts),
      i = lastV(a);
    if (i >= 0) a[i].s = value;
    return a;
  }

  function nominalForms(headTs, oblique, gender, ending) {
    const head = surface(headTs),
      b = oblique,
      result = {
        主格単数: head,
        斜格幹: spelling(b) + '-',
      };
    if (ending === 'a') {
      for (const [key, end] of [
        ['属格単数', 'an'],
        ['与格単数', 'ar'],
        ['主格複数', 'as'],
      ])
        result[key] = spelling([...b, ...fromModern(end)]);
    } else if (ending === 'vowel') {
      result['属格単数'] = spelling([...headTs, c('n')]);
      result['与格単数'] = spelling([...headTs, c('r')]);
      result['主格複数'] = spelling([...headTs, c('s')]);
      delete result['斜格幹'];
    } else {
      result['属格単数'] = spelling(suffix(b, 'en'));
      result['与格単数'] = spelling(suffix(umlaut(b), 'er'));
      result['主格複数'] = spelling(suffix(b, gender === 'N' ? 'i' : 'es'));
    }
    return result;
  }

  function obliqueVariants(ts, options) {
    const out = [
      {
        ts,
        choices: [],
      },
    ];
    if (options.shortening === 'keep') return out;
    const sites = ts
      .map((t, i) =>
        t.kind === 'v' &&
        (t.short || t.raw === 'buffer') &&
        !t.qSeries &&
        ts.slice(0, i).some((z) => z.kind === 'v')
          ? i
          : -1,
      )
      .filter((i) => i >= 0);
    if (sites.length > 14) throw new Incomplete('斜格幹の短縮の分岐が多すぎます。');
    for (let mask = 1; mask < 2 ** sites.length; mask++) {
      options._tick?.();
      const gone = new Set(sites.filter((_, i) => mask & (2 ** i))),
        shortened = ts.filter((_, i) => !gone.has(i));
      // 裸形で不可能でも、母音始まりの接辞が付けば許される短縮幹を残す。
      if (phonotactics(suffix(shortened, 'en')))
        out.push({
          ts: shortened,
          choices: ['主格は保持し、斜格幹の短母音だけを短縮（脱落期の無強勢を仮定）'],
        });
    }
    return out;
  }

  function nounAnalyses(ts, options) {
    const end = ts.at(-1),
      ending = end?.s === 'a' ? 'a' : end?.kind === 'v' ? 'vowel' : 'consonant';
    let genders =
      ending === 'a'
        ? ['F']
        : ending === 'vowel'
          ? ['e', 'o'].includes(end.s)
            ? ['M']
            : []
          : ['M', 'F', 'N'];
    if (options.gender !== 'all') genders = genders.filter((x) => x === options.gender);
    const out = [];
    for (const gender of genders) {
      const base = ending === 'a' ? ts.slice(0, -1) : ts;
      const headBase = gender === 'N' ? umlaut(base) : base;
      let grades = [
        {
          name: '固定型',
          head: headBase,
          oblique: headBase,
        },
      ];
      const i = lastV(base),
        vowel = base[i]?.s;
      if (ending !== 'vowel' && gender !== 'N') {
        if (vowel === 'e')
          grades.push({
            name: 'Ⅰ型 e/a',
            head: base,
            oblique: lastGrade(base, 'a'),
          });
        if (vowel === 'u')
          for (const s of ['o', 'ü'])
            grades.push({
              name: `Ⅰ型 u/${s}`,
              head: base,
              oblique: lastGrade(base, s),
            });
        if (['a', 'o', 'ü'].includes(vowel))
          grades.push({
            name: `Ⅱ型 ${vowel}/${vowel === 'a' ? 'e' : 'u'}`,
            head: base,
            oblique: lastGrade(base, vowel === 'a' ? 'e' : 'u'),
          });
      }
      if (options.grade === 'fixed') grades = grades.slice(0, 1);
      for (const g of grades) {
        const h = ending === 'a' ? [...g.head, v('a')] : g.head;
        for (const ob of ending === 'vowel'
          ? [
              {
                ts: g.oblique,
                choices: [],
              },
            ]
          : obliqueVariants(g.oblique, options))
          out.push({
            head: surface(h),
            className: `${{ M: '男性', F: '女性', N: '中性' }[gender]}・${ending === 'vowel' ? '母音幹（提案）' : g.name}${ob.choices.length ? '・斜格短縮' : ''}`,
            forms: nominalForms(h, ob.ts, gender, ending),
            choices: [
              `性：${gender}`,
              `曲用：${g.name}`,
              ...ob.choices,
              ...(gender === 'N' ? ['中性の形態的ウムラウト'] : []),
            ],
            caveats:
              ending === 'vowel'
                ? ['母音幹の詳細な全曲用は未確定。ここでは再検討案の属格・与格・複数だけを表示。']
                : [],
          });
      }
    }
    return out;
  }

  function verbAnalyses(ts, options) {
    if (ts.at(-1)?.kind === 'v') return [];
    const i = lastV(ts),
      t = ts[i];
    if (!t) return [];
    const fixed = {
      name: '非交替',
      strong: ts,
      weak: ts,
      alternating: false,
    };
    let grades = [fixed];
    const change = (name, strong, weak) => ({
      name,
      strong: lastGrade(ts, strong),
      weak: lastGrade(ts, weak),
      alternating: true,
    });
    if (options.grade !== 'fixed') {
      if (t.raw === 'i') {
        if (!t.weak) grades.push(change('e/i（入力 i を弱形とする）', 'e', 'i'));
        else grades.push(change('a/e（入力 i を弱形に対応させる）', 'a', 'e'));
      } else if ((!t.long || t.qSeries) && !t.diph && ['a', 'e', 'o'].includes(t.s))
        grades.push(
          change(
            `${t.s}/${{ a: 'e', e: 'i', o: 'u' }[t.s]}`,
            t.s,
            {
              a: 'e',
              e: 'i',
              o: 'u',
            }[t.s],
          ),
        );
      else if (!t.long && t.s === 'u') {
        grades.push(change('o/u（入力 u を弱形とする）', 'o', 'u'));
        grades.push(change('ü/u（入力 u を弱形とする）', 'ü', 'u'));
      } else if (['au', 'ao', 'aw', 'ó'].includes(t.diph))
        grades.push(change('o/u（aw 系列）', 'o', 'u'));
    }
    return grades.map((g) => {
      const inf = spelling(suffix(g.strong, 'en'));
      return {
        head: inf,
        className: g.name,
        forms: {
          不定形: inf,
          現在3単: surface(g.weak),
          アオリスト: g.alternating ? surface(g.strong) : spelling(suffix(g.strong, 'it')),
          現在1単: spelling(suffix(g.weak, 'as')),
          強語幹: spelling(g.strong) + '-',
          弱語幹: spelling(g.weak) + '-',
        },
        choices: [`活用：${g.name}`],
        caveats: [],
      };
    });
  }

  function adjectiveAnalyses(ts) {
    if (ts.at(-1)?.kind === 'v') return [];
    return [
      {
        head: surface(ts),
        className: '形容詞',
        forms: {
          男性形: surface(ts),
          女性形: spelling(suffix(ts, 'a')),
          中性形: surface(umlaut(ts)),
        },
        choices: ['形容詞：性一致'],
        caveats: [],
      },
    ];
  }

  function lookup(input, data, language = 'auto') {
    input = norm(input);
    return [...data.entries, ...(data.excluded || [])].flatMap((e) => {
      const lafca = language !== 'aldian' && norm(e.head) === input;
      const aldian = language !== 'lafca' && e.relation !== '非'
        ? e.aliases.filter((a) => norm(a.form) === input) : [];
      if (aldian.length)
        return aldian.map((a) => ({
          ...e,
          matchedRelation: a.relation,
          matchedLanguages: lafca ? ['lafca', 'aldian'] : ['aldian'],
        }));
      return lafca ? [{ ...e, matchedRelation: 'ラフカ語見出し', matchedLanguages: ['lafca'] }] : [];
    });
  }

  function groupRegistered(entries) {
    const map = new Map();
    for (const e of entries) {
      const key = e.head + '|' + e.pos;
      if (!map.has(key))
        map.set(key, {
          head: e.head,
          status: e.status || 'registered',
          pos: e.pos,
          analyses: [],
        });
      map.get(key).analyses.push(e);
    }
    return [...map.values()];
  }

  function generateCorrespondences(
    raw,
    supplied = {},
    data = {
      entries: [],
      excluded: [],
    },
  ) {
    const options = {
        ...DEFAULTS,
        ...supplied,
      },
      input = norm(raw);
    const result = {
      input,
      options,
      kind: 'generated',
      complete: false,
      groups: [],
      analysisCount: 0,
      issues: [],
      coverage: [],
      excluded: [],
    };
    if (!input) {
      result.kind = 'empty';
      return result;
    }
    if (input.length > 64 || !/^[a-zāēīōūáóøšžč]+$/u.test(input)) {
      result.kind = 'blocked';
      result.issues.push(
        '単語を1語、辞書どおりの綴りで入力してください。未登録の空白・ハイフン・声門閉鎖音・未定義の文字は自動で解釈しません。',
      );
      // 登録語の複合表記は、音韻処理の前に完全一致で照合できる。
      if (!lookup(input, data, options.language).length) return result;
    }
    const registered = lookup(input, data, options.language);
    result.excluded = (data.excluded || []).filter((e) =>
      options.language !== 'lafca' && e.aliases.some((a) => norm(a.form) === input),
    );
    if (registered.length && !options.ignoreRegistered) {
      result.kind = 'registered';
      result.complete = true;
      result.issues = [];
      result.groups = groupRegistered(registered);
      result.analysisCount = registered.length;
      result.coverage = [
        '読み込んだ資料の全一致を表示。登録済みの語根へ別の音対応を再適用しない。',
        '関連形・派生参照は、見出しの直接変換とは区別して表示。',
        '登録祖語形は辞書の記載を表示。未登録の場合の祖語候補は規則による再建案として区別する。',
      ];
      return result;
    }
    if (options.language === 'lafca') {
      result.kind = 'blocked';
      result.issues.push('このラフカ語見出しに登録された同語根対応はありません。');
      return result;
    }
    if (!/^[a-zāēīōūáóøšžč]+$/u.test(input)) return result;
    if (input.includes('x') || input.includes('y')) {
      result.kind = 'blocked';
      result.issues.push(
        'x / y の同語根対応は資料に規則がありません。対応を登録してから生成してください。',
      );
      return result;
    }
    const verb = options.pos === 'verb';
    if (verb && !input.endsWith('en')) {
      result.kind = 'blocked';
      result.issues.push(
        '未登録の動詞は -en 不定形を入力してください。母音幹・補充形は個別登録が必要です。',
      );
      return result;
    }
    const stemInput = verb ? input.slice(0, -2) : input;
    let operations = 0;
    result.options = {
      ...options,
    };
    options._tick = () => {
      if (++operations > 250000)
        throw new Incomplete(
          '計算量の上限に達したため全列挙を保留しました。短縮・音節区切りなどの条件を絞ってください。',
        );
    };
    try {
      let states = lexicalBranches(tokenize(stemInput, options), options);
      const groups = new Map();
      let work = 0;
      for (const state of states) {
        options._tick();
        const changed = applyUmlaut(state.ts),
          ts = wRule(changed);
        const trace = [...state.trace];
        if (spelling(changed) !== spelling(state.ts))
          trace.push(`音韻的ウムラウト：${spelling(state.ts)} → ${spelling(changed)}`);
        if (spelling(ts) !== spelling(changed))
          trace.push(`w/v：${spelling(changed)} → ${spelling(ts)}`);
        for (const ap of apocope(
          {
            ts,
            trace,
          },
          options,
          verb,
        ))
          for (const shortened of shortening(ap, options)) {
            for (const repaired of repair(shortened.ts, options.limit, options._tick)) {
              const finalTs = hiatus(repaired.ts);
              let analyses;
              if (options.pos === 'noun') analyses = nounAnalyses(finalTs, options);
              else if (verb) analyses = verbAnalyses(finalTs, options);
              else if (options.pos === 'adjective') analyses = adjectiveAnalyses(finalTs);
              else
                analyses = [
                  {
                    head: surface(finalTs),
                    className: '音形候補（品詞未指定）',
                    forms: {
                      見出し候補: surface(finalTs),
                      接辞前の形: spelling(finalTs) + '-',
                    },
                    choices: [],
                    caveats: [
                      '品詞が未指定のため、曲用・活用・語末母音脱落の適用は暫定。名詞・動詞・形容詞を選んで確認してください。',
                    ],
                  },
                ];
              if (!analyses.length)
                result.issues.push(
                  'この出力の語末母音・品詞・性の組み合わせは、自動曲用の定義が不足しています。',
                );
              for (const a of analyses) {
                if (++work > options.limit)
                  throw new Incomplete(
                    '全候補の列挙が上限を超えました。一部の結果を「全部」として表示しないため、結果を保留します。条件を絞ってください。',
                  );
                if (!a.head) {
                  result.issues.push('子音群の後の g の処理が未定義です。');
                  continue;
                }
                a.trace = [...shortened.trace, ...repaired.trace, ...a.choices];
                const forms = Object.entries(a.forms).filter(
                  ([k]) => !k.includes('幹') && !k.includes('接辞'),
                );
                const violations = forms
                  .filter(([, s]) => !s || !phonotactics(fromModern(s)))
                  .map(([k, s]) => `${k} ${s}`);
                if (violations.length) {
                  result.issues.push(`屈折後の音節調整が必要なため保留：${violations.join(' / ')}`);
                  continue;
                }
                if (!groups.has(a.head))
                  groups.set(a.head, {
                    head: a.head,
                    status: 'candidate',
                    pos: options.pos,
                    analyses: [],
                  });
                const target = groups.get(a.head);
                // 表面形が同じでも、クラス・語幹・選択経路が違えば残す。
                const key = JSON.stringify([a.className, a.forms, a.trace]);
                if (!target.analyses.some((x) => x.key === key))
                  target.analyses.push({
                    ...a,
                    key,
                  });
              }
            }
          }
      }
      result.groups = [...groups.values()].sort((a, b) => a.head.localeCompare(b.head, 'ja'));
      result.analysisCount = result.groups.reduce((s, g) => s + g.analyses.length, 0);
      result.issues = [...new Set(result.issues)];
      result.complete = result.issues.length === 0;
      if (!result.groups.length) {
        result.complete = false;
        result.issues.push('定義済みの規則で、音節構造を満たす候補を生成できませんでした。');
      }
      result.coverage = [
        '選択中の有限規則について全経路を列挙。同じ表記に至る複数の分析も保持。',
        '短縮形は脱落期の無強勢を仮定した候補。新語の意味・同語根性・採用を確定するものではない。',
        '未定義の別読み、任意の語彙置換・類推、未知の複合語分解、母音幹動詞、任意の縮約は列挙対象外。',
        '名詞Ⅰ/Ⅱ型は資料にある a/e・o/u・ü/u 系列の規則的な候補。個別の異形態は登録が必要。',
      ];
      return result;
    } catch (e) {
      if (!(e instanceof Incomplete)) throw e;
      result.kind = 'blocked';
      result.groups = [];
      result.analysisCount = 0;
      result.issues = [e.message];
      return result;
    }
  }
  const validProtoOutput = (s) => phonotactics(fromModern(s));
  function generate(raw, supplied = {}, data = { entries: [], excluded: [] }) {
    const result = generateCorrespondences(raw, supplied, data);
    // 音対応だけを検査・利用する呼び出しは明示的に祖語探索を省略できる。
    if (supplied.includeProto === false || result.kind === 'empty') return result;
    if (result.kind === 'registered') {
      for (const group of result.groups) for (const a of group.analyses) {
        if (a.protoForms?.length) continue;
        a.reconstruction = ProtoParadigm.reconstruct(a, supplied, validProtoOutput);
      }
    } else {
      result.reconstruction = Proto.reconstruct(raw, supplied.language || 'auto', supplied, validProtoOutput);
      if (supplied.language === 'lafca' && result.reconstruction.candidates.length) {
        result.kind = 'reconstructed';
        result.issues = [];
        result.complete = false; // 祖語の歴史的な唯一性や全経路の確定を意味しない。
        result.coverage = ['登録された同語根対応はありません。祖語形は入力からの再建候補として表示します。'];
      }
    }
    return result;
  }
  const api = {
    generate,
    reconstruct: (input, language, options) => Proto.reconstruct(input, language, options, validProtoOutput),
    forwardProto: (tokens, language, settings) => Proto.forward(tokens, language, settings, validProtoOutput),
    lookup,
    norm,
    phonotactics,
    fromModern,
    spelling,
    tokenize,
    applyUmlaut,
    DEFAULTS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LafcaEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
