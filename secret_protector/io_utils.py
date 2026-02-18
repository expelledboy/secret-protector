from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def eprint(*args: Any) -> None:
    print(*args, file=sys.stderr)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_text(path: Path, text: str, mode: int | None = None) -> None:
    ensure_parent(path)
    path.write_text(text, encoding="utf-8")
    if mode is not None:
        path.chmod(mode)


def read_json_dict(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Expected object in {path}")
    return raw


def write_json_dict(path: Path, data: dict[str, Any]) -> None:
    text = json.dumps(data, indent=2, ensure_ascii=True) + "\n"
    write_text(path, text)
