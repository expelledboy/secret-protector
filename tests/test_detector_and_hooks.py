from __future__ import annotations

import copy
import unittest

from secret_protector.defaults import DEFAULT_POLICY
from secret_protector.detector import detect_secret_leak, detect_sensitive_read
from secret_protector.hooks import cursor_decision, opencode_decision


class DetectorAndHookTests(unittest.TestCase):
    def setUp(self) -> None:
        self.policy = copy.deepcopy(DEFAULT_POLICY)

    def test_detect_secret_leak_env(self) -> None:
        reason = detect_secret_leak({"prompt": "use GITHUB_PAT for this"}, self.policy)
        self.assertIsNotNone(reason)
        self.assertIn("GITHUB_PAT", reason or "")

    def test_detect_secret_leak_file_pattern(self) -> None:
        reason = detect_secret_leak({"path": ".env.local"}, self.policy)
        self.assertIsNotNone(reason)
        self.assertIn("sensitive file path pattern", reason or "")

    def test_detect_sensitive_read_blocks_env_file(self) -> None:
        reason = detect_sensitive_read({"filePath": "secrets/.env"}, self.policy)
        self.assertIsNotNone(reason)

    def test_cursor_before_submit_prompt_block(self) -> None:
        decision = cursor_decision("beforeSubmitPrompt", {"prompt": "GITHUB_PAT"}, self.policy)
        self.assertEqual(decision.get("continue"), False)
        self.assertIn("Blocked by secret-protector", decision.get("user_message", ""))

    def test_opencode_tool_execute_before_block(self) -> None:
        payload = {"tool": {"name": "read", "arguments": {"path": ".env"}}}
        decision = opencode_decision("tool.execute.before", payload, self.policy)
        self.assertTrue(decision.get("block"))


if __name__ == "__main__":
    unittest.main()
