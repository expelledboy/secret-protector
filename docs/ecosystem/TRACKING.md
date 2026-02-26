# Tracked Repositories

Repos to monitor for improvements to incorporate into secret-protector.

## Repos to Monitor

| Repo | URL | Focus | Check for |
|------|-----|-------|-----------|
| mintmcp/agent-security | https://github.com/mintmcp/agent-security | Cursor + Claude hooks | New patterns, PreToolUse handling, post-mode |
| boxpositron/envsitter-guard | https://github.com/boxpositron/envsitter-guard | OpenCode .env blocking | Safe-tool patterns, tool.execute.before usage |
| 1Password/cursor-hooks | https://github.com/1Password/cursor-hooks | Cursor beforeShellExecution | Validation patterns |
| trevorstenson/claude-redact-env | https://github.com/trevorstenson/claude-redact-env | Redaction vs block | Bash command interception, path rewriting |
| coo-quack/sensitive-canary | (Claude plugin marketplace) | Claude Code plugin | Secret/PII patterns, allow tags |

## Incorporation Workflow

1. Periodically (or on request) review each repo's releases and recent commits.
2. For each improvement: document in OVERVIEW.md; add to REQUIREMENTS or PROVIDERS in docs/design if applicable.
3. Implement changes in `src/` and update design specs to stay in sync.
4. Run tests and live checks (when available).

## Last Reviewed

(Update when syncing: e.g. "2025-02-26")
