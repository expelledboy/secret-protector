from __future__ import annotations

from typing import Any

MANAGED_BLOCK_START = "# >>> secret-protector begin"
MANAGED_BLOCK_END = "# <<< secret-protector end"

DEFAULT_POLICY: dict[str, Any] = {
    "version": 1,
    "env": {
        "exact": [
            "GITHUB_PAT",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "GEMINI_API_KEY",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_SESSION_TOKEN",
            "AZURE_OPENAI_API_KEY",
            "SLACK_BOT_TOKEN",
            "NPM_TOKEN",
            "PYPI_TOKEN",
        ],
        "regex": [
            r"(?i)^[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|PAT)$",
        ],
        "allow_exact": [
            "HOME",
            "PATH",
            "SHELL",
            "TERM",
            "USER",
            "LOGNAME",
            "PWD",
            "LANG",
            "TMPDIR",
            "TMP",
            "TEMP",
            "LC_ALL",
            "LC_CTYPE",
            "LC_MESSAGES",
        ],
        "allow_regex": [
            r"^LC_.*$",
        ],
    },
    "files": {
        "globs": [
            ".env",
            ".env.*",
            "**/.env",
            "**/.env.*",
            "**/*.pem",
            "**/*.p12",
            "**/*.pfx",
            "**/*.key",
            "**/id_rsa",
            "**/id_rsa.*",
            "**/id_ed25519",
            "**/id_ed25519.*",
            "**/*secrets*.yml",
            "**/*secrets*.yaml",
            "**/*secrets*.json",
        ],
        "regex": [
            r"(?i)(^|/)(credentials?|secrets?|tokens?)(/|\\|$)",
            r"(?i)(^|/)(\.aws|\.ssh|\.gnupg)(/|$)",
        ],
    },
    "providers": {
        "cursor": True,
        "opencode": True,
        "codex": True,
        "copilot": True,
    },
    "copilot": {
        "repo_file": ".github/copilot-content-exclusions.txt",
    },
}
