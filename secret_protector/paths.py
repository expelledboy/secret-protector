from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RuntimePaths:
    home: Path
    global_dir: Path
    global_config_path: Path
    global_script_path: Path
    global_hook_bin_path: Path
    global_package_dir: Path

    cursor_hooks_path: Path
    opencode_plugin_dir: Path
    opencode_plugin_path: Path
    codex_config_path: Path
    copilot_global_export_path: Path

    @classmethod
    def from_home(cls, home: Path) -> "RuntimePaths":
        global_dir = home / ".config" / "secret-protector"
        return cls(
            home=home,
            global_dir=global_dir,
            global_config_path=global_dir / "config.yaml",
            global_script_path=global_dir / "secret-protector.py",
            global_hook_bin_path=global_dir / "bin" / "secret-protector-hook",
            global_package_dir=global_dir / "secret_protector",
            cursor_hooks_path=home / ".cursor" / "hooks.json",
            opencode_plugin_dir=home / ".config" / "opencode" / "plugin",
            opencode_plugin_path=home / ".config" / "opencode" / "plugin" / "secret-protector.js",
            codex_config_path=home / ".codex" / "config.toml",
            copilot_global_export_path=global_dir / "copilot-content-exclusions.txt",
        )


def runtime_paths(home: Path | None = None) -> RuntimePaths:
    return RuntimePaths.from_home((home or Path.home()).resolve())
