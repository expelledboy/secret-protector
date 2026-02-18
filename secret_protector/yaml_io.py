from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from .io_utils import write_text

try:
    import yaml as _yaml  # type: ignore
except ModuleNotFoundError:
    _yaml = None


def _yaml_load_via_ruby(path: Path) -> Any:
    cmd = [
        "ruby",
        "-ryaml",
        "-rjson",
        "-e",
        (
            "obj = YAML.safe_load(File.read(ARGV[0]), permitted_classes: [], aliases: true) || {}; "
            "puts JSON.dump(obj)"
        ),
        str(path),
    ]
    proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or proc.stdout.strip()
        raise ValueError(
            f"YAML parser unavailable. Install PyYAML (`python3 -m pip install pyyaml`) or ensure Ruby is installed. {stderr}"
        )
    return json.loads(proc.stdout)


def _yaml_dump_via_ruby(obj: dict[str, Any]) -> str:
    cmd = [
        "ruby",
        "-ryaml",
        "-rjson",
        "-e",
        "obj = JSON.parse(STDIN.read); puts YAML.dump(obj)",
    ]
    proc = subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
        input=json.dumps(obj, ensure_ascii=True),
    )
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or proc.stdout.strip()
        raise ValueError(
            f"YAML writer unavailable. Install PyYAML (`python3 -m pip install pyyaml`) or ensure Ruby is installed. {stderr}"
        )
    return proc.stdout


def load_yaml_dict(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw: Any
    if _yaml is not None:
        raw = _yaml.safe_load(path.read_text(encoding="utf-8"))
    else:
        raw = _yaml_load_via_ruby(path)

    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValueError(f"Expected object in {path}, got {type(raw).__name__}")
    return raw


def save_yaml_dict(path: Path, obj: dict[str, Any]) -> None:
    if _yaml is not None:
        text = _yaml.safe_dump(obj, sort_keys=False, default_flow_style=False)
    else:
        text = _yaml_dump_via_ruby(obj)
    write_text(path, text)
