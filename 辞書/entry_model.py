"""辞書項目の共通定義、出典、語形表、閲覧用データ。ビルド処理には依存しない。"""

from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DICT = "dictionary.json"
GRAMMAR = "ラフカ語文法.md"
VOWELS = "aeiouäöü"
LEX = r"[A-Za-zÄÖÜŠŽČäöüšžč]+"
CASES = ["主格", "属格", "与格", "奪格", "再帰格"]
GENDERS = {"M": "男性", "F": "女性", "N": "中性"}
PARTS_OF_SPEECH = [
    "名詞",
    "代名詞",
    "動詞",
    "形容詞",
    "連体詞",
    "副詞",
    "前置詞",
    "接続詞",
    "小辞",
    "間投詞",
]


def plain(text):
    return "" if text == "—" else text.replace("<br>", "\n")


def reference(entry):
    source = entry["source"]
    return source.get("url") or f"{source['file']}:{source.get('id', source.get('line', ''))}"


def grammar_ref(section):
    return f"{GRAMMAR} §{section}"


def first_word(text):
    match = re.match(r"[（(]?(" + LEX + r")", text or "")
    return match[1] if match else None


def form(entry, label, value=None, section=None, explicit=False, note=""):
    if label in entry["explicit"]:
        value, explicit, section = entry["explicit"][label], True, None
    return dict(
        label=label,
        value=value,
        origin="資料明記" if explicit else "規則補完" if value else "未確定",
        source=grammar_ref(section) if section else reference(entry),
        note=note,
    )


def add_table(entry, title, rows, columns):
    entry["tables"].append(dict(title=title, columns=columns, rows=rows))


def all_forms(entry):
    return [cell for table in entry["tables"] for row in table["rows"] for cell in row["cells"]]


def display_form(value):
    # 括弧内の原資料の注釈は監査用データに残し、表示する語形からは外す。
    if not value:
        return None
    return re.sub(
        r"[（(]([^）)]*)[）)]",
        lambda m: m[1] if re.fullmatch(r"[A-Za-zÄÖÜŠŽČäöüšžč /-]+", m[1]) else "",
        value,
    ).strip()


def browser_data(data):
    entries = []
    for entry in data["entries"]:
        item = {
            key: entry[key]
            for key in [
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
            ]
        }
        if "senseTags" in entry:
            item["senseTags"] = entry["senseTags"]
        if "inflection" in entry:
            item["inflection"] = entry["inflection"]
        item["tables"] = [
            dict(
                title=table["title"],
                columns=table["columns"],
                rows=[
                    dict(
                        label=row["label"],
                        cells=[
                            dict(label=f["label"], value=display_form(f["value"]))
                            for f in row["cells"]
                        ],
                    )
                    for row in table["rows"]
                ],
            )
            for table in entry["tables"]
        ]
        entries.append(item)
    return {"partsOfSpeech": PARTS_OF_SPEECH, "entries": entries}
