from __future__ import annotations

import shutil
from pathlib import Path

from .io_utils import ensure_parent, write_text
from .paths import RuntimePaths


def hook_command_for(paths: RuntimePaths, provider: str, event: str) -> str:
    return f"{paths.global_hook_bin_path} {provider} {event}"


def install_runtime(paths: RuntimePaths, script_source: Path, package_source: Path) -> None:
    ensure_parent(paths.global_script_path)
    shutil.copy2(script_source, paths.global_script_path)

    if package_source.exists() and package_source.is_dir():
        shutil.copytree(package_source, paths.global_package_dir, dirs_exist_ok=True)

    # This wrapper keeps hook invocation stable while allowing internal package
    # refactors behind the global script path.
    wrapper = """#!/usr/bin/env bash
set -euo pipefail
exec python3 "$HOME/.config/secret-protector/secret-protector.py" hook "$@"
"""
    write_text(paths.global_hook_bin_path, wrapper, mode=0o755)
