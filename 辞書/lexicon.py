"""ウェブ辞書の全項目を読み込む。語彙を別資料から再抽出・再生成しない。"""

from collections import Counter
import copy
import hashlib
import re
import sys
import unicodedata
from entry_model import ROOT, GRAMMAR, LEX, browser_data
import edit_data
sys.path.insert(0, str(ROOT / "tools"))
import web_source

def proto_forms(etymology):
    """明示された祖語型だけを拾い、姉妹言語の形や現代語の派生説明と分ける。"""
    for line in etymology.splitlines():
        if line.startswith("*"):
            # 本体に続く括弧内の語釈・接辞の説明は祖語型の列に混ぜない。
            line = re.sub(r"[（(「][^）)」]*[）)」]", "", line)
        elif line.startswith("比較再建："):
            pass
        elif line.startswith("Ald."):
            # Ald. の表記自体には * を補わず、括弧内の明示された再建形だけ。
            line = " ".join(re.findall(r"[（(](\*[^）)]+)[）)]", line))
        else:
            continue
        forms = re.findall(r"\*[^\s*/（）()「」〈〉、。；;：:＋+<>]+", line)
        if forms:
            return list(dict.fromkeys(unicodedata.normalize("NFC", f) for f in forms))
    return []

def label_normalize(label):
    label = re.sub(r"([123])単(?!数)", r"\1単数", label.replace(" ", ""))
    if label == "複数":
        return "複数主格"
    match = re.fullmatch("(主格|属格|与格|奪格|再帰格)(単数|複数)", label)
    if match:
        return match[2] + match[1]
    return label

def explicit_forms(raw):
    result = {}
    for item in raw.split("<br>"):
        if item == "—":
            continue
        label, sep, value = item.partition("：")
        if not sep:
            raise ValueError(f"語形ラベルがない: {item}")
        labels = [label_normalize(x) for x in label.split(" / ")]
        values = value.split(" / ")
        if len(labels) == len(values):
            result.update(zip(labels, values))
        else:
            result[label_normalize(label)] = value
    return result


def collect(catalog=None):
    use_cache = catalog is None
    catalog = copy.deepcopy(catalog if catalog is not None else web_source.load())
    origin = web_source.source(None if use_cache else catalog)
    # Validate shapes, forms, IDs and references without applying a local overlay.
    validated = edit_data.apply({"entries": [], "counts": {}}, {
        "version": 1, "entries": catalog["entries"],
        "deletedIds": catalog.get("deletedIds", []),
    })
    metadata = catalog.get("metadata", {})
    entries = []
    for public in browser_data(validated)["entries"]:
        entry = {
            "section": public["pos"], "grammar": "", "etymology": "", "ald": "",
            "relation": "", "note": "", "status": "ウェブ登録", "stemType": "",
            "stems": {}, "usage": [], "issues": [],
            **copy.deepcopy(metadata.get(public["id"], {})),
            **public,
            "source": {"file": "dictionary.json", "id": public["id"],
                       "url": web_source.WEBSITE + "#word=" + public["id"]},
        }
        for table in entry["tables"]:
            for row in table["rows"]:
                for cell in row["cells"]:
                    cell.update(origin="ウェブ登録", source=entry["source"]["url"], note="")
        entry["explicit"] = {f["label"]: f["value"] for t in entry["tables"]
                             for r in t["rows"] for f in r["cells"]}
        entry["registeredForms"] = "\n".join(k + "：" + v for k,v in entry["explicit"].items())
        entries.append(entry)
    return {
        "version": 2, "entries": entries,
        "sources": [origin, {"file": GRAMMAR,
            "sha256": hashlib.sha256((ROOT / GRAMMAR).read_bytes()).hexdigest()}],
        "counts": dict(Counter(e["pos"] if e["kind"] == "単語" else e["kind"] for e in entries)),
        "excludedProposals": 0,
    }


def catalog_from_data(data, original=None):
    result = copy.deepcopy(original if original is not None else web_source.load())
    entries = browser_data(data)["entries"]
    ids = {e["id"] for e in entries}
    deleted = (set(result.get("deletedIds", [])) | {e["id"] for e in result["entries"]} - ids) - ids
    result.update(entries=entries, metadata={i:m for i,m in result.get("metadata", {}).items() if i in ids})
    result["deletedIds"] = sorted(deleted)
    return result
