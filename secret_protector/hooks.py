from __future__ import annotations

from typing import Any

from .detector import detect_secret_leak, detect_sensitive_command, detect_sensitive_read


def cursor_decision(event: str, payload: Any, policy: dict[str, Any]) -> dict[str, Any]:
    if event == "beforeSubmitPrompt":
        reason = detect_secret_leak(payload, policy)
        if reason:
            return {
                "continue": False,
                "user_message": f"Blocked by secret-protector. {reason}",
            }
        return {"continue": True}

    if event in {"beforeReadFile", "beforeTabFileRead"}:
        reason = detect_sensitive_read(payload, policy)
        if reason:
            return {
                "permission": "deny",
                "user_message": f"Blocked by secret-protector. {reason}",
            }
        return {"permission": "allow"}

    if event in {"beforeShellExecution", "preToolUse"}:
        reason = detect_sensitive_command(payload, policy)
        if reason:
            return {
                "permission": "deny",
                "user_message": f"Blocked by secret-protector. {reason}",
            }
        return {"permission": "allow"}

    return {}


def opencode_decision(event: str, payload: Any, policy: dict[str, Any]) -> dict[str, Any]:
    if event != "tool.execute.before":
        return {"block": False}

    reason: str | None = None

    tool = payload.get("tool") if isinstance(payload, dict) else None
    tool_name = ""
    tool_args: dict[str, Any] = {}
    if isinstance(tool, dict):
        tool_name = str(tool.get("name", ""))
        raw_args = tool.get("arguments")
        if isinstance(raw_args, dict):
            tool_args = raw_args

    if tool_name.lower() == "read":
        reason = detect_sensitive_read(tool_args, policy)

    if reason is None and tool_name.lower() in {"bash", "shell", "exec", "command"}:
        reason = detect_sensitive_command(tool_args, policy)

    if reason is None:
        reason = detect_sensitive_command(payload, policy)

    if reason:
        return {
            "block": True,
            "user_message": f"Blocked by secret-protector. {reason}",
        }

    return {"block": False}


def evaluate_hook(provider: str, event: str, payload: Any, policy: dict[str, Any]) -> dict[str, Any]:
    provider = provider.strip().lower()
    if provider == "cursor":
        return cursor_decision(event, payload, policy)
    if provider == "opencode":
        return opencode_decision(event, payload, policy)
    return {}
