# Codex Configuration Mechanics

How Codex's `shell_environment_policy` works and how secret-protector configures it.

---

## Official References

- [Configuration Reference](https://developers.openai.com/codex/config-reference)
- [shell_environment_policy GitHub issue](https://github.com/openai/codex/issues/1249)
- [Config schema JSON](https://developers.openai.com/codex/config-schema.json)

---

## Config File

**Location:** `~/.codex/config.toml`

**Project override:** `.codex/config.toml` (loaded only when project is trusted)

---

## shell_environment_policy

Controls which environment variables are passed to subprocesses (e.g. when the agent runs shell commands).

| Key | Type | Description |
|-----|------|--------------|
| `inherit` | string | `all` \| `core` \| `none` — baseline env inheritance |
| `include_only` | array of strings | Regex patterns; when set, **only** vars matching are kept (whitelist) |
| `exclude` | array of strings | Regex patterns; vars matching are **removed** after other filters |
| `set` | map | Explicit overrides injected into every subprocess |
| `ignore_default_excludes` | boolean | Keep KEY/SECRET/TOKEN vars before other filters (rare) |

**inherit values:**

- `all` — inherit full parent environment (default in some configs)
- `core` — inherit only core/safe vars (e.g. PATH, HOME, LANG)
- `none` — start with minimal env

---

## secret-protector Mapping

| Policy | Codex Config |
|--------|--------------|
| `env.allow_exact` | `include_only`: `^NAME$` for each |
| `env.allow_regex` | `include_only`: patterns as-is |
| `env.exact` | `exclude`: `^NAME$` for each |
| `env.regex` | `exclude`: patterns as-is |

**Logic:** secret-protector sets `inherit = "core"` and builds:

- `include_only` = allow list (what Codex may pass through)
- `exclude` = block list (what Codex must not pass)

If `include_only` is empty, Codex behavior depends on config (empty array may mean "no whitelist" i.e. pass core + non-excluded). Our defaults include common safe vars (HOME, PATH, SHELL, etc.) in `allow_exact`.

---

## Managed Block

secret-protector wraps its changes in markers for idempotent updates:

```toml
# >>> secret-protector begin
[shell_environment_policy]
inherit = "core"
include_only = ["^HOME$", "^PATH$", ...]
exclude = ["^GITHUB_PAT$", "^OPENAI_API_KEY$", ...]
# <<< secret-protector end
```

**Update process:**

1. Strip existing block (between markers)
2. Strip existing `[shell_environment_policy]` table (entire section)
3. Append new managed block

Other config (profiles, MCP servers, etc.) is preserved.

---

## Limitation

Codex does **not** expose Cursor-style hooks for prompt interception. The only mechanism for secret protection is `shell_environment_policy`, which filters env vars passed to subprocesses.

**Implications:**

- Prompts mentioning `GITHUB_PAT` are not blocked at submit time
- File reads are not intercepted by Codex hooks
- If the agent can read `~/.bashrc` or `~/.zprofile` and those contain secrets, env filtering alone does not prevent exposure

For stronger protection, use Cursor or OpenCode hooks in addition to Codex.

---

## TOML Format

- Strings in arrays are JSON-quoted: `["^HOME$", "^PATH$"]`
- `include_only` and `exclude` are arrays of regex patterns (Codex uses them as glob/regex for env names)
