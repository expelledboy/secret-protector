from __future__ import annotations

import copy
import tempfile
import unittest
from pathlib import Path

from secret_protector.defaults import DEFAULT_POLICY
from secret_protector.paths import runtime_paths
from secret_protector.policy import load_effective_policy, merge_values
from secret_protector.yaml_io import save_yaml_dict


class PolicyTests(unittest.TestCase):
    def test_merge_values_deduplicates_lists(self) -> None:
        base = {"arr": ["a", "b", {"x": 1}]}
        override = {"arr": ["b", "c", {"x": 1}]}

        merged = merge_values(base, override)
        self.assertEqual(merged["arr"], ["a", "b", {"x": 1}, "c"])

    def test_load_effective_policy_merges_global_and_project(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_home, tempfile.TemporaryDirectory() as tmp_project:
            paths = runtime_paths(Path(tmp_home))

            global_cfg = {
                "env": {"exact": ["GLOBAL_TOKEN"]},
                "providers": {"copilot": False},
            }
            save_yaml_dict(paths.global_config_path, global_cfg)

            project_dir = Path(tmp_project)
            save_yaml_dict(
                project_dir / ".secretrc",
                {
                    "env": {"exact": ["PROJECT_TOKEN"]},
                    "files": {"globs": ["**/*.local.env"]},
                },
            )

            policy, project_cfg_path = load_effective_policy(paths, project_dir)

            self.assertIsNotNone(project_cfg_path)
            env_exact = set(policy["env"]["exact"])
            self.assertIn("GLOBAL_TOKEN", env_exact)
            self.assertIn("PROJECT_TOKEN", env_exact)
            self.assertIn("GITHUB_PAT", env_exact)
            self.assertFalse(policy["providers"]["copilot"])
            self.assertIn("**/*.local.env", policy["files"]["globs"])


if __name__ == "__main__":
    unittest.main()
