# Ecosystem Overview

This document describes the landscape of secret-protection tools for AI coding agents, how they work, and how secret-protector differs.

---

## Executive Summary

| Dimension | secret-protector | Closest Alternatives |
|-----------|------------------|----------------------|
| **Scope** | Cursor, OpenCode, Codex, Copilot | agent-security (Cursor + Claude Code) |
| **Policy** | YAML with global + project override | Hardcoded or per-tool config |
| **Blocking model** | Block (deny operation) | Block, Redact, or Detect-only |
| **Distribution** | `npx secret-protector` (Bun/Node) | npm packages, Claude plugin marketplace |

**secret-protector is the only tool that applies a single policy across all four agents** (Cursor, OpenCode, Codex, Copilot) with project-level overrides via `.secretrc`.

---

## Comparison Matrix

| Project | Tools | Mechanism | Policy | Block vs Redact | Dependencies |
|---------|-------|------------|--------|-----------------|--------------|
| **secret-protector** | Cursor, OpenCode, Codex, Copilot | Hooks + Codex config + Copilot artifact | YAML, `.secretrc` | Block | yaml, minimatch |
| **mintmcp/agent-security** | Cursor, Claude Code | Hooks (beforeReadFile, beforeSubmitPrompt, PreToolUse) | Hardcoded patterns | Block (pre), Warn (post) | None |
| **boxpositron/envsitter-guard** | OpenCode | tool.execute.before | Hardcoded `.env*` paths | Block + safe tools | npm (envsitter) |
| **1Password/cursor-hooks** | Cursor | beforeShellExecution | 1Password Environments | Block (missing/invalid .env) | sqlite3, 1Password |
| **trevorstenson/claude-redact-env** | Claude Code | PreToolUse | Hardcoded patterns | Redact (temp file swap) | Node.js |
| **sensitive-canary** (coo-quack) | Claude Code | UserPromptSubmit, PreToolUse | Plugin built-in | Block | Claude plugin runtime |
| **GitGuardian Cursor** | Cursor | IDE extension | .gitguardian.yaml | Detect + suggest (no block) | GitGuardian SaaS |
| **Semgrep** | Cursor | afterFileEdit | Semgrep rules | Scan generated code | Semgrep |

---

## How Each Approach Works

### Block

Deny the operation entirely. The user sees an error (e.g. "Blocked by secret-protector") and the prompt/file read/shell command never reaches the model.

- **secret-protector, agent-security, 1Password, sensitive-canary**: Return `continue: false`, `permission: "deny"`, or `block: true`; or throw an error (OpenCode).
- **Advantage:** Strong guarantee—sensitive data never leaves.
- **Disadvantage:** Can frustrate users who intentionally need to reference config structure.

### Redact

Substitute sensitive values with placeholders before the agent sees them. The agent receives scrubbed content (e.g. `API_KEY=<REDACTED>`) instead of real values.

- **claude-redact-env, trevorstenson/claude-redact-env**: Intercept `Read` and `Bash` via PreToolUse; create temp file with redacted content; rewrite `file_path` or `command` to use the temp file.
- **Advantage:** Agent can still reason about structure (e.g. "you have DATABASE_URL set").
- **Disadvantage:** More complex; must parse and rewrite tool inputs; some commands may slip through (e.g. `cat $(echo ".env")`).

### Detect

Real-time scanning; highlight secrets in the IDE but do not block agent actions.

- **GitGuardian Cursor**: Extension scans as you type; shows warnings and remediation.
- **Advantage:** Non-blocking; good for preventing accidental commits.
- **Disadvantage:** Does not stop the agent from reading or exfiltrating secrets during a session.

---

## Project Deep Dives

### mintmcp/agent-security

- **Repo:** https://github.com/mintmcp/agent-security
- **Install:** `pipx install claude-secret-scan` or Claude Code plugin marketplace
- **How it works:** Python CLI receives JSON on stdin, scans for regex patterns (adapted from detect-secrets), outputs decision JSON. Cursor hooks call `cursor-secret-scan --mode=pre`; Claude hooks call `claude-secret-scan --mode=pre` (block) or `--mode=post` (warn).
- **Patterns:** Hardcoded in Python; no YAML config. Patterns informed by detect-secrets (Apache 2.0).
- **Gap vs secret-protector:** No Codex, no OpenCode, no Copilot; no project override. Post-mode warnings are a possible secret-protector enhancement.

### boxpositron/envsitter-guard

- **Repo:** https://github.com/boxpositron/envsitter-guard
- **Install:** `opencode.json` → `"plugin": ["envsitter-guard@latest"]` or local `.opencode/plugins/` / `~/.config/opencode/plugins/`
- **How it works:** OpenCode `tool.execute.before` hook blocks `read`, `edit`, `write`, `patch`, `multiedit` on `.env*` paths. Provides safe tools (`envsitter_keys`, `envsitter_match`, etc.) that inspect keys/fingerprints without exposing values.
- **Gap vs secret-protector:** OpenCode only; blocks by path pattern only (no env-var-in-prompt detection); uses EnvSitter library. secret-protector blocks more broadly (prompts, shell commands, env refs) via policy-driven patterns.

### 1Password/cursor-hooks

- **Repo:** https://github.com/1Password/cursor-hooks
- **Install:** Copy `1password` folder to `.cursor/hooks/`, add to `hooks.json` `beforeShellExecution`
- **How it works:** Validates that 1Password-mounted `.env` files exist and are correctly configured before Cursor runs shell commands. Blocks if required files are missing; does not scan for secret refs in prompts.
- **Gap vs secret-protector:** Cursor only; requires 1Password subscription; focuses on .env presence/validity, not prompt/file content scanning.

### trevorstenson/claude-redact-env

- **Repo:** https://github.com/trevorstenson/claude-redact-env
- **Blog:** https://trevo.rs/agent-redaction
- **How it works:** Node.js PreToolUse hook. For `Read`: if path matches `.env*`, `*.pem`, `credentials.json`, etc., create redacted temp copy, return `updatedInput: { file_path: redactedPath }`. For `Bash`: detect file-reading commands (`cat`, `grep`, `head`, etc.), extract paths, rewrite command to use redacted paths.
- **Gap vs secret-protector:** Claude Code only; redaction vs block; Bash interception logic could inform detector improvements (e.g. detecting `cat .env` in command strings).

### sensitive-canary (coo-quack)

- **Install:** Claude Code plugin marketplace — `/plugin marketplace add coo-quack/sensitive-canary` then `/plugin install sensitive-canary@coo-quack`
- **How it works:** Zero-config plugin; UserPromptSubmit + PreToolUse hooks. Detects 29 secret types (AWS, GitHub PAT, Stripe, JWT, etc.) and PII (SSN, email, phone). Uses entropy filtering to reduce false positives. Opt-in bypass: `[allow-secret]`, `[allow-pii]`, `[allow-all]` in prompt.
- **Gap vs secret-protector:** Claude Code only; plugin marketplace distribution; bypass tags are a possible secret-protector enhancement.

### GitGuardian Cursor Extension

- **Docs:** https://docs.gitguardian.com/ggshield-docs/integrations/ide-integrations/cursor
- **How it works:** IDE extension using ggshield CLI; 500+ secret patterns; real-time scan on save; highlights in Problems panel; no agent blocking.
- **Gap vs secret-protector:** Detection only; no hooks; requires GitGuardian (SaaS or self-hosted).

### Semgrep Cursor Hooks

- **Blog:** https://semgrep.dev/blog/2025/cursor-hooks-mcp-server/
- **How it works:** `afterFileEdit` hook scans AI-generated code with Semgrep (SAST, SCA, Secrets). Can block until scan passes.
- **Gap vs secret-protector:** Scans *output* (generated code), not *input* (prompts, file reads). Different threat model.

---

## secret-protector Differentiators

1. **Single policy, four agents:** One `config.yaml` + `.secretrc` applies to Cursor, OpenCode, Codex, and Copilot.
2. **Project overrides:** `.secretrc` in any ancestor directory; lists merged and deduplicated.
3. **Codex support:** Only secret-protector configures Codex `shell_environment_policy` (env allow/deny for subprocesses).
4. **Copilot artifact:** Generates exclusion file for manual copy into GitHub settings; other tools do not target Copilot.
5. **npx distribution:** `npx secret-protector` runs without global install; `install` copies runtime to `~/.config/secret-protector/` so hooks run without npx.

---

## Feature Gaps & Possible Enhancements

| From | Idea |
|------|------|
| agent-security | Post-mode warnings (block on pre, warn on post) |
| envsitter-guard | Document as alternative for OpenCode .env-only use; safe-tool pattern for key inspection |
| claude-redact-env | Bash command path extraction (detect `cat .env` in command string) |
| sensitive-canary | Opt-in bypass tags (e.g. `[allow-secret]` in prompt) — **implemented** |
| OpenCode #4969, envsitter-guard | **files.allow_globs / files.allow_regex** — implemented; allow `.env.example`, `.env.template`, etc.; users demand \"control over what gets blacklisted\" while still allowing safe templates via `files.allow_*` over `files.block_*` |
| Cursor provider | Add `beforeShellExecution` and `preToolUse` (currently in hooks.ts; Cursor provider installs all five events) |

---

## References

- [Cursor Third Party Hooks](https://cursor.com/docs/agent/third-party-hooks)
- [Cursor Hooks Deep Dive (Butler's Log)](https://blog.gitbutler.com/cursor-hooks-deep-dive)
- [OpenCode Plugins](https://opencode.ai/docs/plugins/)
- [Codex Configuration Reference](https://developers.openai.com/codex/config-reference)
- [GitHub Copilot Content Exclusion](https://docs.github.com/en/copilot/how-tos/content-exclusion/exclude-content-from-copilot)
- [Cursor Hooks Partners](https://cursor.com/blog/hooks-partners)
