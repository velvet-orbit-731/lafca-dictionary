"""このリポジトリ直下の dictionary.json（語彙の唯一の正本）を読み、形式を検証する。"""

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEBSITE = "https://velvet-orbit-731.github.io/lafca-dictionary/"
CACHE = ROOT / "dictionary.json"


def decode(text):
    data = json.loads(text)
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("entries"), list):
        raise ValueError("ウェブ辞書の形式が不正です。")
    if any(not isinstance(e, dict) or not isinstance(e.get("id"), str)
           or not re.fullmatch(r"[0-9a-f]{16}", e["id"]) for e in data["entries"]):
        raise ValueError("ウェブ辞書の項目IDが不正です。")
    ids = [e["id"] for e in data["entries"]]
    if len(ids) != len(set(ids)):
        raise ValueError("ウェブ辞書の項目IDが重複しています。")
    metadata = data.get("metadata", {})
    if not isinstance(metadata, dict) or set(metadata) - set(ids) or any(not isinstance(m, dict) for m in metadata.values()):
        raise ValueError("ウェブ辞書の注記が存在しない項目を参照しています。")
    deleted = data.get("deletedIds", [])
    if not isinstance(deleted, list) or any(not isinstance(i, str) or not re.fullmatch(r"[0-9a-f]{16}", i) for i in deleted) or len(deleted) != len(set(deleted)):
        raise ValueError("削除済み項目のIDが不正です。")
    if set(deleted) & set(ids):
        raise ValueError("削除済み項目がウェブ辞書に残っています。")
    return data


def load(path=None):
    path = Path(path) if path else CACHE
    if not path.exists():
        raise ValueError(f"語彙の正本がありません: {path}")
    return decode(path.read_text(encoding="utf-8"))


def source(catalog=None):
    content = CACHE.read_bytes() if catalog is None else (json.dumps(catalog, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return {
        "file": "dictionary.json",
        "path": str(CACHE.relative_to(ROOT)),
        "url": WEBSITE + "dictionary.json",
        "sha256": hashlib.sha256(content).hexdigest(),
    }
