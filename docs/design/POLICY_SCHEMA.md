# Policy Schema

## YAML Structure

```yaml
version: 1
env:
  exact: [string]        # Env var names to block (e.g. GITHUB_PAT)
  regex: [string]        # Regex for env names (e.g. (?i)^.*TOKEN$)
  allow_exact: [string]  # Env names to allow (Codex whitelist)
  allow_regex: [string]  # Regex for allowed env (Codex)
files:
  globs: [string]        # Glob patterns (e.g. .env, **/.env.*)
  regex: [string]        # Path regex (e.g. (?i)(^|/)secrets?(/|$)
providers:
  cursor: bool
  opencode: bool
  codex: bool
  copilot: bool
copilot:
  repo_file: string      # e.g. .github/copilot-content-exclusions.txt
bypass_tags_enabled: bool  # If true, allow [allow-all], [allow-secret], [allow-pii] in prompt
```

## Bypass Tags

When `bypass_tags_enabled` is true (default), users can add tags to prompts to intentionally allow secret references:

- `[allow-all]` — Skip all detection; allow the prompt.
- `[allow-secret]` — Skip env/file detection for this prompt.
- `[allow-pii]` — Same as allow-secret (future: separate PII detection).

**Scope:** Bypass tags apply only to `beforeSubmitPrompt`. File reads and shell commands always run full detection.

## Merge Rules

- **Dicts:** Deep merge. Override values win for leaves; nested dicts merged recursively.
- **Lists:** Concatenate then deduplicate by canonical JSON key (`JSON.stringify(val, Object.keys(val).sort())`).

## Default Policy

See `src/defaults.ts` or `DEFAULT_POLICY` constant. Includes common secrets (GITHUB_PAT, OPENAI_API_KEY, etc.), file patterns (.env, *.pem, credentials, etc.), and all providers enabled.
