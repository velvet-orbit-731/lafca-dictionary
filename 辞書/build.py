#!/usr/bin/env python3
"""語彙データと静的資材をまとめ、辞書データ・単体HTMLを生成する。"""
import argparse
from collections import Counter
import json
from entry_model import DICT, GRAMMAR, HERE, browser_data
from lexicon import collect
import edit_data

# 閲覧・編集の依存順。HTMLに埋め込むため外部の実行時依存はない。
SCRIPT_FILES = [
    "morphology.js",
    "taxonomy.js",
    "search.js",
    "app.js",
    "editor-core.js",
    "github-save.js",
    "editor.js",
]


def artifacts(edits=None, catalog=None):
    data = collect(catalog)
    if edits is not None:
        data = edit_data.apply(data, edits)
    encoded = json.dumps(browser_data(data), ensure_ascii=False, separators=(",", ":")).replace(
        "<", "\\u003c"
    )
    html = (
        (HERE / "shell.html").read_text().replace("/*__STYLE__*/", (HERE / "style.css").read_text())
    )
    html = html.replace("/*__DATA__*/", "const DATA = " + encoded + ";")
    html = html.replace(
        "/*__APP__*/",
        "globalThis.LafcaTaxonomyConfig = "
        + (HERE / "taxonomy.json").read_text()
        + ";\n"
        + "\n".join((HERE / name).read_text() for name in SCRIPT_FILES),
    )
    source_counts = Counter(e["source"]["file"] for e in data["entries"])
    report = [
        "# 分類辞書の収録・確認",
        "",
        f'登録項目 {len(data["entries"])} 件。全項目をウェブ辞書 dictionary.json から取得。',
        "",
        "## 分類件数",
        "",
    ]
    for section, count in data["counts"].items():
        report.append(f"- {section}：{count}")
    report += [
        "",
        "## 語形と数の制限",
        "",
        "曲用・活用は文法1.4・2.1.5・2.3.2–2.3.7に従う。名詞の性・語幹型・語形はウェブ辞書に保存する。",
        "",
        "- 不可算・単数のみの名詞は単数の五格、複数のみの集合名詞は複数の五格を収録する。",
        "- 無主語動詞 deqen の現在は diq。人称・数の対立と命令形は持たない。",
        "- 名詞の性、語幹、語形に欠落があれば生成時にエラーにし、空欄を公開しない。",
    ]
    report += [
        "",
        "## 資料の注意",
        "",
        "- 固定型にも与格ウムラウト・q/g 等の子音交替がある。",
        "- 形容詞の分類名は閲覧用の記述的なタグで、名詞のⅠ・Ⅱ型とは別。",
        "- ウェブ辞書の保存済み語形・所有者の編集を再生成で置き換えない。",
        "- 未登録の候補や説明用の構文は自動登録しない。",
        "- この生成処理はローカルのファイルだけを更新し、公開先への通信は行わない。",
        "",
    ]
    return {
        "data.json": json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        "ラフカ語辞書.html": html,
        "収録と未確定事項.md": "\n".join(report),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for filename, content in artifacts().items():
        path = HERE / filename
        if args.check:
            if not path.exists() or path.read_text() != content:
                raise SystemExit(filename + " が未更新です。build.py を実行してください。")
        else:
            path.write_text(content)
    print("HTML・データ・収録一覧 " + ("同期確認済み" if args.check else "生成済み"))


if __name__ == "__main__":
    main()
