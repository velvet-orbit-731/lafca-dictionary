"""語彙の正本の形式検証。"""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import web_source


class WebSourceTest(unittest.TestCase):
    def setUp(self):
        self.catalog = {"version": 1, "entries": [{"id": "0123456789abcdef"}],
                        "metadata": {"0123456789abcdef": {"note": "語源"}}, "deletedIds": []}
        self.text = json.dumps(self.catalog, ensure_ascii=False, indent=2) + "\n"

    def test_shape_ids_and_metadata_must_be_consistent(self):
        invalid = [[], {}, {**self.catalog, "entries": [None]},
                   {**self.catalog, "entries": self.catalog["entries"] * 2},
                   {**self.catalog, "metadata": {"ffffffffffffffff": {}}},
                   {**self.catalog, "metadata": {"0123456789abcdef": []}},
                   {**self.catalog, "deletedIds": "bad"},
                   {**self.catalog, "deletedIds": ["0123456789abcdef"]},
                   {**self.catalog, "deletedIds": ["ffffffffffffffff"] * 2}]
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                web_source.decode(json.dumps(value))
        self.assertEqual(web_source.decode(self.text), self.catalog)

    def test_missing_source_does_not_fall_back_to_generated_files(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(web_source, "CACHE", Path(directory) / "missing.json"):
                with self.assertRaisesRegex(ValueError, "正本がありません"):
                    web_source.load()


if __name__ == "__main__":
    unittest.main()
