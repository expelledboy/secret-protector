from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from secret_protector.defaults import DEFAULT_POLICY
from secret_protector.install_runtime import hook_command_for, install_runtime
from secret_protector.paths import runtime_paths
from secret_protector.providers.codex import install_config as install_codex_config
from secret_protector.providers.copilot import install_artifacts as install_copilot_artifacts
from secret_protector.providers.cursor import upsert_cursor_hooks
from secret_protector.providers.opencode import install_plugin as install_opencode_plugin


class ProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.policy = copy.deepcopy(DEFAULT_POLICY)

    def test_cursor_upsert_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_home:
            paths = runtime_paths(Path(tmp_home))
            upsert_cursor_hooks(paths, lambda provider, event: hook_command_for(paths, provider, event))
            upsert_cursor_hooks(paths, lambda provider, event: hook_command_for(paths, provider, event))

            data = json.loads(paths.cursor_hooks_path.read_text(encoding="utf-8"))
            for event in ("beforeSubmitPrompt", "beforeReadFile", "beforeTabFileRead"):
                self.assertEqual(len(data["hooks"][event]), 1)

    def test_codex_config_contains_managed_policy(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_home:
            paths = runtime_paths(Path(tmp_home))
            paths.codex_config_path.parent.mkdir(parents=True, exist_ok=True)
            paths.codex_config_path.write_text(
                "[shell_environment_policy]\ninherit = \"all\"\n\n[profile]\nname = \"x\"\n",
                encoding="utf-8",
            )

            install_codex_config(paths, self.policy)
            content = paths.codex_config_path.read_text(encoding="utf-8")

            self.assertIn("# >>> secret-protector begin", content)
            self.assertIn('inherit = "core"', content)
            self.assertIn('[profile]\nname = "x"', content)

    def test_opencode_plugin_written(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_home:
            paths = runtime_paths(Path(tmp_home))
            plugin_path = install_opencode_plugin(paths)
            content = plugin_path.read_text(encoding="utf-8")
            self.assertIn('"tool.execute.before"', content)
            self.assertIn("secret-protector-hook", content)

    def test_copilot_artifacts_written(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_home, tempfile.TemporaryDirectory() as tmp_project:
            paths = runtime_paths(Path(tmp_home))
            outputs = install_copilot_artifacts(paths, self.policy, Path(tmp_project))
            self.assertEqual(len(outputs), 2)
            for output in outputs:
                self.assertTrue(output.exists())

    def test_install_runtime_copies_script_and_package(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_home, tempfile.TemporaryDirectory() as tmp_src:
            paths = runtime_paths(Path(tmp_home))
            src_root = Path(tmp_src)
            script = src_root / "secret-protector.py"
            package = src_root / "secret_protector"
            package.mkdir(parents=True)
            script.write_text("#!/usr/bin/env python3\nprint('ok')\n", encoding="utf-8")
            (package / "__init__.py").write_text("", encoding="utf-8")
            (package / "mod.py").write_text("x = 1\n", encoding="utf-8")

            install_runtime(paths, script, package)

            self.assertTrue(paths.global_script_path.exists())
            self.assertTrue((paths.global_package_dir / "mod.py").exists())
            self.assertTrue(paths.global_hook_bin_path.exists())


if __name__ == "__main__":
    unittest.main()
