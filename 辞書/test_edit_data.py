import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import entry_model
import lexicon
import edit_data
import export_pages


class EditorDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = lexicon.collect()
        cls.public = entry_model.browser_data(cls.base)["entries"]

    def entry(self, head):
        entry = copy.deepcopy(next(e for e in self.public if e["head"] == head))
        entry["senseTags"] = []
        return entry

    def assert_exported(self, edits, files):
        saved = json.loads(files["dictionary.json"])
        expected = edit_data.apply(self.base, edits)
        self.assertEqual(saved["entries"], entry_model.browser_data(expected)["entries"])
        self.assertEqual(entry_model.browser_data(lexicon.collect(saved)), entry_model.browser_data(expected))
        original = lexicon.web_source.load()
        ids = {e["id"] for e in saved["entries"]}
        self.assertEqual(saved["metadata"], {i:m for i,m in original["metadata"].items() if i in ids})
        return saved

    def test_export_keeps_destination_edits_and_removes_only_retired_grammar(self):
        entry = self.entry("fissa")
        entry.update(id="1234567890abcdef", head="fissaxa", meaning="書き出し検証用")
        entry["relations"] = []
        entry["senseTags"] = []
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            catalog = lexicon.web_source.load()
            catalog["entries"].append(entry)
            (path / "dictionary.json").write_text(json.dumps(catalog))
            (path / "edits.json").write_text("retired")
            (path / "ラフカ語文法.pdf").write_bytes(b"old grammar")
            (path / "other.pdf").write_bytes(b"keep")
            files = export_pages.export(path)
            saved = json.loads((path / "dictionary.json").read_text())
            self.assertEqual(next(e for e in saved["entries"] if e["id"] == entry["id"]), entry)
            self.assertFalse((path / "ラフカ語文法.pdf").exists())
            self.assertEqual((path / "other.pdf").read_bytes(), b"keep")
            self.assertEqual((path / "ラフカ語文法.md").read_text(), files["ラフカ語文法.md"])

    def test_export_conflict_leaves_concurrent_destination_update_untouched(self):
        original_pages = export_pages.pages_files
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            catalog = lexicon.web_source.load()
            target = path / "dictionary.json"
            target.write_text(json.dumps(catalog))
            (path / "index.html").write_text("keep")
            latest = json.dumps({**catalog, "metadata": {}})
            def concurrent(*args, **kwargs):
                files = original_pages(*args, **kwargs)
                target.write_text(latest)
                return files
            with patch.object(export_pages, "pages_files", side_effect=concurrent):
                with self.assertRaisesRegex(ValueError, "更新"):
                    export_pages.export(path)
            self.assertEqual(target.read_text(), latest)
            self.assertEqual((path / "index.html").read_text(), "keep")
            self.assertEqual({f.name for f in path.iterdir()}, {"dictionary.json", "index.html"})

    def test_tag_order_and_noun_stems_survive_legacy_edits_and_export(self):
        name = self.entry("Ämhor")
        name["tags"] = ["人名", "名詞", "男性", "固定型", "単数のみ", "人名"]
        normalized = edit_data.normalize_relations(name)
        self.assertEqual(
            normalized["tags"], ["名詞", "男性", "固定型", "子音幹型", "単数のみ", "人名"]
        )
        self.assertEqual(
            {k: v for k, v in normalized.items() if k != "tags"},
            {k: v for k, v in name.items() if k != "tags"},
        )
        files = export_pages.pages_files({"version": 1, "entries": [name]})
        saved = next(e for e in json.loads(files["dictionary.json"])["entries"] if e["id"] == name["id"])
        self.assertEqual(saved, normalized)
        verb = self.entry("bannen")
        verb["tags"] = ["女性", "II型", "-a幹", "中性ウムラウト", "人名", "確認用", "確認用"]
        self.assertEqual(edit_data.canonical_tags(verb), ["動詞", "a/e交替"])
        for e in self.public:
            self.assertEqual(edit_data.canonical_tags(e), e["tags"], e["head"])

    def test_rebuild_and_export_preserve_browser_edits_and_ids(self):
        e = self.entry("fissa")
        e["meaning"] = "魚肉（編集試験）"
        edits = {"version": 1, "entries": [e]}
        result = edit_data.apply(self.base, edits)
        self.assertEqual(
            next(x for x in result["entries"] if x["id"] == e["id"])["meaning"], e["meaning"]
        )
        files = export_pages.pages_files(edits)
        self.assertIn(e["meaning"], files["index.html"])
        public = entry_model.browser_data(result)["entries"]
        word = next(w for w in public if w["head"] == "fissa")
        self.assertEqual(word["id"], e["id"])
        self.assertFalse(any("複数" in f["label"] for f in entry_model.all_forms(word)))
        self.assert_exported(edits, files)

    def test_automatic_settings_and_manual_overrides_survive_rebuild(self):
        e = self.entry("fissa")
        e["inflection"] = {
            "version": 1,
            "settings": {"nounPattern": "auto"},
            "overrides": {"単数与格": "fissary"},
            "omitted": [],
        }
        for f in entry_model.all_forms(e):
            if f["label"] == "単数与格":
                f["value"] = "fissary"
        edits = {"version": 1, "entries": [e]}
        result = edit_data.apply(self.base, edits)
        public = next(w for w in entry_model.browser_data(result)["entries"] if w["id"] == e["id"])
        self.assertEqual(public, e)
        self.assert_exported(edits, export_pages.pages_files(edits))
        bad = copy.deepcopy(edits)
        bad["entries"][0]["inflection"]["settings"]["nounPattern"] = "unknown"
        with self.assertRaises(ValueError):
            edit_data.apply(self.base, bad)

    def test_separate_senses_survive_rebuild_and_export(self):
        e = self.entry("amla")
        e["meaning"] = "荒野, 曠野\n空虚, 虚無, 空っぽ"
        edits = {"version": 1, "entries": [e]}
        result = edit_data.apply(self.base, edits)
        self.assertEqual(
            next(w for w in entry_model.browser_data(result)["entries"] if w["id"] == e["id"]), e
        )
        files = export_pages.pages_files(edits)
        self.assert_exported(edits, files)
        self.assertIn(json.dumps(e["meaning"], ensure_ascii=False), files["index.html"])

    def test_new_entry_and_rename_update_references(self):
        e = self.entry("manča")
        e["head"] = "mančax"
        new = self.entry("fissa")
        new.update(id="1234567890abcdef", head="fissax", meaning="新語の試験")
        result = edit_data.apply(self.base, {"version": 1, "entries": [e, new]})
        self.assertEqual(len(result["entries"]), len(self.base["entries"]) + 1)
        manz = next(x for x in result["entries"] if x["head"] == "manž")
        self.assertTrue(
            any(r["head"] == "mančax" and r["id"] == e["id"] for r in manz["relations"])
        )

    def test_invalid_or_conflicting_edits_are_not_silently_published(self):
        e = self.entry("fissa")
        local = {"version": 1, "entries": [e]}
        other = copy.deepcopy(local)
        other["entries"][0]["meaning"] = "別の場所で編集"
        with self.assertRaisesRegex(ValueError, "異なります"):
            edit_data.combine(local, other)
        self.assertEqual(edit_data.combine(local, local), local)
        for key, value in [
            ("gender", ""),
            ("class", "非交替"),
            ("head", "fissa 等"),
            ("tables", []),
        ]:
            bad = copy.deepcopy(e)
            bad[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                edit_data.apply(self.base, {"version": 1, "entries": [bad]})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "edits.json"
            path.write_text(json.dumps(local))
            self.assertEqual(edit_data.load(path), local)

    def test_legacy_relation_titles_migrate_without_losing_edits(self):
        old = self.entry("manž")
        old["relations"][0]["title"] = "派生元"
        old["meaning"] = "人、男（編集）"
        normalized = copy.deepcopy(old)
        normalized["relations"][0]["title"] = "派生"
        legacy = {"version": 1, "entries": [old]}
        current = {"version": 1, "entries": [normalized]}
        self.assertEqual(edit_data.combine(legacy, current), current)
        saved = self.assert_exported(legacy, export_pages.pages_files(legacy))
        self.assertEqual(next(e for e in saved["entries"] if e["id"] == old["id"]), normalized)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "edits.json"
            path.write_text(json.dumps(legacy))
            self.assertEqual(edit_data.load(path), current)
        self.assertEqual(old["relations"][0]["title"], "派生元")
        changed = copy.deepcopy(current)
        changed["entries"][0]["relations"][0]["title"] = "対義"
        with self.assertRaisesRegex(ValueError, "異なります"):
            edit_data.combine(legacy, changed)

    def test_reciprocal_relations_add_change_remove_and_export(self):
        a, b = self.entry("fissa"), self.entry("bonna")
        for title in ["派生", "類義", "対義"]:
            with self.subTest(title=title):
                link = copy.deepcopy(a)
                link["relations"].append({"title": title, "id": b["id"], "head": b["head"]})
                linked = edit_data.apply(self.base, {"version": 1, "entries": [link]})
                other = next(e for e in linked["entries"] if e["id"] == b["id"])
                reverse = {"title": title, "id": a["id"], "head": a["head"]}
                self.assertIn(reverse, other["relations"])
                files = export_pages.pages_files({"version": 1, "entries": [link]})
                saved = json.loads(files["dictionary.json"])
                self.assertEqual(len(saved["entries"]), len(self.public))
                self.assertIn(
                    reverse, next(e for e in saved["entries"] if e["id"] == b["id"])["relations"]
                )
                self.assertEqual(
                    entry_model.browser_data(lexicon.collect(saved)),
                    entry_model.browser_data(linked),
                )
                removed = edit_data.apply(linked, {"version": 1, "entries": [a]})
                self.assertNotIn(
                    reverse, next(e for e in removed["entries"] if e["id"] == b["id"])["relations"]
                )
                replacement = copy.deepcopy(link)
                replacement["relations"][-1]["title"] = "類義" if title == "派生" else "派生"
                changed = edit_data.apply(linked, {"version": 1, "entries": [replacement]})
                relations = next(e for e in changed["entries"] if e["id"] == b["id"])["relations"]
                self.assertNotIn(reverse, relations)
                self.assertIn(
                    {**reverse, "title": replacement["relations"][-1]["title"]}, relations
                )
                duplicate = copy.deepcopy(link)
                duplicate["relations"] *= 2
                self.assertEqual(
                    edit_data.synchronize_relations(self.public, [duplicate]),
                    edit_data.synchronize_relations(self.public, [link]),
                )

    def test_removed_existing_reverse_is_saved_for_future_rebuilds(self):
        e = self.entry("manž")
        removed = e["relations"].pop(0)
        files = export_pages.pages_files({"version": 1, "entries": [e]})
        saved = json.loads(files["dictionary.json"])
        other = next(x for x in saved["entries"] if x["id"] == removed["id"])
        self.assertFalse(
            any(r["id"] == e["id"] and r["title"] == removed["title"] for r in other["relations"])
        )
        rebuilt = lexicon.collect(saved)
        self.assertFalse(
            any(
                r["id"] == e["id"] and r["title"] == removed["title"]
                for r in next(x for x in rebuilt["entries"] if x["id"] == removed["id"])[
                    "relations"
                ]
            )
        )

    def test_deleted_entries_and_links_stay_deleted_after_export_and_rebuild(self):
        word = self.entry("manž")
        edits = {"version": 1, "entries": [], "deletedIds": [word["id"]]}
        result = edit_data.apply(self.base, edits)
        self.assertEqual(len(result["entries"]), len(self.base["entries"]) - 1)
        self.assertTrue(
            all(
                e["id"] != word["id"] and all(r["id"] != word["id"] for r in e["relations"])
                for e in result["entries"]
            )
        )
        files = export_pages.pages_files(edits)
        saved = json.loads(files["dictionary.json"])
        self.assertEqual(set(saved["deletedIds"]), set(lexicon.web_source.load()["deletedIds"]) | {word["id"]})
        self.assertEqual(
            entry_model.browser_data(lexicon.collect(saved)),
            entry_model.browser_data(result),
        )
        self.assertEqual(json.loads(files["version.json"])["entries"], len(result["entries"]))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "edits.json"
            path.write_text(files["dictionary.json"])
            self.assertEqual(edit_data.load(path)["entries"], saved["entries"])
        other = {"version": 1, "entries": [self.entry("fissa")]}
        self.assertEqual(edit_data.combine(edits, other)["deletedIds"], [word["id"]])
        with self.assertRaisesRegex(ValueError, "競合"):
            edit_data.combine(edits, {"version": 1, "entries": [word]})
        for ids in ["bad", ["bad"], [word["id"], word["id"]]]:
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                edit_data.apply(self.base, {**edits, "deletedIds": ids})
        with self.assertRaises(ValueError):
            edit_data.apply(self.base, {**edits, "entries": [word]})


if __name__ == "__main__":
    unittest.main()
