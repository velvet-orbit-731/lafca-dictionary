#!/usr/bin/env python3
"""辞書・生成器の検査をまとめて実行する。公開や外部への保存は行わない。"""

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def run(directory, *command):
    print(f"\n[{directory.relative_to(ROOT)}] " + " ".join(map(str, command)), flush=True)
    subprocess.run(command, cwd=directory, check=True)


def is_browser_test(path):
    return path.name == "ui.test.cjs" or path.name.endswith(".ui.test.cjs")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", action="store_true", help="検査の前に両ツールを再生成する")
    parser.add_argument("--ui", action="store_true", help="Playwrightによる画面検査も実行する")
    parser.add_argument(
        "--node",
        default=os.environ.get("LAFCA_NODE") or shutil.which("node"),
        help="Node.jsの実行ファイル（LAFCA_NODEでも指定可能）",
    )
    args = parser.parse_args()
    if not args.node:
        parser.error("Node.jsが必要です。PATH、LAFCA_NODE、または --node で指定してください。")
    folders = [ROOT / "辞書", ROOT / "語彙生成器"]
    if args.build:
        for folder in folders:
            run(folder, sys.executable, "build.py")
    run(ROOT / "tools", sys.executable, "-m", "unittest", "-v")
    run(folders[0], sys.executable, "-m", "unittest", "-v")
    for folder in folders:
        run(folder, sys.executable, "build.py", "--check")
        tests = sorted(folder.glob("*.test.*"))
        for test in tests:
            if not is_browser_test(test):
                run(folder, args.node, test.name)
    if args.ui:
        for folder in folders:
            for test in sorted(folder.glob("*.test.*")):
                if is_browser_test(test):
                    run(folder, args.node, test.name)
    print("\nすべての検査が完了しました。")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from None
