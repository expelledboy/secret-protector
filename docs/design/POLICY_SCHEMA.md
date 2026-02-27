# Policy Schema

## YAML Structure

```yaml
version: 1
env:
  block_exact: [string]   # Env var names to block (e.g. GITHUB_PAT)
  block_regex: [string]   # Regex for env names to block (e.g. (?i)^.*TOKEN$)
  allow_exact: [string]   # Env names to always allow (Codex whitelist)
  allow_regex: [string]   # Regex for env names to always allow (Codex)
files:
  block_globs: [string]   # Block (exclude) glob patterns (e.g. .env, **/.env.*)
  block_regex: [string]   # Block (exclude) path regex (e.g. (?i)(^|/)secrets?(/|$))
  allow_globs: [string]   # Allow (include) glob patterns — matches never blocked
  allow_regex: [string]   # Allow (include) path regex — matches never blocked
providers:
  cursor: bool
  opencode: bool
  codex: bool
  copilot: bool
copilot:
  repo_file: string       # e.g. .github/copilot-content-exclusions.txt
bypass_tags_enabled: bool  # If true, allow [allow-all], [allow-secret], [allow-pii] in prompt
```

## Bypass Tags

When `bypass_tags_enabled` is true (default), users can add tags to prompts to intentionally allow secret references:

- `[allow-all]` — Skip all detection; allow the prompt.
- `[allow-secret]` — Skip env/file detection for this prompt.
- `[allow-pii]` — Same as allow-secret (future: separate PII detection).

**Scope:** Bypass tags apply only to `beforeSubmitPrompt`. File reads and shell commands always run full detection.

## File Patterns (block vs allow)

Paths are evaluated in order: **allow first**, then block (like .gitignore where `!` negations override).

- If a path matches any `allow_globs` or `allow_regex` → pass (never blocked).
- Else if it matches any `block_globs` or `block_regex` → block.

Default `files.allow_globs` includes `.env.example`, `.env.template`, `.env.sample`, `.env.schema` so template files can be read. Add more in `.secretrc` per project.

## Merge Rules

- **Dicts:** Deep merge. Override values win for leaves; nested dicts merged recursively.
- **Lists:** Concatenate then deduplicate by canonical JSON key (`JSON.stringify(val, Object.keys(val).sort())`).

## Default Policy

See `src/defaults.ts` or `DEFAULT_POLICY` constant. Includes common secrets (GITHUB_PAT, OPENAI_API_KEY, etc.), file patterns (.env, *.pem, credentials, etc.), and all providers enabled.
