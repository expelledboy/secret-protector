from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from .defaults import DEFAULT_POLICY
from .paths import RuntimePaths
from .yaml_io import load_yaml_dict


# Lists are merged by value and deduplicated via canonical JSON encoding so that
# mixed scalar/dict list values remain stable across repeated upserts.
def ordered_unique(values: list[Any]) -> list[Any]:
    seen: set[str] = set()
    out: list[Any] = []
    for value in values:
        key = json.dumps(value, sort_keys=True, ensure_ascii=True)
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
    return out


def merge_values(base: Any, override: Any) -> Any:
    if isinstance(base, dict) and isinstance(override, dict):
        result = dict(base)
        for key, value in override.items():
            if key in result:
                result[key] = merge_values(result[key], value)
            else:
                result[key] = copy.deepcopy(value)
        return result

    if isinstance(base, list) and isinstance(override, list):
        return ordered_unique([*base, *override])

    return copy.deepcopy(override)


def as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    return [str(value)]


def get_nested(policy: dict[str, Any], *path: str, default: Any = None) -> Any:
    cur: Any = policy
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


def find_project_config(start_dir: Path | None = None) -> Path | None:
    current = (start_dir or Path.cwd()).resolve()
    for directory in [current, *current.parents]:
        candidate = directory / ".secretrc"
        if candidate.exists():
            return candidate
    return None


def load_effective_policy(paths: RuntimePaths, project_dir: Path | None = None) -> tuple[dict[str, Any], Path | None]:
    policy = copy.deepcopy(DEFAULT_POLICY)
    policy = merge_values(policy, load_yaml_dict(paths.global_config_path))

    project_config_path: Path | None = None
    if project_dir is not None:
        candidate = project_dir / ".secretrc"
        if candidate.exists():
            project_config_path = candidate

    if project_config_path is None:
        project_config_path = find_project_config(project_dir)

    if project_config_path is not None:
        policy = merge_values(policy, load_yaml_dict(project_config_path))

    return policy, project_config_path
