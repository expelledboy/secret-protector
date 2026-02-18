from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any

from .defaults import DEFAULT_POLICY
from .hooks import evaluate_hook
from .install_runtime import hook_command_for, install_runtime
from .io_utils import eprint, write_text
from .paths import RuntimePaths, runtime_paths
from .policy import get_nested, load_effective_policy
from .providers import (
    install_codex_config,
    install_copilot_artifacts,
    install_opencode_plugin,
    render_copilot_exclusions,
    upsert_cursor_hooks,
)
from .yaml_io import save_yaml_dict


def provider_enabled(policy: dict[str, Any], provider: str) -> bool:
    value = get_nested(policy, "providers", provider, default=True)
    return bool(value)


def parse_stdin_json() -> Any:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON on stdin: {exc}") from exc


def cmd_init(args: argparse.Namespace, paths: RuntimePaths) -> int:
    if paths.global_config_path.exists() and not args.force:
        eprint(f"Config already exists: {paths.global_config_path}")
        eprint("Use --force to overwrite.")
        return 1

    save_yaml_dict(paths.global_config_path, copy.deepcopy(DEFAULT_POLICY))
    print(f"Wrote default config: {paths.global_config_path}")
    return 0


def cmd_install(
    args: argparse.Namespace,
    paths: RuntimePaths,
    script_source: Path | None,
    package_source: Path | None,
) -> int:
    if script_source is None or package_source is None:
        raise ValueError("install requires script and package source paths")

    if not paths.global_config_path.exists():
        save_yaml_dict(paths.global_config_path, copy.deepcopy(DEFAULT_POLICY))

    project_dir = Path(args.project).resolve() if args.project else Path.cwd().resolve()
    policy, project_config = load_effective_policy(paths, project_dir)

    install_runtime(paths, script_source, package_source)

    outputs: list[str] = []

    if provider_enabled(policy, "cursor"):
        path = upsert_cursor_hooks(paths, lambda provider, event: hook_command_for(paths, provider, event))
        outputs.append(f"Cursor hooks upserted: {path}")

    if provider_enabled(policy, "opencode"):
        path = install_opencode_plugin(paths)
        outputs.append(f"OpenCode plugin installed: {path}")

    if provider_enabled(policy, "codex"):
        path = install_codex_config(paths, policy)
        outputs.append(f"Codex config upserted: {path}")

    if provider_enabled(policy, "copilot"):
        for path in install_copilot_artifacts(paths, policy, project_dir):
            outputs.append(f"Copilot exclusion artifact written: {path}")

    outputs.append(f"Policy source: {paths.global_config_path}")
    if project_config is not None:
        outputs.append(f"Project override: {project_config}")
    else:
        outputs.append("Project override: none (.secretrc not found)")

    print("\n".join(outputs))
    return 0


def cmd_hook(args: argparse.Namespace, paths: RuntimePaths) -> int:
    policy, _ = load_effective_policy(paths, Path.cwd().resolve())

    try:
        payload = parse_stdin_json()
    except ValueError as exc:
        eprint(str(exc))
        return 2

    decision = evaluate_hook(args.provider, args.event, payload, policy)
    print(json.dumps(decision, ensure_ascii=True))
    return 0


def cmd_render_copilot(args: argparse.Namespace, paths: RuntimePaths) -> int:
    project_dir = Path(args.project).resolve() if args.project else Path.cwd().resolve()
    policy, _ = load_effective_policy(paths, project_dir)
    content = render_copilot_exclusions(policy)

    if args.output:
        output = Path(args.output).expanduser().resolve()
        write_text(output, content)
        print(f"Wrote: {output}")
    else:
        print(content)

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Install and enforce secret leak protections across AI coding tools.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="Create default global config")
    p_init.add_argument("--force", action="store_true", help="Overwrite existing config")

    p_install = sub.add_parser("install", help="Upsert provider configs and hooks")
    p_install.add_argument("--project", help="Project directory for .secretrc and Copilot repo artifact")

    p_hook = sub.add_parser("hook", help="Hook entrypoint for provider integrations")
    p_hook.add_argument("provider", help="Provider name (cursor/opencode)")
    p_hook.add_argument("event", help="Hook event name")

    p_copilot = sub.add_parser("render-copilot", help="Render Copilot exclusion artifact from merged policy")
    p_copilot.add_argument("--project", help="Project directory for .secretrc")
    p_copilot.add_argument("--output", help="Write to file path")

    return parser


def main(
    argv: list[str] | None = None,
    *,
    home: Path | None = None,
    script_path: Path | None = None,
    package_path: Path | None = None,
) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    paths = runtime_paths(home)

    try:
        if args.command == "init":
            return cmd_init(args, paths)
        if args.command == "install":
            return cmd_install(args, paths, script_path, package_path)
        if args.command == "hook":
            return cmd_hook(args, paths)
        if args.command == "render-copilot":
            return cmd_render_copilot(args, paths)

        parser.print_help()
        return 1
    except Exception as exc:  # noqa: BLE001
        eprint(f"error: {exc}")
        return 1
