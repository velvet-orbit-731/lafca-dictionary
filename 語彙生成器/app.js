'use strict';
const $ = (id) => document.getElementById(id);
const create = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const optionIds = ['language', 'pos', 'long', 'i', 'p', 'ending', 'shortening', 'boundary', 'gender', 'grade'];
let current = null,
  page = 0,
  running = 0;
let activeWorker = null,
  cancelPrevious = null;
const PAGE_SIZE = 24;
const workerURL =
  typeof Worker !== 'undefined'
    ? URL.createObjectURL(
        new Blob(
          [
            $('proto-source').textContent,
            '\n',
            $('morphology-source').textContent,
            '\n',
            $('paradigm-source').textContent,
            '\n',
            $('engine-source').textContent,
            '\nself.onmessage = e => { try { self.postMessage({result:LafcaEngine.generate(e.data.input,e.data.options,e.data.data)}); } catch(error) { self.postMessage({error:String(error)}); } };',
          ],
          {
            type: 'text/javascript',
          },
        ),
      )
    : null;

function compute(input, options) {
  if (!workerURL) return Promise.resolve(LafcaEngine.generate(input, options, LAFCA_DATA));
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerURL);
    activeWorker = worker;
    cancelPrevious = () => {
      worker.terminate();
      reject(new Error('superseded'));
    };
    worker.onmessage = (e) => {
      worker.terminate();
      if (activeWorker === worker) {
        activeWorker = null;
        cancelPrevious = null;
      }
      e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.result);
    };
    worker.onerror = (e) => {
      worker.terminate();
      if (activeWorker === worker) {
        activeWorker = null;
        cancelPrevious = null;
      }
      reject(new Error(e.message));
    };
    worker.postMessage({
      input,
      options,
      data: LAFCA_DATA,
    });
  });
}

function addForms(parent, forms) {
  const list = Array.isArray(forms)
    ? forms
    : Object.entries(forms).map(([label, value]) => ({
        label,
        value,
      }));
  if (!list.length) return;
  const box = create('div', undefined, 'forms');
  list.forEach((f) => {
    const cell = create('div', undefined, 'form-cell');
    cell.append(create('span', f.label, 'label'), create('span', f.value, 'value'));
    box.append(cell);
  });
  parent.append(box);
}

function reconstructionView(result) {
  const section = create('section', undefined, 'proto-candidates ancestry');
  const names = { lafca: 'ラフカ語', aldian: 'アルディア語' };
  section.append(create('h4', '祖語形の候補', 'ancestry-label'));
  section.append(create('p', `${result.input} からの再建案。辞書の登録形とは区別して表示します。`, 'etymology'));
  if (result.paradigm) {
    const p = result.paradigm;
    section.append(create('p', `${p.head}：${[p.pos, p.gender, p.class].filter(Boolean).join(' / ')}。登録 ${p.registeredCount} 語形を照合し、${p.testedCount} 案から ${p.acceptedCount} 件の分析を表示。`, 'paradigm-summary'));
    if (p.rejected.length) {
      const rejected = create('details', undefined, 'reason');
      rejected.append(create('summary', '除外・保留の理由'));
      p.rejected.forEach((r) => rejected.append(create('p', `${r.reason}（${r.count} 案）`)));
      section.append(rejected);
    }
  }
  result.issues.forEach((issue) => section.append(create('p', issue, 'relation-note')));
  if (result.candidates.length) {
    const list = create('div'), navigation = create('div', undefined, 'proto-pagination');
    const previous = create('button', '← 前の祖語候補', 'secondary proto-prev');
    const next = create('button', '次の祖語候補 →', 'secondary proto-next');
    previous.type = next.type = 'button';
    const count = create('span', undefined, 'proto-count');
    let start = 0;
    function paint() {
      list.replaceChildren();
      result.candidates.slice(start, start + 12).forEach((candidate) => {
        const item = create('div', undefined, 'proto-candidate');
        item.append(create('span', candidate.form, 'proto-candidate-form'));
        item.append(create('span', `${names[candidate.language]}から`, 'proto-language'));
        const details = create('details', undefined, 'reason');
        details.append(create('summary', `規則・照合：${candidate.form} → ${candidate.verifiedOutput}`));
        const rules = create('ol');
        candidate.trace.forEach((rule) => rules.append(create('li', rule)));
        details.append(rules);
        item.append(details);
        if (candidate.morphology) {
          const m = candidate.morphology, checked = create('details', undefined, 'reason morphology-check');
          checked.append(create('summary', m.status === 'compatible' ? `曲用・活用：登録 ${m.checkedForms.length} 語形と一致` : '曲用・活用表なし（音対応のみ）'));
          checked.append(create('p', Object.entries(m.stems).map(([label, value]) => `${label}：${value}-`).join(' ／ ')));
          m.trace.forEach((t) => checked.append(create('p', t)));
          const checks = create('ul');
          m.checkedForms.forEach((f) => checks.append(create('li', `${f.label}：${f.predicted}（登録 ${f.registered}）`)));
          checked.append(checks);
          item.append(checked);
        }
        list.append(item);
      });
      count.textContent = `${start + 1}–${Math.min(start + 12, result.candidates.length)} / ${result.candidates.length} 候補`;
      previous.disabled = start === 0;
      next.disabled = start + 12 >= result.candidates.length;
    }
    previous.addEventListener('click', () => { start -= 12; paint(); });
    next.addEventListener('click', () => { start += 12; paint(); });
    navigation.append(previous, count, next);
    paint();
    section.append(list, navigation);
  }
  const scope = create('details', undefined, 'reason');
  scope.append(create('summary', '祖語候補の規則と仮定'));
  result.scope.forEach((line) => scope.append(create('p', line)));
  scope.append(create('p', `根拠：${result.sources.join(' ／ ')}`));
  section.append(scope);
  return section;
}

function registeredAnalysis(a) {
  const box = create('div', undefined, 'analysis');
  const ancestry = create('div', undefined, 'ancestry');
  ancestry.append(create('p', '祖語形（辞書の記載）', 'ancestry-label'));
  if (a.protoForms.length) {
    const forms = create('ul', undefined, 'proto-forms');
    a.protoForms.forEach((form) => forms.append(create('li', form)));
    ancestry.append(forms);
  } else {
    ancestry.append(create('p', '辞書の祖語形は未登録です。', 'proto-missing'));
  }
  if (a.etymology) ancestry.append(create('p', a.etymology, 'etymology'));
  box.append(ancestry);
  if (a.reconstruction) box.append(reconstructionView(a.reconstruction));
  const languages = { lafca: 'ラフカ語', aldian: 'アルディア語' };
  box.append(create('p', `一致した入力：${a.matchedLanguages.map((l) => languages[l]).join('・')}`, 'ref'));
  box.append(
    create(
      'h4',
      [
        a.grammar,
        a.relation === '転' ? '意味変化同源' : a.relation === '同' ? '同義同源' : a.relation,
      ]
        .filter(Boolean)
        .join(' · '),
    ),
  );
  if (['関連形', '語根参照'].includes(a.matchedRelation))
    box.append(
      create(
        'p',
        '入力はこの語の関連形・語根として参照されています。入力形そのものをこの見出しへ直接音変化させた、という意味ではありません。',
        'relation-note',
      ),
    );
  if (a.relation === '非')
    box.append(create('p', 'アルディア語欄の語とは非同源です。上の祖語形はこのラフカ語見出しの記載で、両語の共通祖語形ではありません。', 'relation-note'));
  else if (a.aliases.some((alias) => alias.relation !== '対応語'))
    box.append(create('p', '関連形・語根参照・派生や複合を含む対応です。祖語形はこの見出しの記載を表示しています。', 'relation-note'));
  addForms(box, a.forms);
  box.append(create('p', `アルディア語欄：${a.ald || '対応は未登録です。'}`, 'ref'));
  if (a.note) box.append(create('p', a.note, 'ref'));
  const sourceLink = create('a', a.source.file, 'ref');
  sourceLink.href = a.source.url;
  box.append(sourceLink);
  return box;
}

function generatedAnalysis(a) {
  const box = create('div', undefined, 'analysis');
  box.append(create('p', '入力から推定した祖語形は、上の「祖語形の候補」で確認できます。', 'proto-missing'));
  box.append(create('h4', a.className));
  addForms(box, a.forms);
  const details = create('details', undefined, 'reason');
  details.append(create('summary', 'この候補になる選択・規則'));
  const list = create('ol');
  a.trace.forEach((t) => list.append(create('li', t)));
  details.append(list);
  box.append(details);
  a.caveats.forEach((t) => box.append(create('p', t, 'relation-note')));
  return box;
}

function paintGroups() {
  $('results').replaceChildren();
  if (!current) return;
  const total = current.groups.length,
    start = page * PAGE_SIZE;
  for (const group of current.groups.slice(start, start + PAGE_SIZE)) {
    const card = create('article', undefined, 'entry'),
      top = create('div', undefined, 'entry-top');
    top.append(
      create('h3', group.head),
      create(
        'span',
        group.status === 'candidate'
          ? '候補'
          : group.analyses.some((a) => a.adopted)
            ? '作者採用済み'
            : '登録形',
        `badge ${group.status === 'candidate' ? 'candidate' : ''}`,
      ),
    );
    card.append(top);
    if (current.kind === 'registered') {
      card.append(
        create(
          'p',
          [...new Set(group.analyses.map((a) => a.meaning).filter(Boolean))].join(' ／ '),
          'meaning',
        ),
      );
      group.analyses.forEach((a) => card.append(registeredAnalysis(a)));
    } else {
      card.append(create('p', `${group.analyses.length} 通りの分析・選択経路`, 'meaning'));
      card.append(generatedAnalysis(group.analyses[0]));
      if (group.analyses.length > 1) {
        const more = create('details', undefined, 'more-analyses');
        more.append(create('summary', `残り ${group.analyses.length - 1} 通りの分析を表示`));
        more.addEventListener('toggle', () => {
          if (more.open && more.children.length === 1)
            group.analyses.slice(1).forEach((a) => more.append(generatedAnalysis(a)));
        });
        card.append(more);
      }
    }
    $('results').append(card);
  }
  if (!total && !current.reconstruction?.candidates.length)
    $('results').append(
      create(
        'div',
        current.kind === 'empty'
          ? '単語を入力すると、対応と候補がここに表示されます。'
          : '確定できる候補はありません。上の保留理由を確認してください。',
        'empty',
      ),
    );
  $('pagination').hidden = total <= PAGE_SIZE;
  $('page-label').textContent =
    `${start + 1}–${Math.min(start + PAGE_SIZE, total)} / 全 ${total} 表記`;
  $('prev').disabled = page === 0;
  $('next').disabled = start + PAGE_SIZE >= total;
}

function paintResult(result) {
  current = result;
  page = 0;
  $('notice').replaceChildren();
  $('proto-results').replaceChildren();
  if (result.reconstruction) $('proto-results').append(reconstructionView(result.reconstruction));
  $('coverage').replaceChildren();
  $('result-kicker').textContent =
    result.kind === 'registered' ? 'REGISTERED CORRESPONDENCES' : 'RULE-BASED CANDIDATES';
  $('result-title').textContent = result.input ? `${result.input} の対応・祖語形` : '生成結果';
  if (result.kind === 'registered')
    $('status').textContent =
      `資料の全一致：${result.groups.length} 表記 / ${result.analysisCount} 件の参照。登録形を表示し、祖語形が空欄なら曲用・活用を照合した候補または保留理由を示します。`;
  else if (result.kind === 'empty') $('status').textContent = '';
  else if (result.kind === 'reconstructed')
    $('status').textContent = `祖語形の再建候補 ${result.reconstruction.candidates.length} 件。入力言語と規則に基づく仮説です。`;
  else
    $('status').textContent =
      `${result.groups.length} 表記 / ${result.analysisCount} 通りの分析。${result.complete ? '選択した有限規則の列挙完了。' : '保留事項があります。全列挙完了とは扱いません。'}`;
  if (result.issues.length) {
    const banner = create('div', undefined, 'banner');
    banner.append(create('p', '確認・指定が必要な点'));
    const list = create('ul');
    result.issues.slice(0, 8).forEach((t) => list.append(create('li', t)));
    banner.append(list);
    if (result.issues.length > 8) {
      const more = create('details');
      more.append(create('summary', `残り ${result.issues.length - 8} 件`));
      result.issues.slice(8).forEach((t) => more.append(create('p', t)));
      banner.append(more);
    }
    $('notice').append(banner);
  }
  if (result.excluded.length) {
    const notice = create('div', undefined, 'banner');
    notice.append(create('p', '同義でも非同源の語は、同語根の結果に含めません。'));
    result.excluded.forEach((e) =>
      notice.append(
        create(
          'p',
          `${e.head}「${e.meaning}」— ${e.source.file}で非同源と記載。`,
        ),
      ),
    );
    $('notice').append(notice);
  }
  const ul = create('ul');
  result.coverage.forEach((t) => ul.append(create('li', t)));
  $('coverage').append(ul);
  $('export').disabled = !result.groups.length && !result.reconstruction?.candidates.length;
  paintGroups();
}
async function run() {
  const ticket = ++running;
  if (cancelPrevious) cancelPrevious();
  $('generate').disabled = true;
  $('export').disabled = true;
  $('status').replaceChildren(
    create('span', undefined, 'spinner'),
    document.createTextNode('対応と候補を計算しています…'),
  );
  const options = Object.fromEntries(optionIds.map((id) => [id, $(id).value]));
  await new Promise((resolve) => setTimeout(resolve, 25));
  if (ticket !== running) return;
  try {
    const result = await compute($('word').value, options);
    if (ticket === running) paintResult(result);
  } catch (e) {
    if (ticket !== running) return;
    paintResult({
      input: $('word').value,
      kind: 'blocked',
      complete: false,
      groups: [],
      analysisCount: 0,
      excluded: [],
      coverage: [],
      issues: ['計算中にエラーが発生しました。結果の正しさを確認できないため表示を停止しました。'],
    });
    console.error(e);
  } finally {
    if (ticket === running) $('generate').disabled = false;
  }
}
$('query-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run();
});
optionIds.forEach((id) => $(id).addEventListener('change', run));
document.querySelectorAll('[data-example]').forEach((b) =>
  b.addEventListener('click', () => {
    $('word').value = b.dataset.example;
    $('language').value = b.dataset.language || 'auto';
    $('pos').value = b.dataset.pos;
    run();
  }),
);
$('reset').addEventListener('click', () => {
  optionIds.filter((x) => !['pos', 'language'].includes(x)).forEach((id) => ($(id).value = LafcaEngine.DEFAULTS[id]));
  run();
});
$('toggle-filters').addEventListener('click', () => {
  const open = document.body.classList.toggle('filters-open');
  $('toggle-filters').setAttribute('aria-expanded', String(open));
  $('toggle-filters').textContent = open ? '条件を閉じる' : '候補を分ける条件を変更';
});
$('prev').addEventListener('click', () => {
  page--;
  paintGroups();
  $('result-title').scrollIntoView({
    block: 'start',
  });
});
$('next').addEventListener('click', () => {
  page++;
  paintGroups();
  $('result-title').scrollIntoView({
    block: 'start',
  });
});
$('export').addEventListener('click', () => {
  if (!current) return;
  const payload = {
    rulesVersion: LAFCA_DATA.version,
    sources: LAFCA_DATA.sources,
    result: current,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
  );
  const a = create('a');
  a.href = url;
  a.download = `lafca-${current.input.replace(/[^a-zāēīōūáóøšžč]/gu, '_')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
LAFCA_DATA.sources.forEach((s) => {
  const p = create('div', undefined, 'source-line');
  p.append(create('span', s.file), create('div', `SHA-256 ${s.sha256}`, 'hash'));
  $('source-list').append(p);
});
$('version').textContent = `RULESET ${LAFCA_DATA.version} · ${LAFCA_DATA.entries.length} 資料行`;
run();
