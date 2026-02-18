from __future__ import annotations

import fnmatch
import re
from typing import Any

from .io_utils import eprint
from .policy import as_list, get_nested

PATH_LIKE_KEYS = {
    "path",
    "filepath",
    "file_path",
    "filename",
    "uri",
    "absolute_path",
    "absolutepath",
    "relative_path",
    "relativepath",
    "relative_workspace_path",
    "relativeworkspacepath",
}


def collect_strings(value: Any, out: list[str]) -> None:
    if isinstance(value, str):
        out.append(value)
        return

    if isinstance(value, dict):
        for key, item in value.items():
            out.append(str(key))
            collect_strings(item, out)
        return

    if isinstance(value, list):
        for item in value:
            collect_strings(item, out)


# We intentionally use loose heuristics here because tool payloads vary widely
# across providers and versions; path-like keys plus slash/dot prefixes catches
# most real payloads without strict schema coupling.
def collect_paths(value: Any, out: list[str], key_hint: str | None = None) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            normalized_key = re.sub(r"[^a-zA-Z0-9_]", "", str(key)).lower()
            collect_paths(item, out, normalized_key)
        return

    if isinstance(value, list):
        for item in value:
            collect_paths(item, out, key_hint)
        return

    if not isinstance(value, str):
        return

    is_path_key = key_hint in PATH_LIKE_KEYS if key_hint else False
    seems_like_path = "/" in value or "\\" in value or value.startswith(".")
    if is_path_key or seems_like_path:
        out.append(value)


def normalize_path(path: str) -> str:
    return path.strip().replace("\\", "/")


def compile_regexes(patterns: list[str]) -> list[re.Pattern[str]]:
    compiled: list[re.Pattern[str]] = []
    for pattern in patterns:
        try:
            compiled.append(re.compile(pattern))
        except re.error as exc:
            eprint(f"warning: invalid regex ignored: {pattern!r} ({exc})")
    return compiled


def first_env_match(text: str, env_exact: list[str], env_regex: list[re.Pattern[str]]) -> str | None:
    for name in env_exact:
        checks = [
            rf"\$\{{?{re.escape(name)}\}}?",
            rf"\b{re.escape(name)}\b\s*=",
            rf"\bexport\s+{re.escape(name)}\b",
            rf"\b{re.escape(name)}\b",
        ]
        for pattern in checks:
            if re.search(pattern, text):
                return name

    for pattern in env_regex:
        match = pattern.search(text)
        if match:
            return match.group(0)

    return None


def path_matches(path: str, file_globs: list[str], file_regex: list[re.Pattern[str]]) -> str | None:
    normalized = normalize_path(path)
    basename = normalized.split("/")[-1]

    for glob in file_globs:
        if fnmatch.fnmatch(normalized, glob) or fnmatch.fnmatch(basename, glob):
            return glob

    for pattern in file_regex:
        if pattern.search(normalized):
            return pattern.pattern

    return None


def policy_matchers(policy: dict[str, Any]) -> tuple[list[str], list[re.Pattern[str]], list[str], list[re.Pattern[str]]]:
    env_exact = [name.strip() for name in as_list(get_nested(policy, "env", "exact", default=[])) if name.strip()]
    env_regex = compile_regexes(as_list(get_nested(policy, "env", "regex", default=[])))

    file_globs = [glob.strip() for glob in as_list(get_nested(policy, "files", "globs", default=[])) if glob.strip()]
    file_regex = compile_regexes(as_list(get_nested(policy, "files", "regex", default=[])))
    return env_exact, env_regex, file_globs, file_regex


def detect_secret_leak(payload: Any, policy: dict[str, Any]) -> str | None:
    env_exact, env_regex, file_globs, file_regex = policy_matchers(policy)

    strings: list[str] = []
    collect_strings(payload, strings)
    for text in strings:
        env_hit = first_env_match(text, env_exact, env_regex)
        if env_hit:
            return f"Detected secret environment variable reference: {env_hit}"

    paths: list[str] = []
    collect_paths(payload, paths)
    for path in paths:
        path_hit = path_matches(path, file_globs, file_regex)
        if path_hit:
            return f"Detected sensitive file path pattern: {path_hit}"

    return None


def detect_sensitive_read(payload: Any, policy: dict[str, Any]) -> str | None:
    _, _, file_globs, file_regex = policy_matchers(policy)

    paths: list[str] = []
    collect_paths(payload, paths)
    for path in paths:
        hit = path_matches(path, file_globs, file_regex)
        if hit:
            return f"Read blocked for sensitive file pattern: {hit}"

    return None


def detect_sensitive_command(payload: Any, policy: dict[str, Any]) -> str | None:
    env_exact, env_regex, file_globs, file_regex = policy_matchers(policy)

    strings: list[str] = []
    collect_strings(payload, strings)
    for text in strings:
        env_hit = first_env_match(text, env_exact, env_regex)
        if env_hit:
            return f"Command references secret environment variable: {env_hit}"

    paths: list[str] = []
    collect_paths(payload, paths)
    for path in paths:
        path_hit = path_matches(path, file_globs, file_regex)
        if path_hit:
            return f"Command references sensitive file pattern: {path_hit}"

    return None
