# Tracked Repositories

Repos to monitor for improvements to incorporate into secret-protector.

---

## Repos to Monitor

| Repo | URL | Focus | Check For |
|------|-----|-------|-----------|
| mintmcp/agent-security | https://github.com/mintmcp/agent-security | Cursor + Claude Code hooks | New regex patterns; PreToolUse/Bash handling; post-mode semantics; `plugins/secrets_scanner/hooks/secrets_scanner_hook.py` |
| boxpositron/envsitter-guard | https://github.com/boxpositron/envsitter-guard | OpenCode .env blocking | Safe-tool pattern; `tool.execute.before` input shape; `input.tool` vs `output.args` usage |
| 1Password/cursor-hooks | https://github.com/1Password/cursor-hooks | Cursor beforeShellExecution | Validation flow; remediation message format; `validate-mounted-env-files.sh` |
| trevorstenson/claude-redact-env | https://github.com/trevorstenson/claude-redact-env | Redaction vs block | Bash command parsing (`cat`, `grep`, `head`, etc.); path extraction from command string; `updatedInput` schema |
| sensitive-canary | Claude plugin marketplace (coo-quack) | Claude Code plugin | Secret/PII patterns; `[allow-secret]` tag semantics; entropy filtering |
| trevo.rs/agent-redaction | https://trevo.rs/agent-redaction | Redaction approach | Hook output schema (`hookSpecificOutput`, `updatedInput`); pattern ordering |

---

## What to Look For

### mintmcp/agent-security

- **Releases:** New pattern sets (e.g. new API key formats)
- **Code:** `plugins/secrets_scanner/hooks/secrets_scanner_hook.py` — regex list, detection logic
- **Incorporate:** Add patterns to `src/defaults.ts` or policy schema; consider post-mode flag in `hooks.ts`

### boxpositron/envsitter-guard

- **Releases:** Changes to blocking behavior, new safe tools
- **Code:** `index.ts` — `tool.execute.before` handler, how `input`/`output` are used
- **Incorporate:** If we add safe-tool pattern, model on envsitter_keys/envsitter_match; verify OpenCode plugin export format (async fn vs object)

### 1Password/cursor-hooks

- **Releases:** New validation modes, .env path handling
- **Code:** `validate-mounted-env-files.sh` — block message format
- **Incorporate:** user_message style for shell blocks; consider optional 1Password integration as separate provider

### trevorstenson/claude-redact-env

- **Releases:** New patterns, Bash command detection
- **Code:** `src/` — `FILE_READ_COMMANDS`, path extraction, redaction logic
- **Incorporate:** Extend `detector.ts` to detect file paths inside shell command strings (e.g. `cat .env` → path `.env`); add to `detectSensitiveCommand`

### sensitive-canary

- **Marketplace:** Pattern updates, new secret types
- **Incorporate:** Bypass tag parsing in prompt (if we add `[allow-secret]`); additional env name regexes

---

## Incorporation Workflow

1. **Review:** Periodically (or on request) check each repo's releases, recent commits, and open issues.

2. **Document:** Update `docs/ecosystem/OVERVIEW.md` with new findings; add items to `docs/design/REQUIREMENTS.md` or `docs/design/PROVIDERS.md` if applicable.

3. **Implement:** Make changes in `src/`; keep design specs in sync.

4. **Verify:**
   ```bash
   bun test
   bun run build
   SECRET_PROTECTOR_RUN_LIVE_CLI_TESTS=1 bun test ./tests/live-blocking.test.ts  # when CLIs available
   ```

5. **Update tracking:** Set `Last Reviewed` below to current date.

---

## secret-protector Files to Update

| Change Type | Files |
|-------------|-------|
| New env patterns | `src/defaults.ts`, `docs/design/POLICY_SCHEMA.md` |
| New file patterns | `src/defaults.ts`, `docs/design/POLICY_SCHEMA.md` |
| Detector logic | `src/detector.ts`, `tests/detector.test.ts` |
| Hook behavior | `src/hooks.ts`, `tests/detector.test.ts` |
| Provider config | `src/providers/*.ts`, `docs/design/PROVIDERS.md`, `docs/mechanics/*.md` |
| Policy schema | `docs/design/POLICY_SCHEMA.md`, `docs/design/REQUIREMENTS.md` |

---

## Last Reviewed

(Update when syncing: e.g. 2025-02-26)
