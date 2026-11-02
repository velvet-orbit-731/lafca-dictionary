"""語形は実装から作らず、文法の表・辞書の明記例と比較する。"""

import json
import hashlib
import re
from copy import deepcopy
import unittest
from collections import Counter
from pathlib import Path
import build
import entry_model
import inflection
import lexicon
import export_pages


class DictionaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = lexicon.collect()
        cls.entries = cls.data["entries"]

    def entry(self, head, pos=None):
        return next(
            e for e in self.entries if e["head"] == head and (pos is None or e["pos"] == pos)
        )

    def forms(self, head, pos=None):
        return {f["label"]: f["value"] for f in entry_model.all_forms(self.entry(head, pos))}

    def test_web_catalog_is_the_only_vocabulary_source(self):
        catalog = lexicon.web_source.load()
        public = entry_model.browser_data(self.data)["entries"]
        self.assertEqual(public, catalog["entries"])
        self.assertEqual(len(public), 1047)
        self.assertEqual(len({e["id"] for e in public}), 1047)
        self.assertNotIn("fissačovin", [e["head"] for e in public])
        self.assertFalse((entry_model.ROOT / "ラフカ語辞書.md").exists())
        self.assertFalse((entry_model.HERE / "edits.json").exists())
        roots = "al barz at ark räl ded ok beld ern dank car bek rask ov in lan vitt coh der oz lur ez far bef ja".split()
        for head in roots:
            self.assertEqual(self.entry(head)["pos"], "名詞")
        self.assertFalse(any("州" in e["head"] or "地名" in e["tags"] for e in public))

    def test_registered_fields_and_metadata_survive_round_trip(self):
        catalog = lexicon.web_source.load()
        self.assertEqual(lexicon.catalog_from_data(self.data, catalog), catalog)
        for e in self.entries:
            self.assertEqual(e["source"]["id"], e["id"])
            self.assertTrue(e["source"]["url"].endswith("#word=" + e["id"]))
            self.assertEqual(e["etymology"], catalog["metadata"].get(e["id"], {}).get("etymology", ""))

    def test_lexical_entries_exclude_templates_and_fossil_affixes(self):
        heads = {e["head"] for e in self.entries}
        for head in ["gessad 等", "u ＋ 与格", "zen pfor ＋ 動名詞", "-ča", "-t-"]:
            self.assertNotIn(head, heads)
        for e in self.entries:
            self.assertNotRegex(e["head"], r"[\u3040-\u9fff＋]")
        self.assertIn("〜で（所要時間）", self.entry("u", "前置詞")["meaning"])
        # 接辞を除いても、個別に覚える派生語は残す。
        for head in ["horča", "tešten", "žiften", "polten", "septen"]:
            self.assertIn(head, heads)

    def test_regular_gerunds_are_verb_forms_not_lexical_entries(self):
        heads = {e["head"] for e in self.entries}
        for base, gerund in [("gassen", "gessad"), ("homen", "humad"), ("seben", "sibad")]:
            self.assertNotIn(gerund, heads)
            self.assertEqual(self.forms(base)["動名詞"], gerund)
            self.assertEqual(self.forms(base)["動名詞単数主格"], gerund)
            self.assertEqual(self.entry(base)["pos"], "動詞")
        for head in ["gäss", "hlend", "banüj"]:
            self.assertIn(head, heads)
            self.assertEqual(self.entry(head)["pos"], "名詞")
        public = entry_model.browser_data(self.data)["entries"]
        self.assertTrue({"gessad", "humad", "sibad"}.isdisjoint(e["head"] for e in public))
        gassen = next(e for e in public if e["head"] == "gassen")
        self.assertIn(
            {"label": "動名詞単数与格", "value": "gessäder"}, entry_model.all_forms(gassen)
        )

    def test_noun_classes_are_not_umlaut_classes(self):
        classes = Counter(e["class"] for e in self.entries if e["section"] == "名詞")
        self.assertEqual(classes, {"固定型": 357, "Ⅰ型": 19, "Ⅱ型": 130, "不規則型": 4})
        self.assertEqual(self.entry("amalbuh")["class"], "固定型")
        self.assertEqual(self.forms("amalbuh")["単数与格"], "amalbüher")
        self.assertEqual(self.entry("blaclor")["class"], "Ⅱ型")
        self.assertEqual(self.entry("žuser")["class"], "Ⅰ型")

    def test_borrowed_personal_names_preserve_source_gender_and_stems(self):
        male = set(
            "Vih Fetel Ivos Dalten Cerzes Hort Cral Jüven Jomer Begit Rur Gošmen Gör Solük Magel Gavert Ulad Halnük Conoh Davarük Mis Petres Oš Calmon Igul Idrit Badre Lumit Jutvan Cevan Javen".split()
        )
        female = set(
            "Halša Fläja Lena Maleš Alica Izveša Amina Trina Cohana Tena Soviza Nazvisa Lepel Jörgina Šena".split()
        )
        names = [e for e in self.entries if e["section"] == "借用人名"]
        self.assertEqual({e["head"] for e in names if e["gender"] == "M"}, male)
        self.assertEqual({e["head"] for e in names if e["gender"] == "F"}, female)
        for e in names:
            self.assertEqual(
                (e["pos"], e["class"], e["numberRestriction"]), ("名詞", "固定型", "singular")
            )
            self.assertEqual(
                {f["label"] for f in entry_model.all_forms(e)},
                {"単数" + c for c in entry_model.CASES},
            )
            self.assertEqual(e["protoForms"], [])
        for head, forms in {
            "Fetel": ["Fetel", "Fetlen", "Fetler", "Fetlu", "Fetlel"],
            "Jomer": ["Jomer", "Jomren", "Jömrer", "Jomru", "Jomrel"],
            "Magel": ["Magel", "Maglen", "Mägler", "Maglu", "Maglel"],
            "Lepel": ["Lepel", "Leplen", "Lepler", "Leplu", "Leplel"],
            "Maleš": ["Maleš", "Malešen", "Malešer", "Malešu", "Malešel"],
            "Solük": ["Solük", "Solücen", "Solücer", "Solücu", "Solücel"],
            "Badre": ["Badre", "Badren", "Badrer", "Badru", "Badrel"],
            "Oš": ["Oš", "Ošen", "Öšer", "Ošu", "Ošel"],
            "Šena": ["Šena", "Šenan", "Šenar", "Šeno", "Šenal"],
        }.items():
            self.assertEqual(
                self.forms(head), dict(zip(["単数" + c for c in entry_model.CASES], forms))
            )

    def test_full_noun_tables_match_grammar(self):
        fixtures = {
            "žuser": [
                ["žuser", "žusares"],
                ["žusaren", "žusarens"],
                ["žusärer", "žusärers"],
                ["žusaru", "žusarus"],
                ["žusarel", "žusarels"],
            ],
            "lun": [
                ["lun", "lones"],
                ["lonen", "lonens"],
                ["löner", "löners"],
                ["lonu", "lonus"],
                ["lonel", "lonels"],
            ],
            "fož": [
                ["fož", "fužes"],
                ["fužen", "fužens"],
                ["füžer", "füžers"],
                ["fužu", "fužus"],
                ["fužel", "fužels"],
            ],
            "tino": [
                ["tino", "tinos"],
                ["tinon", "tinons"],
                ["tinor", "tinors"],
                ["tinu", "tinus"],
                ["tinol", "tinols"],
            ],
            "lossa": [
                ["lossa", "lussas"],
                ["lussan", "lussans"],
                ["lussar", "lussars"],
                ["lusso", "lussos"],
                ["lussal", "lussals"],
            ],
            "fü": [
                ["fü", "füjes"],
                ["füjen", "füjens"],
                ["füjer", "füjers"],
                ["füju", "füjus"],
                ["füjel", "füjels"],
            ],
            "fäq": [
                ["fäq", "fägi"],
                ["fägen", "fägins"],
                ["fäger", "fägirs"],
                ["fägu", "fägus"],
                ["fägel", "fägils"],
            ],
        }
        for head, expected in fixtures.items():
            with self.subTest(head=head):
                self.assertEqual(
                    [
                        [c["value"] for c in r["cells"]]
                        for r in self.entry(head)["tables"][0]["rows"]
                    ],
                    expected,
                )

    def test_native_names_share_personal_name_tag_and_preserve_forms(self):
        male = set(
            "Wolhor Völžiber Nardhor Horžöld Täršin Ämhor Jurehor Reftlum Gadelvers Dronhor Hortar Jožeb Lontar Wolbront Woltar Nardvers Nardlum Ämžöld Jureseb Reftbront Balväm Balv Gadeltar Brämseb Čirvers Bracšin Tonnvers Tönnžiber Lönšin Jodlum Tarbront Ridhor Ridvers Civtar Civžöld Fihbront Fihtar Šarnhor Šärnžiber Ertvers Ertžöld Emelhor Emelvers Fithor Fitbront Sänanhor Sänantar Irfathor Irfätšin Connbront Cönnžiber Fattlum Fattvers Lagvers Laglum Žalhor Žalšin Nahvers Nähžiber Sivhor Völsiv Jödfirr Tonntäbir Bracžif Tonnmüšo Čiržel Horžägeh Völšin Drontar Dronlum Jurebront Čirwol Civ Jurežöld Brämtar Šarn Völfirr Ert Nardäm Reftäm Irfatäm Gädelšin Dronvers Fattäm Drönfirr Nahäm Horwol Siv Bracäm".split()
        )
        female = set(
            "Völrida Lönrida Hörrida Hörciva Gädelfiha Horloma Tonnarda Jočarna Očarna Horerta Wolhorča Nardhorča Lontara".split()
        )
        names = [e for e in self.entries if e["section"] == "固有人名"]
        self.assertEqual({e["head"] for e in names if e["gender"] == "M"}, male)
        self.assertEqual({e["head"] for e in names if e["gender"] == "F"}, female)
        self.assertEqual(sum("人名" in e["tags"] for e in self.entries), 150)
        for e in self.entries:
            self.assertFalse({"借用人名", "固有人名"} & set(e["tags"]))
        for e in names:
            self.assertIn("人名", e["tags"])
            self.assertEqual(
                (e["pos"], e["class"], e["numberRestriction"]), ("名詞", "固定型", "singular")
            )
            self.assertEqual(len(e["protoForms"]), 1)
            self.assertEqual(
                {f["label"] for f in entry_model.all_forms(e)},
                {"単数" + c for c in entry_model.CASES},
            )
        for head, expected in {
            "Völžiber": ["Völžiber", "Völžibren", "Völžibrer", "Völžibru", "Völžibrel"],
            "Tönnžiber": ["Tönnžiber", "Tönnžibren", "Tönnžibrer", "Tönnžibru", "Tönnžibrel"],
            "Balv": ["Balv", "Balven", "Bälver", "Balvu", "Balvel"],
            "Reftbront": ["Reftbront", "Reftbronten", "Reftbrönter", "Reftbrontu", "Reftbrontel"],
            "Tonnmüšo": ["Tonnmüšo", "Tonnmüšowen", "Tonnmüšöjer", "Tonnmüšowu", "Tonnmüšowel"],
            "Ämhor": ["Ämhor", "Ämhoren", "Ämhörer", "Ämhoru", "Ämhorel"],
            "Horloma": ["Horloma", "Horloman", "Horlomar", "Horlomo", "Horlomal"],
            "Lontara": ["Lontara", "Lontaran", "Lontarar", "Lontaro", "Lontaral"],
        }.items():
            self.assertEqual(
                self.forms(head), dict(zip(["単数" + c for c in entry_model.CASES], expected))
            )
        self.assertEqual(self.entry("Wolhor")["protoForms"], ["*wáwl-xore"])
        self.assertEqual(self.entry("Dronhor")["meaning"], "ドロンホル（男性人名）")
        self.assertEqual(self.entry("Ämhor")["meaning"], "エムホル（男性人名）")
        for e in names:
            self.assertRegex(e["meaning"], r"^[ァ-ヺー]+（[男女]性人名）$")
        self.assertIn("？？・王", self.entry("Dronhor")["note"])
        self.assertIn("語義未詳", self.entry("Dronlum")["note"])
        self.assertEqual(self.entry("Siv")["pos"], "名詞")
        self.assertEqual(self.entry("siv")["pos"], "形容詞")
        self.assertTrue(
            {"Tervos", "Ordan", "Zinzu", "Zacel", "Balvhor", "Bälvžiber", "Sivbront"}
            .isdisjoint(e["head"] for e in self.entries)
        )

    def test_collective_nouns_have_their_own_plural_only_paradigms(self):
        fixtures = {
            "manča": ("manž", ["manča", "mančan", "mančar", "mančo", "mančal"]),
            "bidašta": ("bidiš", ["bidašta", "bidaštan", "bidaštar", "bidašto", "bidaštal"]),
            "höri": ("hor", ["höri", "hörins", "hörirs", "hörus", "hörils"]),
        }
        for head, (base, expected) in fixtures.items():
            with self.subTest(head=head):
                e = self.entry(head)
                self.assertEqual(
                    (e["pos"], e["gender"], e["numberRestriction"]), ("名詞", "M", "plural")
                )
                self.assertEqual(
                    self.forms(head), dict(zip(["複数" + c for c in entry_model.CASES], expected))
                )
                self.assertEqual(e["tables"][0]["columns"], ["複数"])
                self.assertIn("複数のみ", e["tags"])
                self.assertIn(
                    {"title": "集合名詞", "head": head, "id": e["id"]},
                    self.entry(base)["relations"],
                )
                self.assertIn(
                    {"title": "対応する単数", "head": base, "id": self.entry(base)["id"]},
                    e["relations"],
                )
                self.assertTrue(set(expected).isdisjoint(self.forms(base).values()))
        self.assertEqual(self.forms("manž")["複数属格"], "manžens")
        self.assertEqual(self.forms("bidiš")["複数与格"], "bidäšers")
        self.assertEqual(self.forms("hor")["複数主格"], "hores")
        for head, plural in [("lona", "lonas"), ("fatta", "fattas"), ("banüja", "banüjas")]:
            self.assertEqual(self.entry(head)["gender"], "F")
            self.assertEqual(self.forms(head)["単数主格"], head)
            self.assertEqual(self.forms(head)["複数主格"], plural)

    def test_singular_only_nouns_have_no_plural_in_public_data(self):
        expected = set(
            "at bažod bisviq bräm čamo čir čozrak dočub düfuv fissa fräsiq geta gohel hrum lač loča naha pära ploq požam pra ruh šraz strep swüca vers zeped zigla žoht žru bänn časčrä jotta rida sprogäd deqa Lafca distžih toq stlevaž barun seriven toma vreš".split()
        )
        expected.update(e["head"] for e in self.entries if "人名" in e["tags"])
        expected.update({"pesclota", "šwešäta", "vemp", "Worel"})
        self.assertEqual(
            {e["head"] for e in self.entries if e["numberRestriction"] == "singular"}, expected
        )
        public = {e["id"]: e for e in entry_model.browser_data(self.data)["entries"]}
        for head in expected:
            with self.subTest(head=head):
                e = self.entry(head)
                self.assertIn("単数のみ", e["tags"])
                self.assertEqual(set(self.forms(head)), {"単数" + c for c in entry_model.CASES})
                # ウェブで保存した単列の「語形」表も、五格・単数だけなら有効。
                self.assertIn(e["tables"][0]["columns"], [["単数"], ["語形"]])
                self.assertTrue(
                    all("複数" not in f["label"] for f in entry_model.all_forms(public[e["id"]]))
                )
        self.assertEqual(
            self.forms("fissa"),
            dict(
                zip(
                    ["単数" + c for c in entry_model.CASES],
                    ["fissa", "fissan", "fissar", "fisso", "fissal"],
                )
            ),
        )
        for head, genitive in [("loča", "lučan"), ("žoht", "žuhten"), ("lač", "lečen")]:
            self.assertEqual(self.entry(head)["class"], "Ⅱ型")
            self.assertEqual(self.forms(head)["単数属格"], genitive)
        self.assertEqual(self.entry("fissa")["gender"], "F")
        self.assertEqual(self.entry("čir")["gender"], "N")
        self.assertEqual(self.entry("žoht")["gender"], "M")
        # 数えられる語義を持つ名詞や、数詞の複数を一律に削除しない。
        for head in ["bres", "larba", "hran", "rosta", "fit", "sänan", "žal", "div"]:
            self.assertIn("複数主格", self.forms(head))

    def test_short_stems(self):
        for head, value in [
            ("gohel", "gohlen"),
            ("goh", "gwehen"),
            ("gažal", "gažlen"),
            ("žiber", "žibren"),
        ]:
            self.assertEqual(self.forms(head)["単数属格"], value)

    def test_q_and_k_stems_are_distinguished(self):
        for head, value in [
            ("laq", "lagen"),
            ("scoq", "scoqen"),
            ("preq", "preqen"),
            ("fräsiq", "fräsigen"),
            ("žänk", "žängen"),
            ("brak", "bracen"),
        ]:
            self.assertEqual(self.forms(head)["単数属格"], value)
        self.assertEqual(self.entry("taq", "連体詞")["numeralType"], "基数")
        self.assertEqual(self.forms("taq", "名詞")["単数属格"], "tagen")

    def test_verb_classification(self):
        for head, tag in [
            ("ažmelen", "e/i交替"),
            ("banujen", "非交替"),
            ("bajen", "母音幹"),
            ("len", "不規則活用"),
            ("zen", "不規則活用"),
            ("tanen", "a/e交替"),
        ]:
            self.assertIn(tag, self.entry(head)["tags"])
        self.assertNotIn("交替動詞", self.entry("paren")["tags"])

    def test_current_person_and_sound_changes(self):
        for head, expected in {
            "gassen": ["gessas", "gessev", "gesseč", "gesseg", "gess", "gessi"],
            "hlenden": ["hlindas", "hlindev", "hlindeč", "hlindeg", "hlind", "hlinži"],
            "žoden": ["žudas", "žudev", "žudeč", "žudeg", "žud", "žuži"],
            "tän": ["täs", "täv", "täč", "täg", "tä", "täsi"],
            "len": ["las", "lev", "leč", "leg", "le", "lesi"],
            "jen": ["jas", "jiv", "jič", "jig", "ji", "jisi"],
        }.items():
            actual = [c["value"] for r in self.entry(head)["tables"][0]["rows"] for c in r["cells"]]
            self.assertEqual(actual, expected)
        self.assertEqual(self.forms("pipren")["現在1単数"], "pipras")
        self.assertEqual(self.forms("pipren")["現在3単数"], "piper")
        self.assertEqual(self.forms("tengen")["現在1単数"], "tingas")
        self.assertEqual(self.forms("tengen")["現在3単数"], "tink")

    def test_nonfinite_and_moods(self):
        for head, expected in {
            "gassen": ["gass", "gass", "gasseg", "gesses", "gassan", "gessad", "digesset"],
            "hlenden": ["hlend", "hlend", "hlendeg", "hlindes", "hlendan", "hlindad", "dihlint"],
            "ihen": ["ihit", "ih", "iheg", "ihes", "ihan", "ihad", "dijiht"],
            "jen": ["je", "ja", "jag", "jes", "jan", "jad", "dijet"],
            "len": ["lit", "le", "leg", "les", "lan", "lad", "dilt"],
            "tanen": ["tan", "tan", "taneg", "tenes", "tanan", "tenad", "ditent"],
        }.items():
            actual = self.forms(head)
            labels = [
                "アオリスト",
                "命令単数",
                "命令複数",
                "接続法",
                "条件法",
                "動名詞",
                "過去分詞",
            ]
            self.assertEqual([entry_model.first_word(actual[k]) for k in labels], expected)
        self.assertEqual(self.forms("fen")["動名詞"], "fed")
        self.assertEqual(self.forms("zen")["過去分詞"], "dizit")

    def test_adjective_agreement(self):
        expected = [
            ["ross", "rossa", "röss"],
            ["rossen", "rossan", "rössen"],
            ["rösser", "rossar", "rösser"],
            ["rossu", "rosso", "rössu"],
            ["rossel", "rossal", "rössel"],
        ]
        self.assertEqual(
            [[c["value"] for c in r["cells"]] for r in self.entry("ross")["tables"][0]["rows"]],
            expected,
        )
        for e in self.entries:
            if e["pos"] == "形容詞":
                for row in e["tables"][1]["rows"]:
                    self.assertEqual(row["cells"][0]["value"], row["cells"][2]["value"])
                self.assertNotIn("固定型", e["tags"])
        self.assertEqual(self.forms("jimal")["女性単数属格"], "jimlan")
        self.assertEqual(self.forms("buq")["女性単数主格"], "buga")
        self.assertEqual(self.forms("lämo")["女性単数主格"], "lämowa")
        self.assertEqual(self.forms("šaco")["中性単数主格"], "šacö")

    def test_all_grammatical_forms_and_noun_genders_are_defined(self):
        for e in self.entries:
            with self.subTest(head=e["head"]):
                self.assertEqual(e["issues"], [])
                self.assertTrue(
                    all(f["value"] and f["origin"] != "未確定" for f in entry_model.all_forms(e))
                )
                self.assertNotIn("未確定", e["stems"].values())
                if e["pos"] == "名詞":
                    self.assertIn(e["gender"], ["M", "F", "N"])
        self.assertNotIn("単数属格", self.forms("cwisprägen"))
        self.assertEqual(self.forms("zen pfor")["現在1単数"], "zas pfor")
        self.assertEqual(self.forms("zen pfor")["条件法"], "zan pfor")

    def test_short_vowel_noun_rules_match_registered_paradigms(self):
        # 明記形を外しても、文法の型から同じ全曲用が得られることを確認。
        for e in self.entries:
            if "短語尾" not in e["grammar"] and e["head"] != "tupü":
                continue
            generated = deepcopy(e)
            generated["explicit"], generated["tables"] = {}, []
            inflection.noun(generated)
            self.assertEqual(
                {f["label"]: f["value"] for f in entry_model.all_forms(generated)},
                self.forms(e["head"]),
                e["head"],
            )
        for head, expected in {
            "jure": ["jure", "juren", "jurer", "juru", "jurel"],
            "cori": ["cori", "corin", "corir", "coru", "coril"],
            "mešä": ["mešä", "mešän", "mešär", "mešo", "mešäl"],
            "dru": ["dru", "drun", "drur", "dru", "drul"],
            "šwü": ["šwü", "šwün", "šwür", "šwu", "šwül"],
            "tupü": ["tupü", "tupüjen", "tupüjer", "tupüju", "tupüjel"],
        }.items():
            self.assertEqual([self.forms(head)["単数" + c] for c in entry_model.CASES], expected)
        self.assertEqual(self.forms("gisi")["複数主格"], "gisi")
        self.assertEqual(self.forms("zlihi")["複数奪格"], "zlihus")
        self.assertEqual(self.forms("füsžli")["複数主格"], "füsžlis")

    def test_vowel_verbs_and_cluster_junctions(self):
        expected = {
            "bajen": ["bas", "bas", "ban", "bad", "dibat"],
            "fafan": ["fafas", "fafas", "fafan", "fafad", "difafat"],
            "fen": ["fas", "fes", "fan", "fed", "difet"],
            "napan": ["napas", "napas", "napan", "napad", "dinapat"],
            "tahan": ["tahas", "tahas", "tahan", "tahad", "ditahat"],
            "tu": ["tus", "tus", "tun", "tud", "ditut"],
            "žahan": ["žahas", "žahas", "žahan", "žahad", "dižahat"],
            "zen": ["zas", "zes", "zan", "zed", "dizit"],
            "žigan": ["žigas", "žigas", "žigan", "žigad", "dižigat"],
        }
        labels = ["現在1単数", "接続法", "条件法", "動名詞", "過去分詞"]
        for head, values in expected.items():
            self.assertEqual([self.forms(head)[label] for label in labels], values, head)
            generated = deepcopy(self.entry(head))
            generated["tables"] = []
            generated["explicit"] = {
                k: v
                for k, v in generated["explicit"].items()
                if k in ["現在3単数", "アオリスト", "過去分詞"]
            }
            inflection.verb(generated)
            forms = {f["label"]: f["value"] for f in entry_model.all_forms(generated)}
            self.assertEqual([forms[label] for label in labels], values, head)
        for head, plural, participle in [
            ("pipren", "pipersi", "dipipert"),
            ("bisčlen", "bisčelsi", "dibisčelt"),
            ("jibben", "jibbsi", "dijipt"),
            ("tepžen", "tipži", "ditipžet"),
        ]:
            self.assertEqual(self.forms(head)["現在3複数"], plural)
            self.assertEqual(self.forms(head)["過去分詞"], participle)
        self.assertEqual(inflection.participle("pipr"), "dipipert")
        self.assertEqual(inflection.participle("bisčl"), "dibisčelt")
        self.assertEqual(inflection.participle("jibb"), "dijipt")
        for head in ["bajen", "tu", "zen"]:
            self.assertIn("不規則活用", self.entry(head)["tags"])

    def test_impersonal_verb_omits_nonexistent_persons_and_imperatives(self):
        forms = self.forms("deqen")
        self.assertEqual(
            {k: v for k, v in forms.items() if k.startswith("現在")}, {"現在3単数": "diq"}
        )
        self.assertFalse(any(k.startswith("命令") for k in forms))
        self.assertEqual(forms["接続法"], "diqes")
        self.assertEqual(forms["条件法"], "deqan")
        self.assertIn("無主語", self.entry("deqen")["tags"])
        public = next(
            e for e in entry_model.browser_data(self.data)["entries"] if e["head"] == "deqen"
        )
        titles = {f["label"] for f in entry_model.all_forms(public)}
        self.assertTrue(
            {"現在1単数", "現在2単数", "現在3複数", "命令単数", "命令複数"}.isdisjoint(titles)
        )

    def test_provenance_and_inflected_search_data(self):
        e = self.entry("blaclor")
        f = {f["label"]: f for f in entry_model.all_forms(e)}
        self.assertEqual(f["単数与格"]["origin"], "ウェブ登録")
        self.assertEqual(f["複数与格"]["origin"], "ウェブ登録")
        self.assertEqual(f["複数与格"]["source"], e["source"]["url"])
        self.assertEqual(self.forms("banüj")["複数再帰格"], "banüjils")

    def test_aq_derived_nouns_decline_without_stem_or_q_change(self):
        derived = [e for e in self.entries if e["pos"] == "名詞" and "蔑称 -aq" in e["grammar"]]
        self.assertEqual(len(derived), 17)
        for e in derived:
            self.assertEqual(e["pos"], "名詞")
            self.assertEqual(e["class"], "固定型")
            self.assertEqual(len(entry_model.all_forms(e)), 10)
        expected = [
            ["manžaq", "manžaqes"],
            ["manžaqen", "manžaqens"],
            ["manžaqer", "manžaqers"],
            ["manžaqu", "manžaqus"],
            ["manžaqel", "manžaqels"],
        ]
        self.assertEqual(
            [[f["value"] for f in r["cells"]] for r in self.entry("manžaq")["tables"][0]["rows"]],
            expected,
        )
        self.assertEqual(self.forms("untaq")["単数属格"], "untaqen")
        self.assertEqual(self.forms("avenaq")["単数与格"], "avenaqer")
        self.assertEqual(self.forms("cunaq")["複数属格"], "cunaqens")
        for word, gender in [
            ("avenaq", "F"),
            ("cozaq", "F"),
            ("cunaq", "F"),
            ("atrudaq", "M"),
            ("bodaq", "M"),
        ]:
            self.assertEqual(self.entry(word)["gender"], gender)
        self.assertNotIn("ardaq", {e["head"] for e in self.entries})
        self.assertEqual(self.entry("inzaq")["gender"], "M")
        self.assertEqual(self.entry("šewaq")["gender"], "M")

    def test_derived_pronoun_and_gerund_tables(self):
        self.assertEqual(
            self.forms("čaq"),
            {
                "単数主格": "čaq",
                "単数属格": "čaqen",
                "単数対格": "čaqet",
                "単数与格": "čaqer",
                "単数奪格": "čaqü",
                "単数再帰格": "čaqel",
            },
        )
        self.assertEqual(self.forms("gassen")["動名詞単数与格"], "gessäder")
        self.assertEqual(self.forms("gassen")["動名詞複数主格"], "gessädi")
        self.assertEqual(self.forms("gassen")["動名詞単数属格"], "gessaden")
        self.assertEqual(self.forms("seben")["動名詞単数与格"], "sibäder")
        self.assertEqual(self.forms("homen")["動名詞複数主格"], "humädi")
        self.assertEqual(self.forms("zen pfor")["現在3単数"], "ze pfor")
        self.assertEqual(self.forms("zen pfor")["アオリスト"], "zit pfor")
        self.assertNotIn("構文", self.forms("zen pfor"))
        self.assertEqual(self.forms("gan")["女性単数主格"], "gana")
        self.assertEqual(self.forms("gan")["中性単数主格"], "gän")
        self.assertNotIn("比較級", self.forms("gan"))

    def test_uniform_proto_forms_and_clean_public_data(self):
        for head, forms in [
            ("blaclor", ["*blaklawr"]),
            ("len", ["*lé-en", "*lī-t"]),
            ("čaq", ["*tʃis-aɣ"]),
            ("cori", ["*kōrī"]),
            ("baca", ["*bakā"]),
            ("banujen", []),
        ]:
            self.assertEqual(self.entry(head)["protoForms"], forms)
        public = entry_model.browser_data(self.data)
        for e in public["entries"]:
            self.assertNotIn("note", e)
            self.assertNotIn("ald", e)
            self.assertNotIn("source", e)
            for f in entry_model.all_forms(e):
                self.assertEqual(set(f), {"label", "value"})
        self.assertEqual(entry_model.display_form(self.forms("jen")["アオリスト"]), "je")
        self.assertNotIn("複数主格", self.forms("fissa"))
        for entry in public["entries"]:
            self.assertTrue(all("規則補完" not in f["label"] for f in entry_model.all_forms(entry)))

    def test_public_entry_ids_and_relation_targets(self):
        entries = entry_model.browser_data(self.data)["entries"]
        self.assertEqual(len(entries), 1047)
        by_id = {e["id"]: e["head"] for e in entries}
        self.assertEqual(len(by_id), 1047)
        for entry in entries:
            for relation in entry["relations"]:
                self.assertEqual(by_id[relation["id"]], relation["head"])
        self.assertIn("banüj", [r["head"] for r in self.entry("banujen")["relations"]])
        titles = Counter(r["title"] for e in entries for r in e["relations"])
        self.assertEqual(titles, {"派生": 540, "集合名詞": 3, "対応する単数": 3, "類義": 4})
        # 派生関係は自己参照・重複・片側だけの登録にしない。
        full_by_id = {e["id"]: e for e in entries}
        for entry in entries:
            seen = set()
            for relation in entry["relations"]:
                self.assertNotEqual(entry["id"], relation["id"])
                key = (relation["title"], relation["id"])
                self.assertNotIn(key, seen)
                seen.add(key)
                if relation["title"] == "派生":
                    self.assertIn(
                        {"title": "派生", "head": entry["head"], "id": entry["id"]},
                        full_by_id[relation["id"]]["relations"],
                    )

    def test_derivations_connect_lexemes_including_homographs(self):
        # 文字列の類似では拾えない交替・縮約・転成と、混同しやすい同綴語。
        for a, ap, b, bp in [
            ("žänk", "名詞", "žangen", "動詞"),
            ("gäss", "名詞", "gassen", "動詞"),
            ("bänn", "名詞", "bannen", "動詞"),
            ("hlend", "名詞", "hlenden", "動詞"),
            ("ihel", "名詞", "ihen", "動詞"),
            ("polten", "動詞", "polen", "動詞"),
            ("deqa", "名詞", "deqen", "動詞"),
            ("wul", "名詞", "wolen", "動詞"),
            ("žafem", "名詞", "žafemen", "動詞"),
            ("lona", "名詞", "lun", "名詞"),
            ("fettäm", "名詞", "äm", "名詞"),
            ("ort", "副詞", "oren", "動詞"),
            ("hlenu", "副詞", "hlen", "形容詞"),
            ("taq", "名詞", "tagen", "動詞"),
            ("taq", "連体詞", "taqet", "連体詞"),
            ("jod", "形容詞", "jod", "間投詞"),
            ("he", "小辞", "hit", "小辞"),
        ]:
            source, target = self.entry(a, ap), self.entry(b, bp)
            self.assertIn({"title": "派生", "head": b, "id": target["id"]}, source["relations"])
        for a, ap, b, bp in [
            ("Ämhor", "名詞", "äm", "名詞"),
            ("taq", "名詞", "taqet", "連体詞"),
            ("taq", "連体詞", "tagen", "動詞"),
            ("he", "間投詞", "hit", "小辞"),
            ("jod", "間投詞", "jotta", "名詞"),
            ("ert", "副詞", "erta", "名詞"),
            ("ert", "連体詞", "gan", "形容詞"),
        ]:
            target = self.entry(b, bp)
            self.assertFalse(any(r["id"] == target["id"] for r in self.entry(a, ap)["relations"]))

    def test_morphosyntactic_parts_of_speech(self):
        self.assertEqual(
            self.data["counts"],
            {
                "名詞": 695,
                "代名詞": 2,
                "動詞": 147,
                "形容詞": 78,
                "連体詞": 46,
                "副詞": 13,
                "前置詞": 23,
                "接続詞": 10,
                "小辞": 16,
                "間投詞": 8,
                "接辞": 6,
                "慣用句": 3,
            },
        )
        for pos, heads in {
            "接続詞": "de vi glan sta wan ma tin se cend sindin",
            "副詞": "distan giltžih gižar snätti trand žihi ort",
            "間投詞": "jal nol jod",
            "代名詞": "vipu čaq",
            "連体詞": "čipu",
        }.items():
            for head in heads.split():
                self.assertEqual(self.entry(head, pos)["pos"], pos)
        self.assertEqual(self.entry("jod", "形容詞")["pos"], "形容詞")
        self.assertEqual(self.entry("vipu")["tables"], [])
        self.assertEqual(self.entry("vipu")["tags"], ["代名詞"])
        self.assertTrue(all("数量疑問" in s["tags"] for s in self.entry("vipu")["senseTags"]))
        for e in self.entries:
            self.assertTrue(e["pos"] in entry_model.PARTS_OF_SPEECH or e["kind"] == "接辞")
            self.assertNotIn("派生語", e["tags"])
            self.assertFalse(any("名詞固定型" in t or t.endswith("交替動詞") for t in e["tags"]))
        self.assertEqual(self.entry("amalbuh")["tags"], ["名詞", "男性", "固定型", "子音幹型"])
        self.assertEqual(self.entry("len")["tags"], ["動詞", "母音幹", "不規則活用"])
        self.assertEqual(self.entry("tanen")["tags"], ["動詞", "a/e交替", "不規則活用"])

    def test_numerals_follow_their_syntax_and_preserve_paradigms(self):
        self.assertEqual(self.entry("gan")["pos"], "形容詞")
        self.assertEqual(self.entry("gan")["numeralType"], "基数")
        for stem in ["div", "gev", "niv", "cwen", "hräz", "gwešt"]:
            e = self.entry(stem)
            self.assertEqual(
                (e["pos"], e["gender"], e["class"], e["numeralType"]),
                ("名詞", "N", "固定型", "基数"),
            )
            self.assertEqual(self.forms(stem)["単数与格"], stem + "er")
            self.assertEqual(self.forms(stem)["複数属格"], stem + "ins")
        e = self.entry("žamra")
        self.assertEqual(
            (e["pos"], e["gender"], e["class"], e["numeralType"]), ("名詞", "F", "固定型", "基数")
        )
        self.assertEqual(
            (self.forms("žamra")["単数奪格"], self.forms("žamra")["複数主格"]), ("žamro", "žamras")
        )
        # so・ho・to と so-・ho-・to- 型の乗算複合、swoso 型は廃止（文法 7章）。
        self.assertTrue(
            all(
                e["head"] not in ["so", "ho", "to", "sodiv", "hodiv", "todiv", "swoso", "pencso"]
                for e in self.entries
            )
        )
        # 複合数詞。末尾の語の品詞が構文と曲用を決め、複合語の内部では一致を失う。
        for head in ["cwendediv", "swocven", "pencven", "tahcven", "cwenindiv", "cweniniv"]:
            e = self.entry(head)
            self.assertEqual(
                (e["pos"], e["gender"], e["class"], e["numeralType"]),
                ("名詞", "N", "固定型", "基数"),
            )
            self.assertEqual(
                (self.forms(head)["単数与格"], self.forms(head)["複数主格"]), (head + "er", head + "i")
            )
        for head in ["cwendegan", "cwendeswo", "cwendetaq"]:
            e = self.entry(head)
            self.assertEqual((e["pos"], e["numeralType"], e["tables"]), ("連体詞", "基数", []))
        self.assertEqual(
            {r["head"] for r in self.entry("cwenindiv")["relations"]}, {"cwen", "div", "cwenindivet"}
        )
        self.assertEqual(
            {r["head"] for r in self.entry("swocven")["relations"]}, {"swo", "cwen", "swocvenet"}
        )
        self.assertEqual(
            Counter(e["pos"] for e in self.entries if e["numeralType"] == "基数"),
            {"名詞": 18, "形容詞": 1, "連体詞": 12},
        )
        ordinals = [e for e in self.entries if e["numeralType"] == "序数"]
        self.assertEqual(len(ordinals), 31)
        self.assertTrue(all(e["pos"] == "連体詞" and not e["tables"] for e in ordinals))
        self.assertEqual(
            {e["head"] for e in ordinals} & {"cwenet", "hräzet", "gweštet", "žamrat", "cwendeganet"},
            {"cwenet", "hräzet", "gweštet", "žamrat", "cwendeganet"},
        )
        self.assertEqual(self.forms("gan")["女性単数与格"], "ganar")
        self.assertTrue({"比較級", "最上級", "副詞形"}.isdisjoint(self.forms("gan")))

    def test_adopted_news_words_exclude_unused_proposals(self):
        approved = set("pesclo pesclota swapräq žwab žwaben devoh šaqen vusnen crupen elsuden tocib hämp hämpel hämpela pär pärel pärela pärhämp devohpär ör ganta gantazilm elsüd elsüdcori corivusned šwešäta vemp nirm zilm nuf nes zumen Worel Čino Maltaman".split())
        registered = {e["head"] for e in self.entries if "2026-10-09、ニュース最終稿" in e["note"]}
        self.assertEqual(registered, approved)
        heads = {e["head"] for e in self.entries}
        # vožen は 2026-10-29 に WOLD 300語案で「探す」として登録したので、ニュース案の除外対象から外す。
        excluded = set("capen cäp žapen šümom šümomen gaguč gagučta šümomcori cwab cwaben šaqad vusned".split())
        self.assertTrue(heads.isdisjoint(excluded))
        for head, expected in {
            "swapräq": {"単数属格": "swaprägen", "複数与格": "swaprägers"},
            "šaqen": {"過去分詞": "dišaht", "動名詞単数属格": "šaqaden"},
            "elsuden": {"現在3複数": "elsuži", "過去分詞": "dijelsutt"},
            "crupen": {"現在3複数": "crupesi", "アオリスト": "crupet"},
            "vusnen": {"動名詞": "vusned", "アオリスト": "vusnet"},
            "elsüdcori": {"単数与格": "elsüdcorir", "複数主格": "elsüdcori"},
            "pesclo": {"女性単数主格": "pesclowa", "中性単数主格": "pesclö"},
            "nuf": {"単数与格": "nüfer"},
            "Worel": {"単数属格": "Worelen"},
            "Čino": {"単数与格": "Činor"},
            "Maltaman": {"単数与格": "Maltamäner"},
        }.items():
            for label, value in expected.items():
                self.assertEqual(self.forms(head)[label], value, head + " " + label)
        for head in "pesclota šwešäta vemp Worel Čino Maltaman".split():
            self.assertEqual(self.entry(head)["numberRestriction"], "singular")
            self.assertNotIn("複数主格", self.forms(head))
        for head in "vemp nirm zilm nuf nes zumen Čino Maltaman".split():
            self.assertEqual(self.entry(head)["protoForms"], [])
        for parent, child in [("hampen", "hämpela"), ("paren", "pärela"),
                              ("vusnen", "corivusned"), ("cori", "elsüdcori"),
                              ("zilm", "gantazilm"), ("devoh", "devohpär")]:
            a, b = self.entry(parent), self.entry(child)
            self.assertIn({"title": "派生", "head": child, "id": b["id"]}, a["relations"])
            self.assertIn({"title": "派生", "head": parent, "id": a["id"]}, b["relations"])

    def test_entry_kinds_are_independent_of_pos(self):
        affixes = [e for e in self.entries if e["kind"] == "接辞"]
        self.assertEqual(
            {e["head"] for e in affixes}, {"el-", "-a", "-el", "-ela", "-en", "-ta"}
        )
        self.assertTrue(all(e["pos"] == "" and e["gender"] == "" for e in affixes))
        e = self.entry("zen pfor")
        self.assertEqual((e["kind"], e["pos"]), ("慣用句", "動詞"))
        self.assertEqual(self.forms("zen pfor")["現在3単数"], "ze pfor")
        for e in self.entries:
            if e["kind"] == "単語":
                self.assertNotIn("単語", e["tags"])

    def test_generated_outputs_are_current(self):
        for name, text in build.artifacts().items():
            self.assertEqual((Path(__file__).parent / name).read_text(), text, name)

    def test_explicit_person_labels_are_idempotent(self):
        for label in ["現在1単数", "現在2単数", "現在3単数", "単数属格"]:
            self.assertEqual(lexicon.label_normalize(label), label)
        self.assertEqual(lexicon.label_normalize("現在 3 単"), "現在3単数")
        self.assertEqual(lexicon.explicit_forms("現在3単数：gess"), {"現在3単数": "gess"})

    def test_pages_export_contains_only_distribution_files(self):
        files = export_pages.pages_files()
        self.assertEqual(
            set(files),
            {"index.html", "dictionary.json", "ラフカ語文法.md", "収録と未確定事項.md", "version.json"},
        )
        self.assertEqual(
            files["ラフカ語文法.md"], (entry_model.ROOT / entry_model.GRAMMAR).read_text()
        )
        self.assertEqual(
            json.loads(files["version.json"])["grammarMdSha256"],
            hashlib.sha256(files["ラフカ語文法.md"].encode()).hexdigest(),
        )
        self.assertNotIn('href="ラフカ語文法.pdf"', files["index.html"])
        self.assertIn("noindex, nofollow, noarchive", files["index.html"])
        self.assertNotIn("ZpDIC", files["index.html"])
        self.assertFalse(any(name.endswith(".zpdc") for name in files))
        self.assertFalse(any(name.endswith(".zpdc") for name in build.artifacts()))
        published = json.loads(
            re.search(r"const DATA = ([\s\S]*?);</script>", files["index.html"])[1]
        )
        self.assertEqual(json.loads(files["version.json"])["entries"], len(published["entries"]))
        deleted = set(json.loads(files["dictionary.json"]).get("deletedIds", []))
        self.assertFalse(deleted & {e["id"] for e in published["entries"]})


if __name__ == "__main__":
    unittest.main()
