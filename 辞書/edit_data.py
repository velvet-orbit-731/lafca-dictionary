"""Persistent browser edits, shared by local rebuilds and Pages exports."""

from collections import Counter
import copy
import json
import re
import unicodedata
from pathlib import Path

import entry_model
import taxonomy

PUBLIC_KEYS = [
    "id",
    "head",
    "pos",
    "kind",
    "numeralType",
    "numberRestriction",
    "meaning",
    "tags",
    "gender",
    "class",
    "protoForms",
    "relations",
    "tables",
]
RELATION_TYPES = {"派生", "類義", "対義"}


def canonical_tags(entry):

    return taxonomy.tags(entry)


def normalize_relations(entry):
    result = copy.deepcopy(entry)

    taxonomy.validate(result)
    senses = taxonomy.sense_tags(result)
    if senses or "senseTags" in result:
        result["senseTags"] = senses
    result["tags"] = canonical_tags(result)
    for relation in result["relations"]:
        if relation["title"] in ["派生語", "派生元"]:
            relation["title"] = "派生"
    return result


def synchronize_relations(base, replacements=(), deleted_ids=()):
    deleted = set(deleted_ids)
    entries = {e["id"]: normalize_relations(e) for e in base if e["id"] not in deleted}
    for entry in entries.values():
        entry["relations"] = [r for r in entry["relations"] if r["id"] not in deleted]

    def key(relation):
        return relation["title"], relation["id"]

    def complete():
        for entry in entries.values():
            seen, relations = set(), []
            for relation in entry["relations"]:
                if relation["title"] not in RELATION_TYPES or key(relation) not in seen:
                    relations.append(relation)
                seen.add(key(relation))
            entry["relations"] = relations
            for relation in relations:
                if relation["title"] not in RELATION_TYPES:
                    continue
                if relation["id"] == entry["id"]:
                    raise ValueError("自分自身を関連語には指定できません。")
                target = entries.get(relation["id"])
                reverse = {"title": relation["title"], "id": entry["id"], "head": entry["head"]}
                if target is not None and not any(
                    key(r) == key(reverse) for r in target["relations"]
                ):
                    target["relations"].append(reverse)

    complete()
    before = copy.deepcopy(entries)
    replacements = [normalize_relations(e) for e in replacements]
    for entry in replacements:
        if entry["id"] in deleted:
            raise ValueError("同じ語が編集と削除の両方にある")
        entry["relations"] = [r for r in entry["relations"] if r["id"] not in deleted]
    entries.update({e["id"]: e for e in replacements})
    # Remove reverse links first so completion cannot revive a deleted relation.
    for entry in replacements:
        for relation in before.get(entry["id"], {}).get("relations", []):
            if relation["title"] in RELATION_TYPES and not any(
                key(r) == key(relation) for r in entry["relations"]
            ):
                target = entries.get(relation["id"])
                if target is not None:
                    target["relations"] = [
                        r for r in target["relations"] if key(r) != (relation["title"], entry["id"])
                    ]
    complete()
    for entry in entries.values():
        for relation in entry["relations"]:
            if relation["id"] not in entries or not relation["title"].strip():
                raise ValueError("関連語が存在しない")
            relation["head"] = entries[relation["id"]]["head"]
    return list(entries.values())


def deleted_ids(edits):
    ids = edits.get("deletedIds", [])
    if (
        not isinstance(ids, list)
        or any(not isinstance(i, str) or not re.fullmatch("[0-9a-f]{16}", i) for i in ids)
        or len(set(ids)) != len(ids)
    ):
        raise ValueError("削除対象のIDが不正")
    if set(ids) & {e["id"] for e in edits["entries"]}:
        raise ValueError("同じ語が編集と削除の両方にある")
    return set(ids)


def load(path):
    if not Path(path).exists():
        return {"version": 1, "entries": []}
    result = json.loads(Path(path).read_text())
    if result.get("version") != 1 or not isinstance(result.get("entries"), list):
        raise ValueError("辞書編集データの形式が不正です。")
    if len({e["id"] for e in result["entries"]}) != len(result["entries"]):
        raise ValueError("辞書編集データのIDが重複しています。")
    result["entries"] = [normalize_relations(e) for e in result["entries"]]
    deleted_ids(result)
    return result


def combine(local, remote):
    """Never silently discard a divergent local/public edit."""
    deleted = deleted_ids(local) | deleted_ids(remote)
    entries = {e["id"]: normalize_relations(e) for e in local["entries"]}
    for raw in remote["entries"]:
        entry = normalize_relations(raw)
        if entry["id"] in entries and entries[entry["id"]] != entry:
            raise ValueError(
                "手元と公開先の編集が異なります: "
                + entry["head"]
                + "。編集データを比較して統合してください。"
            )
        entries[entry["id"]] = entry
    if deleted & entries.keys():
        raise ValueError("手元と公開先で編集と削除が競合しています。")
    return {
        "version": 1,
        "entries": [entries[k] for k in sorted(entries)],
        **({"deletedIds": sorted(deleted)} if deleted else {}),
    }


def apply(data, edits):
    deleted = deleted_ids(edits)
    result = copy.deepcopy(data)
    entries = {e["id"]: e for e in result["entries"]}
    for edit in edits["entries"]:
        if set(edit) - {"inflection", "senseTags"} != set(PUBLIC_KEYS):
            raise ValueError("編集項目のフィールドが不正: " + str(edit.get("head")))

        taxonomy.validate(edit)
        if "inflection" in edit:
            validate_inflection(edit["inflection"])
        if not re.fullmatch("[0-9a-f]{16}", edit["id"]):
            raise ValueError("編集項目のIDが不正")
        if not re.fullmatch(
            r"-?" + entry_model.LEX + r"(?: " + entry_model.LEX + r")*-?", edit["head"]
        ):
            raise ValueError("語彙ではない見出し: " + edit["head"])
        if not edit["meaning"].strip():
            raise ValueError("意味がない: " + edit["head"])
        if edit["pos"] not in entry_model.PARTS_OF_SPEECH and not (
            edit["pos"] == "" and edit["kind"] == "接辞"
        ):
            raise ValueError("品詞が不正")
        classes = {
            "名詞": ["固定型", "Ⅰ型", "Ⅱ型", "不規則型"],
            "動詞": ["a/e交替", "e/i交替", "o/u交替", "非交替", "母音幹"],
            "形容詞": ["子音幹", "母音幹"],
        }
        if edit["class"] not in classes.get(edit["pos"], [""]) and not (
            edit["kind"] == "慣用句" and edit["class"] == ""
        ):
            raise ValueError("分類が不正")
        if (
            edit["gender"] not in entry_model.GENDERS
            if edit["pos"] == "名詞"
            else edit["gender"] != ""
        ):
            raise ValueError("性が不正")
        if edit["numberRestriction"] not in ["", "singular", "plural"] or (
            edit["numberRestriction"] and edit["pos"] != "名詞"
        ):
            raise ValueError("数の制限が不正")
        if edit["numeralType"] not in ["", "基数", "序数"] or (
            edit["numeralType"] and edit["pos"] not in ["名詞", "形容詞", "連体詞"]
        ):
            raise ValueError("数詞の分類が不正")
        if edit["kind"] not in ["単語", "接辞", "慣用句"]:
            raise ValueError("項目種別が不正")
        for key in ["tags", "protoForms"]:
            if not isinstance(edit[key], list) or any(
                not isinstance(v, str) or not v.strip() for v in edit[key]
            ):
                raise ValueError(key + "が不正")
        if any(not v.startswith("*") for v in edit["protoForms"]):
            raise ValueError("祖語型の形式が不正")
        labels = set()
        for table in edit["tables"]:
            if (
                not table["title"].strip()
                or not table["columns"]
                or any(not c.strip() for c in table["columns"])
                or not table["rows"]
            ):
                raise ValueError("空の語形表")
            for row in table["rows"]:
                if not row["label"].strip() or len(row["cells"]) != len(table["columns"]):
                    raise ValueError("語形表の行・列が不一致")
                for cell in row["cells"]:
                    if (
                        not cell["label"].strip()
                        or not cell["value"].strip()
                        or cell["label"] in labels
                    ):
                        raise ValueError("語形が空または重複")
                    labels.add(cell["label"])
        excluded = {"singular": "複数", "plural": "単数"}.get(edit["numberRestriction"])
        if excluded and any(excluded in f["label"] for f in entry_model.all_forms(edit)):
            raise ValueError("数の制限と語形が矛盾")
        if edit["pos"] in ["名詞", "動詞", "形容詞"] and not edit["tables"]:
            raise ValueError("語形表がない")
        entry = entries.get(edit["id"], {"source": {"file": "ウェブ編集"}, "section": edit["pos"]})
        entry.update(copy.deepcopy(edit))
        # Replaced inflections are explicit vocabulary edits, not stale inferred stems.
        entry["stems"], entry["issues"] = {}, []
        entries[entry["id"]] = entry
    entries = {
        e["id"]: e
        for e in synchronize_relations(
            data["entries"], [entries[e["id"]] for e in edits["entries"]], deleted
        )
    }
    words = set()
    for entry in entries.values():
        word = (entry["head"], entry["pos"], entry["kind"])
        if word in words:
            raise ValueError("語彙の重複: " + entry["head"])
        words.add(word)
        for relation in entry["relations"]:
            if relation["title"] in ["派生語", "派生元"]:
                relation["title"] = "派生"
            if relation["id"] not in entries or not relation["title"].strip():
                raise ValueError("関連語が存在しない")
            relation["head"] = entries[relation["id"]]["head"]

    result["entries"] = sorted(
        entries.values(),
        key=lambda e: (
            unicodedata.normalize("NFD", e["head"].lower()).translate(
                {ord(c): None for c in "\u0308\u030c"}
            ),
            e["pos"],
        ),
    )

    result["counts"] = dict(
        Counter(e["pos"] if e["kind"] == "単語" else e["kind"] for e in result["entries"])
    )
    return result


def validate_inflection(model):
    if (
        not isinstance(model, dict)
        or set(model) != {"version", "settings", "overrides", "omitted"}
        or model["version"] != 1
    ):
        raise ValueError("自動補完の設定が不正")
    settings, overrides, omitted = model["settings"], model["overrides"], model["omitted"]
    if (
        not isinstance(settings, dict)
        or not isinstance(overrides, dict)
        or not isinstance(omitted, list)
    ):
        raise ValueError("自動補完の設定が不正")
    strings = {
        "nounPattern",
        "obliqueStem",
        "strongStem",
        "presentStem",
        "adjectiveStem",
        "femaleStem",
        "neuterStem",
        "neuterForm",
        "conjugation",
        "pronounPattern",
    }
    for key, value in settings.items():
        if key in strings:
            if not isinstance(value, str):
                raise ValueError("語幹の設定が不正")
            if key == "nounPattern" and value not in [
                "auto",
                "consonant",
                "a",
                "o",
                "short",
                "glide",
                "plural-a",
                "plural-i",
                "aq",
            ]:
                raise ValueError("曲用語尾が不正")
            if key == "conjugation" and value not in [
                "",
                "a/e交替",
                "e/i交替",
                "o/u交替",
                "非交替",
                "母音幹",
            ]:
                raise ValueError("活用分類が不正")
            if key == "pronounPattern" and value not in ["none", "caq"]:
                raise ValueError("代名詞の曲用規則が不正")
            if (
                key not in ["nounPattern", "conjugation", "pronounPattern"]
                and value
                and not re.fullmatch(r"[A-Za-zÄÖÜŠŽČäöüšžč]+-?", value)
            ):
                raise ValueError("語幹の設定が不正")
        elif key not in ["impersonal", "gerundDeclension"] or not isinstance(value, bool):
            raise ValueError("自動補完の設定が不正")
    if any(
        not key.strip() or not isinstance(value, str) or not value.strip()
        for key, value in overrides.items()
    ):
        raise ValueError("語形の補完設定が不正")
    if any(not isinstance(value, str) or not value.strip() for value in omitted):
        raise ValueError("語形の補完設定が不正")
