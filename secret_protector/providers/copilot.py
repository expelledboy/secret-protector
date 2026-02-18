from __future__ import annotations

from pathlib import Path
from typing import Any

from ..io_utils import write_text
from ..paths import RuntimePaths
from ..policy import as_list, get_nested


def render_exclusions(policy: dict[str, Any]) -> str:
    globs = as_list(get_nested(policy, "files", "globs", default=[]))
    regex = as_list(get_nested(policy, "files", "regex", default=[]))

    lines = [
        "# Secret Protector - Copilot content exclusion candidates",
        "# Apply these patterns in GitHub Copilot content exclusion settings (repo/org/enterprise).",
        "# This file is a source-of-truth artifact; GitHub does not auto-read this file.",
        "",
        "[glob_patterns]",
    ]
    lines.extend(sorted(set(globs)))
    lines.append("")
    lines.append("[regex_patterns]")
    lines.extend(sorted(set(regex)))
    lines.append("")
    return "\n".join(lines)


def install_artifacts(paths: RuntimePaths, policy: dict[str, Any], project_dir: Path | None) -> list[Path]:
    out: list[Path] = []
    content = render_exclusions(policy)

    write_text(paths.copilot_global_export_path, content)
    out.append(paths.copilot_global_export_path)

    if project_dir is not None:
        repo_file = str(get_nested(policy, "copilot", "repo_file", default=".github/copilot-content-exclusions.txt"))
        repo_path = project_dir / repo_file
        write_text(repo_path, content)
        out.append(repo_path)

    return out
