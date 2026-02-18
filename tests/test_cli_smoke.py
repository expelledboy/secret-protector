from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENTRYPOINT = ROOT / "secret-protector.py"


def run_command(
    argv: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    stdin: str | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        argv,
        cwd=str(cwd or ROOT),
        env=env,
        input=stdin,
        text=True,
        capture_output=True,
        timeout=20,
        check=False,
    )


class SecretProtectorCliSmokeTests(unittest.TestCase):
    def test_entrypoint_help(self) -> None:
        result = run_command([sys.executable, str(ENTRYPOINT), "--help"])
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("install", result.stdout)

    def test_init_install_and_hook_flow(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_home, tempfile.TemporaryDirectory() as tmp_project:
            project_dir = Path(tmp_project)
            (project_dir / ".secretrc").write_text(
                "env:\n  exact:\n    - PROJECT_SECRET_TOKEN\n",
                encoding="utf-8",
            )

            env = os.environ.copy()
            env["HOME"] = tmp_home

            init_result = run_command([sys.executable, str(ENTRYPOINT), "init"], env=env)
            self.assertEqual(init_result.returncode, 0, msg=init_result.stderr)

            install_result = run_command(
                [sys.executable, str(ENTRYPOINT), "install", "--project", str(project_dir)],
                env=env,
            )
            self.assertEqual(install_result.returncode, 0, msg=install_result.stderr)

            self.assertTrue((Path(tmp_home) / ".config" / "secret-protector" / "config.yaml").exists())
            self.assertTrue((Path(tmp_home) / ".cursor" / "hooks.json").exists())
            self.assertTrue((Path(tmp_home) / ".config" / "opencode" / "plugin" / "secret-protector.js").exists())
            self.assertTrue((Path(tmp_home) / ".codex" / "config.toml").exists())
            self.assertTrue(
                (Path(tmp_home) / ".config" / "secret-protector" / "bin" / "secret-protector-hook").exists()
            )
            self.assertTrue((project_dir / ".github" / "copilot-content-exclusions.txt").exists())

            hook_result = run_command(
                [sys.executable, str(ENTRYPOINT), "hook", "cursor", "beforeSubmitPrompt"],
                cwd=project_dir,
                env=env,
                stdin='{"prompt":"share GITHUB_PAT"}',
            )
            self.assertEqual(hook_result.returncode, 0, msg=hook_result.stderr)

            decision = json.loads(hook_result.stdout)
            self.assertEqual(decision.get("continue"), False)
            self.assertIn("Blocked by secret-protector", decision.get("user_message", ""))


class ExternalToolCliSmokeTests(unittest.TestCase):
    def test_external_tools_help(self) -> None:
        tool_names = ["agent", "copilot", "codex", "opencode"]
        for tool in tool_names:
            with self.subTest(tool=tool):
                path = shutil.which(tool)
                self.assertIsNotNone(path, msg=f"{tool} is not available on PATH")

                result = run_command([path or tool, "--help"])
                self.assertEqual(result.returncode, 0, msg=result.stderr or result.stdout)
                self.assertTrue(
                    bool(result.stdout.strip() or result.stderr.strip()),
                    msg=f"{tool} returned no output for --help",
                )


if __name__ == "__main__":
    unittest.main()
