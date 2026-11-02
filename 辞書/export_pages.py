#!/usr/bin/env python3
"""リポジトリ直下の dictionary.json から Pages 用の index.html・version.json などを更新する。通信・pushはしない。"""
import argparse
import hashlib
import json
from pathlib import Path
import build
from entry_model import ROOT, GRAMMAR
from lexicon import catalog_from_data
import web_source


def pages_files(edits=None, catalog=None):
    catalog = catalog if catalog is not None else web_source.load()
    artifacts = build.artifacts(edits, catalog)
    data = json.loads(artifacts["data.json"])
    current = catalog_from_data(data, catalog)
    dictionary = json.dumps(current, ensure_ascii=False, indent=2) + "\n"
    html = artifacts["ラフカ語辞書.html"].replace(
        '<meta name="color-scheme" content="light">',
        '<meta name="color-scheme" content="light">\n  <meta name="robots" content="noindex, nofollow, noarchive">',
    )
    grammar = (ROOT / GRAMMAR).read_text()
    manifest = {
        "entries": len(current["entries"]),
        "htmlSha256": hashlib.sha256(html.encode()).hexdigest(),
        "grammarMdSha256": hashlib.sha256(grammar.encode()).hexdigest(),
        "dictionarySha256": hashlib.sha256(dictionary.encode()).hexdigest(),
    }
    return {"index.html": html, "dictionary.json": dictionary,
            "ラフカ語文法.md": grammar, "収録と未確定事項.md": artifacts["収録と未確定事項.md"],
            "version.json": json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"}


def export(directory):
    directory = Path(directory)
    # Always use the destination's current complete dictionary, never a local base/overlay.
    path = directory / "dictionary.json"
    original = path.read_bytes()
    catalog = web_source.decode(original.decode("utf-8"))
    files = pages_files(catalog=catalog)
    if path.read_bytes() != original:
        raise ValueError("書き出し中にウェブ辞書が更新されました。再取得してください。")
    for name, content in files.items():
        (directory / name).write_text(content, encoding="utf-8")
    for name in ["edits.json", "ラフカ語辞書.md", "ラフカ語文法.pdf"]:
        (directory / name).unlink(missing_ok=True)
    return files


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, nargs="?", default=ROOT, help="書き出し先（既定はこのリポジトリ）")
    args = parser.parse_args()
    print(f"Pages用の{len(export(args.directory))}ファイルを書き出しました: {args.directory}")
