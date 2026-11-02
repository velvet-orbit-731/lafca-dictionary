"""Tag taxonomy shared with taxonomy.js through taxonomy.json."""

import json
import re
import entry_model
from pathlib import Path

CONFIG = json.loads(Path(__file__).with_name("taxonomy.json").read_text())


def label(tag):
    return CONFIG["labels"].get(tag, tag)


def lines(meaning):
    return [
        s
        for line in meaning.splitlines()
        if (s := ", ".join(x.strip() for x in re.split("[,、]", line) if x.strip()))
    ]


def allowed(entry):
    return [
        t
        for g in CONFIG["senseGroups"]
        if (not g["pos"] or entry["pos"] in g["pos"])
        and (entry["kind"] != "接辞" or g["name"] == "使用域・待遇")
        for t in g["tags"]
    ]


def leaves(tags):
    def children(tag):
        return [x for child in CONFIG["parents"].get(tag, []) for x in [child, *children(child)]]

    tags = list(dict.fromkeys(label(t) for t in tags if t))
    return [t for t in tags if not set(children(t)).intersection(tags)]


def sense_tags(entry):
    permitted = allowed(entry)
    old = entry.get("tags", [])
    defaults = (
        []
        if "senseTags" in entry
        else [entry["numeralType"], *[label(t) for t in old if label(t) in permitted]]
    )
    if "senseTags" not in entry and entry["pos"] == "代名詞" and {"疑問", "数量"} <= set(old):
        defaults.append("数量疑問")
    result = []
    for meaning in lines(entry["meaning"]):
        tags = [
            t
            for s in entry.get("senseTags", [])
            if "\n".join(lines(s["meaning"])) == meaning
            for t in s["tags"]
        ]
        tags = leaves([t for t in [*tags, *defaults] if t in permitted])
        if tags:
            result.append({"meaning": meaning, "tags": tags})
    return result


def noun_pattern(entry):
    p = entry.get("inflection", {}).get("settings", {}).get("nounPattern", "auto")
    if p != "auto":
        return p
    head = entry["head"]
    if entry["numberRestriction"] == "plural":
        return (
            "plural-a" if head.endswith("a") else "plural-i" if head.endswith("i") else "consonant"
        )
    gen = next(
        (
            entry_model.display_form(f["value"])
            for f in entry_model.all_forms(entry)
            if f["label"] == "単数属格"
        ),
        "",
    )
    # Explicit settings win; otherwise use the attested genitive, including short-vowel exceptions.
    if "inflection" not in entry and head[-1] in entry_model.VOWELS:
        if gen == head + "n":
            return {"a": "a", "o": "o"}.get(head[-1], "short")
        if gen.endswith("en"):
            return "glide"
    if entry["gender"] == "F" and head.endswith("a"):
        return "a"
    if entry["gender"] == "M" and head.endswith("o"):
        return "o"
    if head[-1] in entry_model.VOWELS:
        return (
            "glide"
            if head.endswith("ö") or entry["gender"] == "F" and head.endswith("ü")
            else "short"
        )
    return "consonant"


def tags(entry):
    p, head = entry["pos"], entry["head"]
    extra = [label(t) for t in entry.get("tags", [])]
    result = [
        p,
        (
            ("接頭辞" if head.endswith("-") else "接尾辞")
            if entry["kind"] == "接辞"
            else "慣用句" if entry["kind"] == "慣用句" else ""
        ),
    ]
    if p == "名詞":
        result += [
            entry_model.GENDERS.get(entry["gender"]),
            label(entry["class"]),
            CONFIG["patterns"][noun_pattern(entry)],
            {"singular": "単数のみ", "plural": "複数のみ"}.get(entry["numberRestriction"]),
            "人名" if "人名" in extra else "",
        ]
    if p == "動詞":
        result += [entry["class"], *[t for t in ["不規則活用", "無主語"] if t in extra]]
    if p == "形容詞":
        result += [entry["class"]]
        forms = {
            f["label"]: entry_model.display_form(f["value"]) for f in entry_model.all_forms(entry)
        }
        if forms.get("中性単数主格"):
            result.append("中性同形" if forms["中性単数主格"] == head else "中性ウムラウト")
        female = entry.get("inflection", {}).get("settings", {}).get("femaleStem") or forms.get(
            "女性単数属格", ""
        ).removesuffix("an")
        if (
            "女性語幹短縮" in extra
            or female
            and head[-1] not in entry_model.VOWELS
            and len(female) < len(head)
        ):
            result.append("女性語幹短縮")
    return list(dict.fromkeys(t for t in result if t))


def validate(entry):
    if "senseTags" not in entry:
        return
    senses = entry["senseTags"]
    if not isinstance(senses, list):
        raise ValueError("語義の分類が不正")
    seen = set()
    for s in senses:
        if (
            not isinstance(s, dict)
            or set(s) != {"meaning", "tags"}
            or s["meaning"] not in lines(entry["meaning"])
            or s["meaning"] in seen
            or not isinstance(s["tags"], list)
            or any(t not in allowed(entry) for t in s["tags"])
            or len(set(s["tags"])) != len(s["tags"])
        ):
            raise ValueError("語義と分類が一致しない")
        if {"可算", "不可算"} <= set(s["tags"]) or {"基数", "序数"} <= set(s["tags"]):
            raise ValueError("語義の分類が矛盾")
        seen.add(s["meaning"])
