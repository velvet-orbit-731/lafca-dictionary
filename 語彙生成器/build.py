#!/usr/bin/env python3
"""ウェブ辞書の明示された対応を取り込み、外部依存のない HTML を組み立てる。"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DICTIONARY = "dictionary.json"
LEXEME = r"[a-zāēīōūǖáéíóúäëïöüøšžčʼ'-]+"
WORD = re.compile(rf"^{LEXEME}$", re.I)
sys.path.insert(0, str(ROOT / "tools"))
import web_source


def aliases(raw, pos):
    """対応欄の主形・関連形・語根参照を区別し、注記の別語を取り込まない。"""
    out = []
    for segment in raw.split("<br>"):
        indirect = segment.startswith(("（", "("))
        derivation = segment.endswith("〔派生・複合〕")
        if derivation:
            segment = segment.removesuffix("〔派生・複合〕")
        if indirect:
            segment = segment.strip("（）()")
        segment = re.split(r"[（(「〈]", segment)[0].strip()
        for i, form in enumerate(re.split(r"\s*(?:/|〜|～)\s*", segment)):
            if WORD.fullmatch(form) and not form.startswith("-"):
                relation = (
                    "派生・複合"
                    if derivation
                    else "語根参照" if indirect else "関連形" if i and pos == "noun" else "対応語"
                )
                alias = {"form": form.lower(), "relation": relation}
                if alias not in out:
                    out.append(alias)
    return out


def collect():
    catalog = web_source.load()
    entries, excluded = [], []
    for public in catalog["entries"]:
        head = public["head"]
        metadata = catalog.get("metadata", {}).get(public["id"], {})
        ald = metadata.get("ald", "")
        pos = {"名詞": "noun", "動詞": "verb", "形容詞": "adjective"}.get(
            metadata.get("section", public["pos"]), "other")
        als = aliases(ald.replace("\n", "<br>"), pos)
        forms = [{"label": f["label"], "value": f["value"]}
                 for t in public["tables"] for r in t["rows"] for f in r["cells"]]
        relation = metadata.get("relation", "")
        entry = dict(
            id=public["id"], head=head, pos=pos, meaning=public["meaning"].replace("\n", "；"),
            ald=ald, aliases=als, relation=relation,
            protoForms=public.get("protoForms", []), etymology=metadata.get("etymology", ""),
            paradigm={key: public.get(key, "") for key in
                      ["pos", "kind", "gender", "class", "numberRestriction", "numeralType"]},
            paradigmTags=public.get("tags", []),
            grammar=" / ".join(x for x in [public["pos"], public["gender"], public["class"]] if x),
            forms=forms, note=metadata.get("note", ""),
            source={"file": "ウェブラフカ語辞書", "id": public["id"],
                    "url": web_source.WEBSITE + "#word=" + public["id"]},
            status="registered", adopted=True,
        )
        (excluded if relation == "非" else entries).append(entry)
    sources = [web_source.source()] + [
        dict(file=name, sha256=hashlib.sha256((ROOT / name).read_bytes()).hexdigest())
        for name in ["ラフカ語文法.md", "音変化再検討案.md", "系統と設計ノート.md"]
    ]
    sources.append(dict(file="曲用・活用規則", path="辞書/morphology.js",
                        sha256=hashlib.sha256((ROOT / "辞書/morphology.js").read_bytes()).hexdigest()))
    return {"version": "2026-09-30.proto-paradigms", "entries": entries, "excluded": excluded, "sources": sources}


def artifacts():
    data = collect()
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = (HERE / "shell.html").read_text()
    html = html.replace("/*__STYLE__*/", (HERE / "style.css").read_text())
    html = html.replace("/*__ENGINE__*/", (HERE / "engine.js").read_text())
    html = html.replace("/*__PROTO__*/", (HERE / "proto.js").read_text())
    html = html.replace("/*__PARADIGM__*/", (HERE / "proto-paradigm.js").read_text())
    html = html.replace("/*__MORPHOLOGY__*/", (ROOT / "辞書/morphology.js").read_text())
    html = html.replace("/*__DATA__*/", "const LAFCA_DATA = " + encoded + ";")
    html = html.replace("/*__APP__*/", (HERE / "app.js").read_text())
    return {
        "data.json": json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        "../generator/index.html": html,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="書き込まずに生成物の同期を検査する")
    args = parser.parse_args()
    for name, content in artifacts().items():
        path = HERE / name
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                raise SystemExit(name + " が未更新です。build.py を実行してください。")
        else:
            path.parent.mkdir(exist_ok=True)
            path.write_text(content, encoding="utf-8")
    print("生成器HTML・データ " + ("同期確認済み" if args.check else "生成済み"))


if __name__ == "__main__":
    main()
