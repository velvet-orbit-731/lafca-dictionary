"""文法に基づく語形の補完。資料明記形を一般規則より優先する。"""

import re
from entry_model import CASES, GENDERS, LEX, VOWELS, add_table, first_word, form


def umlaut(stem):
    for index in range(len(stem) - 1, -1, -1):
        if stem[index].lower() in VOWELS:
            return (
                stem[:index]
                + stem[index].translate(str.maketrans("aouAOU", "äöüÄÖÜ"))
                + stem[index + 1 :]
            )
    return stem


def join(stem, ending):
    if stem[-1] in VOWELS and ending[0] in VOWELS:
        return stem + ("j" if stem[-1] in "ieäüö" else "w") + ending
    return stem + ending


def bare(stem):
    if stem.endswith("g"):
        return stem[:-1] + ("k" if stem[-2:-1] in "nrl" else "q")
    return stem[:-1] + "k" if stem.endswith("c") else stem


def change_last(stem, strong, weak):
    index = stem.rfind(strong)
    if index < 0:
        raise ValueError(f"{stem}: {strong}/{weak} の母音がない")
    return stem[:index] + weak + stem[index + 1 :]


def nominal_stem(entry, feminine_a=False):
    head, g = entry["head"], entry["grammar"]
    match = re.search(r"(?:Ⅰ|Ⅱ|不規則)\s+(" + LEX + r")-", g)
    if not match:
        match = re.search(r"(?:[（(]|緩衝子音\s+)(" + LEX + r")-", g)
    if match:
        return match[1]
    if feminine_a:
        return head[:-1]
    genitive = first_word(entry["explicit"].get("単数属格"))
    if genitive and genitive.endswith("en"):
        return genitive[:-2]
    # 注記に「属 X」と書かれた形も明記形。型の推測には使わない。
    match = re.search(r"(?:^|[。\s])属\s+(" + LEX + r"en)\b", entry["note"])
    if match:
        entry["explicit"]["単数属格"] = match[1]
        return match[1][:-2]
    if head.endswith(("q", "k")):
        plural = first_word(entry["explicit"].get("複数主格"))
        if plural:
            ending = "i" if entry["gender"] == "N" else "es"
            if plural.endswith(ending):
                return plural[: -len(ending)]
        if head.endswith("k"):
            return head[:-1] + "c"
        # q は *g 起源と本来の *ɣ を区別する。綴りだけで全て g にしない。
        if "ɣ" in entry["etymology"] or "本来の" in entry["note"]:
            return head
        if re.search(r"g(?:[uīie]|[（(「\s]|$)", entry["etymology"]):
            return head[:-1] + "g"
        return None
    return head


def noun(entry):
    head, g, gender = entry["head"], entry["grammar"], entry["gender"]
    if entry["numberRestriction"] == "plural":
        # 集合名詞の性・一致と曲用語尾を分ける。単数や二重の複数は生成しない。
        entry["class"] = "固定型"
        entry["stemType"] = "-a幹" if "-a幹" in g else "-i幹" if "-i幹" in g else ""
        entry["tags"] += [GENDERS[gender], entry["class"], entry["stemType"], "複数のみ"]
        entry["stems"] = {"斜格幹": entry["explicit"].get("語幹", "未確定")}
        add_table(
            entry,
            "曲用",
            [dict(label=case, cells=[form(entry, "複数" + case)]) for case in CASES],
            ["複数"],
        )
        return
    for label, short in [("単数属格", "属"), ("単数与格", "与"), ("複数主格", "複")]:
        match = re.search(r"(?:^|[。\s])" + short + r"\s+(" + LEX + r")\b", entry["note"])
        if match:
            entry["explicit"].setdefault(label, match[1])
    grade = "Ⅰ型" if "Ⅰ" in g else "Ⅱ型" if "Ⅱ" in g else "不規則型" if "不規則" in g else "固定型"
    feminine_a = gender == "F" and head.endswith("a")
    vowel_o = gender == "M" and head.endswith("o") and ("M(o)" in g or "-o 幹" in g)
    short_vowel = "短語尾" in g
    stem = nominal_stem(entry, feminine_a)
    entry["class"] = grade
    entry["stemType"] = (
        "-" + head[-1] + "幹"
        if short_vowel
        else (
            "-a幹"
            if feminine_a
            else "-o幹" if vowel_o else "母音幹" if head[-1] in VOWELS else "子音幹"
        )
    )
    entry["tags"] += [GENDERS[gender], grade, entry["stemType"]]
    numbers = ["単数"] if entry["numberRestriction"] == "singular" else ["単数", "複数"]
    if entry["numberRestriction"] == "singular":
        entry["tags"].append("複数形なし")
    entry["stems"] = {
        "斜格幹": (head[:-1] if vowel_o or short_vowel else stem) + "-" if stem else ""
    }
    values = {}
    if short_vowel:
        # 2.2.5：語幹母音を持つ短い格語尾。性と曲用の種類は独立。
        stem, vowel = head[:-1], head[-1]
        endings = [
            vowel,
            vowel + "n",
            vowel + "r",
            "o" if gender == "F" and vowel == "ä" else "u",
            vowel + "l",
        ]
        for case, ending in zip(CASES, endings):
            values["単数" + case] = stem + ending
            values["複数" + case] = (
                stem + ending + ("" if gender == "N" and case == "主格" else "s")
            )
    elif stem:
        endings = (
            ["a", "an", "ar", "o", "al"]
            if feminine_a
            else ["o", "on", "or", "u", "ol"] if vowel_o else ["", "en", "er", "u", "el"]
        )
        if vowel_o:
            stem = head[:-1]
        for index, case in enumerate(CASES):
            sing = (
                head
                if index == 0
                else join(
                    umlaut(stem) if index == 2 and not (feminine_a or vowel_o) else stem,
                    endings[index],
                )
            )
            if feminine_a or vowel_o:
                plur = join(stem, endings[index]) + "s"
            elif gender == "N":
                plur = join(stem, ["i", "ins", "irs", "us", "ils"][index])
            else:
                plur = join(
                    umlaut(stem) if index == 2 else stem, ["es", "ens", "ers", "us", "els"][index]
                )
            values["単数" + case], values["複数" + case] = sing, plur
    values["単数主格"] = head
    if not stem:
        raise ValueError("名詞語幹がない: " + head)
    rows = []
    for case in CASES:
        cells = [
            form(
                entry,
                number + case,
                values.get(number + case),
                "2.2.5",
                explicit=number == "単数" and case == "主格",
            )
            for number in numbers
        ]
        rows.append(dict(label=case, cells=cells))
    plural_title = {"manž": "複数（男たち）", "bidiš": "複数（口語）", "hor": "複数（口語）"}.get(
        head, "複数"
    )
    add_table(entry, "曲用", rows, ["単数"] + ([plural_title] if "複数" in numbers else []))
    if gender == "F" and not feminine_a and not short_vowel:
        entry["usage"].append("一致は女性、格語尾は男性と共通。")


def participle(stem):
    if stem.endswith("bb"):
        body = stem[:-2] + "pt"
    elif stem.endswith("nd"):
        body = stem[:-2] + "nt"
    elif stem.endswith("ld"):
        body = stem[:-2] + "lt"
    elif stem.endswith("d"):
        body = stem[:-1] + "tt"
    elif stem.endswith(("s", "š", "ž", "t")):
        body = stem + "et"
    elif re.search(r"[^" + VOWELS + r"rlmnwj][rl]$", stem):
        body = stem[:-1] + "e" + stem[-1] + "t"
    else:
        body = stem[:-1] + {"g": "ct", "v": "ft", "b": "pt", "q": "ht"}.get(
            stem[-1], stem[-1] + "t"
        )
    return join("di", body)


def verb(entry):
    head, g = entry["head"], entry["grammar"]
    if head == "cwisprägen":
        related_form = entry["explicit"].pop("単数属格", None)
        if related_form:
            entry["usage"].append(
                "原資料の「属格単数 "
                + related_form
                + "」は関連名詞 cwispräq の形。動詞の活用には含めない。"
            )
    pair = re.search(r"交替\s+([aeo])/([eiu])", g)
    vowel = "母音幹" in g or head == "jen"
    irregular = "不規則" in g or head == "zen"
    entry["class"] = pair[1] + "/" + pair[2] + "交替" if pair else "母音幹" if vowel else "非交替"
    entry["tags"].append(entry["class"])
    if irregular:
        entry["tags"].append("不規則")
    entry["stemType"] = "母音幹" if vowel else "子音幹"
    # 品詞欄に登録されている主形も拾う。
    grammar_pair = re.search(r"：\s*(" + LEX + r")\s*/\s*(" + LEX + r")", g)
    if grammar_pair:
        entry["explicit"].setdefault("現在3単数", grammar_pair[1])
        entry["explicit"].setdefault("アオリスト", grammar_pair[2])
    for label, pattern in [
        ("過去分詞", r"過去分詞\s+(" + LEX + ")"),
        ("現在3複数", r"3 複\s+(" + LEX + ")"),
    ]:
        match = re.search(pattern, entry["note"])
        if match:
            entry["explicit"].setdefault(label, match[1])
    values = {"不定形": head}
    if not vowel:
        strong = head[:-2] if head.endswith("en") else None
        if not strong:
            entry["issues"].append("不定形から語幹を確定できない。")
            return
        weak = change_last(strong, pair[1], pair[2]) if pair else strong
        entry["stems"] = {"現在語幹": weak + "-", "強語幹" if pair else "語幹": strong + "-"}
        third_plural = (
            weak[:-1] + "ži"
            if weak.endswith(("d", "t"))
            else (
                weak + "i"
                if weak.endswith(("s", "ž"))
                else (
                    weak[:-1] + "e" + weak[-1] + "si"
                    if re.search(r"[^" + VOWELS + r"rlmnwj][rl]$", weak)
                    else weak + "si"
                )
            )
        )
        values.update(
            zip(
                ["現在1単数", "現在2単数", "現在3単数", "現在1複数", "現在2複数", "現在3複数"],
                [
                    join(weak, "as"),
                    join(weak, "eč"),
                    bare(weak),
                    join(weak, "ev"),
                    join(weak, "eg"),
                    third_plural,
                ],
            )
        )
        values.update(
            {
                "アオリスト": bare(strong) if pair else join(strong, "it"),
                "命令単数": bare(strong),
                "命令複数": join(strong, "eg"),
                "接続法": join(weak, "es"),
                "条件法": join(strong, "an"),
                "動名詞": join(weak, "ad"),
                "過去分詞": participle(weak),
            }
        )
        if head in ("pipren", "bisčlen"):
            # 裸形の緩衝音は母音始まりの語尾の前には持ち込まない。
            values["命令単数"] = first_word(entry["explicit"].get("現在3単数"))
    else:
        stem = first_word(entry["explicit"].get("現在3単数"))
        if not stem:
            raise ValueError("母音幹動詞の現在語幹がない: " + head)
        entry["stems"] = {"現在語幹": stem + "-"}
        a_stem = stem[:-1] + "a" if stem.endswith("e") else stem
        values.update(
            {
                "現在1単数": a_stem + "s",
                "現在2単数": stem + "č",
                "現在3単数": stem,
                "現在1複数": stem + "v",
                "現在2複数": stem + "g",
                "現在3複数": stem + "si",
                "アオリスト": stem + "t",
                "命令単数": stem,
                "命令複数": stem + "g",
                "接続法": stem + "s",
                "条件法": a_stem + "n",
                "動名詞": stem + "d",
                "過去分詞": join("di", stem + "t"),
            }
        )
    # 活用表の明記形を辞書形より下、一般規則より上に置く。
    grammar_tables = {
        "len": [
            "las",
            "leč",
            "le",
            "lev",
            "leg",
            "lesi",
            "lit",
            "le",
            "leg",
            "les",
            "lan",
            "lad",
            "dilt",
        ],
        "jen": [
            "jas",
            "jič",
            "ji",
            "jiv",
            "jig",
            "jisi",
            "je",
            "ja",
            "jag",
            "jes",
            "jan",
            "jad",
            "dijet",
        ],
        "tän": [
            "täs",
            "täč",
            "tä",
            "täv",
            "täg",
            "täsi",
            "tät",
            "tä",
            "täg",
            "täs",
            "tän",
            "täd",
            "dität",
        ],
        "tanen": [
            "tenas",
            "teneč",
            "ten",
            "tenev",
            "teneg",
            "tensi",
            "tan",
            "tan",
            "taneg",
            "tenes",
            "tanan",
            "tenad",
            "ditent",
        ],
    }
    labels = [
        "現在1単数",
        "現在2単数",
        "現在3単数",
        "現在1複数",
        "現在2複数",
        "現在3複数",
        "アオリスト",
        "命令単数",
        "命令複数",
        "接続法",
        "条件法",
        "動名詞",
        "過去分詞",
    ]
    special = dict(zip(labels, grammar_tables.get(head, [])))
    if head in grammar_tables:
        entry["issues"] = []
    if head == "fen":
        special["動名詞"] = "fed"
    values.update(special)
    if head == "oren":
        entry["usage"].append("アオリスト or / orit は両方とも標準語。")
    if head == "žolden":
        entry["usage"].append("アオリスト žoldit は口語形。")
    if head == "šimen":
        entry["usage"].append("アオリスト šem は首都口語の形（規範外）。標準形は šimit。")
    if head == "deqen":
        entry["tags"].append("無主語")
        entry["usage"].append("無主語の天候動詞。人称別の活用形は設定しない。")

    def vf(label):
        section = ("2.4.8" if head == "fen" else "2.4.7") if label in special else "2.4.2–2.4.8"
        return form(
            entry, label, values.get(label), section, explicit=label in special or label == "不定形"
        )

    if head == "deqen":
        add_table(entry, "現在", [dict(label="無人称", cells=[vf("現在3単数")])], ["語形"])
    else:
        add_table(
            entry,
            "現在の人称活用",
            [
                dict(
                    label=f"{person}人称", cells=[vf(f"現在{person}単数"), vf(f"現在{person}複数")]
                )
                for person in [1, 2, 3]
            ],
            ["単数", "複数"],
        )
    nonpresent = ["不定形"] + [
        label for label in labels[6:] if head != "deqen" or not label.startswith("命令")
    ]
    add_table(
        entry,
        "時制・法・非定形",
        [dict(label=label, cells=[vf(label)]) for label in nonpresent],
        ["語形"],
    )
    entry["usage"].append(
        "アオリストは全人称同形。未来は ša ＋現在形、進行は le ＋動名詞、完了は he ＋過去分詞。"
    )


def adjective(entry, comparison=True):
    head = entry["head"]
    vowel = head[-1] in VOWELS
    female = first_word(entry["explicit"].get("女性形"))
    neuter = first_word(entry["explicit"].get("中性形"))
    if head == "žis":
        female, neuter = "žisa", "žis"
        entry["explicit"].update({"女性形": female, "中性形": neuter})
    # q/g は形容詞について文法5.1が明示する。
    stem = (
        head[:-1] + ("g" if head.endswith(("q", "nk")) else "c")
        if head.endswith(("q", "k"))
        else head
    )
    female = female or join(stem, "a")
    neuter = neuter or bare(umlaut(stem))
    female_stem = female[:-1]
    neuter_stem = umlaut(stem)
    entry["class"] = "母音幹" if vowel else "子音幹"
    entry["stemType"] = "母音幹" if vowel else "子音幹"
    entry["tags"] += [entry["class"], "中性ウムラウト型" if neuter != head else "男性・中性同形型"]
    if female_stem != stem and not vowel:
        entry["tags"].append("語幹短縮型")
    if head.endswith(("q", "k")):
        entry["tags"].append("語末子音交替")
    entry["stems"] = {
        "男性語幹": stem + "-",
        "女性語幹": female_stem + "-",
        "中性語幹": neuter_stem + "-",
    }
    entry["explicit"]["男性形"] = head
    values = {"男性単数主格": head, "女性単数主格": female, "中性単数主格": neuter}
    for i, case in enumerate(CASES):
        if i:
            ending = ["", "en", "er", "u", "el"][i]
            values["男性単数" + case] = join(umlaut(stem) if i == 2 else stem, ending)
            values["女性単数" + case] = join(female_stem, ["", "an", "ar", "o", "al"][i])
            values["中性単数" + case] = join(neuter_stem, ending)
        values["男性複数" + case] = join(
            umlaut(stem) if i == 2 else stem, ["es", "ens", "ers", "us", "els"][i]
        )
        values["中性複数" + case] = values["男性複数" + case]
        values["女性複数" + case] = join(female_stem, ["as", "ans", "ars", "os", "als"][i])
    for number in ["単数", "複数"]:
        rows = []
        for case in CASES:
            cells = []
            for gender in ["男性", "女性", "中性"]:
                label = gender + number + case
                if number == "単数" and case == "主格" and gender + "形" in entry["explicit"]:
                    entry["explicit"][label] = entry["explicit"][gender + "形"]
                cells.append(form(entry, label, values[label], "2.2.7・1.4"))
            rows.append(dict(label=case, cells=cells))
        add_table(entry, "性・格の一致（" + number + "）", rows, ["男性", "女性", "中性"])
    entry["usage"].append(
        "限定用法では性・数・格に一致。叙述用法は基本形 " + head + "。中性複数は男性複数と共通。"
    )
    if comparison:
        add_table(
            entry,
            "比較・派生",
            [
                dict(label=label, cells=[form(entry, label, value, "2.2.7")])
                for label, value in [
                    ("比較級", join(stem, "ar")),
                    ("最上級", "uc" + head),
                    ("文語最上級", join(umlaut(stem), "ist")),
                    ("副詞形", join(stem, "u")),
                ]
            ],
            ["語形"],
        )
        entry["usage"].append("uc- 最上級にはウムラウトの有無の揺れがある。表は基本形を保つ系列。")
