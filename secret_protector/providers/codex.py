from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ..defaults import MANAGED_BLOCK_END, MANAGED_BLOCK_START
from ..io_utils import write_text
from ..paths import RuntimePaths
from ..policy import as_list, get_nested, ordered_unique


def strip_managed_block(content: str) -> str:
    pattern = re.compile(
        rf"\n?{re.escape(MANAGED_BLOCK_START)}.*?{re.escape(MANAGED_BLOCK_END)}\n?",
        re.DOTALL,
    )
    return re.sub(pattern, "\n", content)


# Removes a full TOML table by header name without requiring a TOML parser.
# This keeps updates idempotent even on systems without toml formatting libs.
def strip_toml_table(content: str, table_name: str) -> str:
    lines = content.splitlines(keepends=True)
    start_re = re.compile(rf"^\s*\[{re.escape(table_name)}\]\s*$")
    header_re = re.compile(r"^\s*\[[^\[].*\]\s*$")

    out: list[str] = []
    skipping = False
    for line in lines:
        if not skipping and start_re.match(line):
            skipping = True
            continue
        if skipping and header_re.match(line):
            skipping = False
            out.append(line)
            continue
        if not skipping:
            out.append(line)

    return "".join(out)


def toml_quote(value: str) -> str:
    return json.dumps(value)


def toml_array(values: list[str]) -> str:
    if not values:
        return "[]"
    return f"[{', '.join(toml_quote(v) for v in values)}]"


def build_env_policy(policy: dict[str, Any]) -> tuple[list[str], list[str]]:
    env_exact = as_list(get_nested(policy, "env", "exact", default=[]))
    env_regex = as_list(get_nested(policy, "env", "regex", default=[]))

    allow_exact = as_list(get_nested(policy, "env", "allow_exact", default=[]))
    allow_regex = as_list(get_nested(policy, "env", "allow_regex", default=[]))

    include_only = [f"^{re.escape(name)}$" for name in allow_exact if name]
    include_only.extend(pattern for pattern in allow_regex if pattern)

    exclude = [f"^{re.escape(name)}$" for name in env_exact if name]
    exclude.extend(pattern for pattern in env_regex if pattern)

    return ordered_unique(include_only), ordered_unique(exclude)


def install_config(paths: RuntimePaths, policy: dict[str, Any]) -> Path:
    include_only, exclude = build_env_policy(policy)

    existing = paths.codex_config_path.read_text(encoding="utf-8") if paths.codex_config_path.exists() else ""
    updated = strip_managed_block(existing)
    updated = strip_toml_table(updated, "shell_environment_policy")
    updated = updated.rstrip() + "\n\n"

    managed_block = (
        f"{MANAGED_BLOCK_START}\n"
        "[shell_environment_policy]\n"
        'inherit = "core"\n'
        f"include_only = {toml_array(include_only)}\n"
        f"exclude = {toml_array(exclude)}\n"
        f"{MANAGED_BLOCK_END}\n"
    )

    write_text(paths.codex_config_path, updated + managed_block)
    return paths.codex_config_path
