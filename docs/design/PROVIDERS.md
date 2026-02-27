# Providers

## Cursor

**Config file:** `~/.cursor/hooks.json`

**Structure:**

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [{ "type": "command", "command": "...", "timeout": 10 }],
    "beforeReadFile": [...],
    "beforeTabFileRead": [...],
    "beforeShellExecution": [...],
    "preToolUse": [...]
  }
}
```

**Command:** `$HOME/.config/secret-protector/bin/secret-protector-hook cursor <event>`

**Events:** beforeSubmitPrompt, beforeReadFile, beforeTabFileRead, beforeShellExecution, preToolUse (all five by default; disable via `cursor.events.<event>.enabled: false`).

**Idempotency:** Remove existing secret-protector entries for each event before appending. Marker: `secret-protector-hook cursor <event>`.

---

## OpenCode

**Plugin path:** `~/.config/opencode/plugins/secret-protector.js` (use `plugins` plural per docs)

**Format:** ES module exporting `SecretProtector` with `tool.execute.before` key. Plugin spawns hook subprocess, parses JSON output. On `block: true`, throws.

**Hook invocation:** `SECRET_PROTECTOR_HOOK_CMD` or `$HOME/.config/secret-protector/bin/secret-protector-hook` + `opencode tool.execute.before`

---

## Codex

**Config file:** `~/.codex/config.toml`

**Block markers:** `# >>> secret-protector begin` ... `# <<< secret-protector end`

**Logic:**

1. Strip existing managed block from file
2. Strip existing `[shell_environment_policy]` table
3. Append new managed block with: `inherit = "core"`, `include_only`, `exclude`

**Env mapping:** Policy `env.allow_exact` + `env.allow_regex` → `include_only`. Policy `env.block_exact` + `env.block_regex` → `exclude`.

---

## Copilot

**Artifact paths:**

- Global: `~/.config/secret-protector/copilot-content-exclusions.txt` (or policy `copilot.global_file`)
- Repo: `<project_dir>/.github/copilot-content-exclusions.txt` (or policy `copilot.repo_file`; set `copilot.write_repo_file: false` to skip)

**Format:** Section headers `[glob_patterns]`, `[regex_patterns]`, then sorted unique patterns. GitHub expects fnmatch-style; this file is a source artifact for manual copy into GitHub settings.

**Limitation:** Content exclusion does not apply to Copilot CLI or Agent; only completion and Chat in IDEs.
