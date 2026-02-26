# Ecosystem Overview

## Comparison Matrix

| Project | Tools | Approach | Policy | Block vs Redact |
|---------|-------|----------|--------|-----------------|
| **secret-protector** | Cursor, OpenCode, Codex, Copilot | Hooks + config | YAML, project override | Block |
| **mintmcp/agent-security** | Cursor, Claude Code | Hooks | Hardcoded | Block (pre), Warn (post) |
| **boxpositron/envsitter-guard** | OpenCode | tool.execute.before | Hardcoded paths | Block + safe tools |
| **1Password/cursor-hooks** | Cursor | beforeShellExecution | 1Password config | Block (missing .env) |
| **trevorstenson/claude-redact-env** | Claude Code | PreToolUse | Hardcoded | Redact |
| **sensitive-canary** | Claude Code | UserPromptSubmit, PreToolUse | Plugin | Block |
| **GitGuardian Cursor** | Cursor | Extension (IDE) | .gitguardian.yaml | Detect + suggest |
| **Semgrep** | Cursor | afterFileEdit | Semgrep rules | Scan generated code |

## Approaches

- **Block:** Deny the operation (prompt, file read, shell).
- **Redact:** Substitute sensitive values with placeholders before agent sees them.
- **Detect:** Highlight secrets; do not block agent actions.

## Feature Gaps (secret-protector vs others)

- **agent-security:** Post-mode warnings; consider adding.
- **envsitter-guard:** Safe tools for .env inspection; consider documenting as alternative pattern.
- **claude-redact-env:** Bash command interception (cat .env → redacted path); could inform detector improvements.
- **sensitive-canary:** Opt-in bypass tags (`[allow-secret]`); possible future enhancement.
