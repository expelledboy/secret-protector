from __future__ import annotations

from pathlib import Path
from typing import Callable

from ..io_utils import read_json_dict, write_json_dict
from ..paths import RuntimePaths


def upsert_cursor_hooks(paths: RuntimePaths, hook_command_factory: Callable[[str, str], str]) -> Path:
    data = read_json_dict(paths.cursor_hooks_path)
    if not data:
        data = {"version": 1, "hooks": {}}

    version = data.get("version")
    if not isinstance(version, int) or version < 1:
        data["version"] = 1

    hooks = data.get("hooks")
    if not isinstance(hooks, dict):
        hooks = {}
    data["hooks"] = hooks

    events = ["beforeSubmitPrompt", "beforeReadFile", "beforeTabFileRead"]
    for event in events:
        command = hook_command_factory("cursor", event)
        entry = {
            "type": "command",
            "command": command,
            "timeout": 10,
        }

        current = hooks.get(event)
        if not isinstance(current, list):
            current = []

        marker = f"secret-protector-hook cursor {event}"
        filtered = []
        for item in current:
            if isinstance(item, dict) and marker in str(item.get("command", "")):
                continue
            filtered.append(item)

        filtered.append(entry)
        hooks[event] = filtered

    write_json_dict(paths.cursor_hooks_path, data)
    return paths.cursor_hooks_path
