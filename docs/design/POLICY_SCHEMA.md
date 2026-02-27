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

# Which providers are managed by `install`.
providers:
  cursor: bool
  opencode: bool
  codex: bool
  copilot: bool

# Copilot exclusion artifact behavior.
copilot:
  repo_file: string        # e.g. .github/copilot-content-exclusions.txt
  global_file: string      # Optional; override default global export path
  write_repo_file: bool    # Optional; default true – whether to write per-repo file

# Prompt bypass behavior (Cursor).
bypass_tags_enabled: bool  # If true, allow prompt bypass tags (see bypass_tags)
bypass_tags:               # Optional; customize tag names
  allow_all: [string]      # Tags that fully bypass prompt checks, e.g. ["allow-all"]
  allow_secret: [string]   # Tags that bypass secret/file checks, e.g. ["allow-secret","allow-pii"]

# Detection heuristics and default mode.
detection:
  path_like_keys: [string]       # Extra JSON keys to treat as paths (in addition to built-ins)
  file_read_commands: [string]   # Extra shell commands treated as file readers
  env_reference_patterns: [string]
    # Optional patterns to detect env var references; see Detection Heuristics section.
  default_mode: string           # "block" | "warn" | "log" (default: "block")

# Cursor-specific behavior.
cursor:
  timeout_seconds: number        # Hook timeout in seconds (default: 10)
  events:
    beforeSubmitPrompt:
      enabled: bool              # Default: true
      mode: string               # "block" | "warn" | "log" (default: detection.default_mode or "block")
    beforeReadFile:
      enabled: bool              # Default: true
      mode: string
    beforeTabFileRead:
      enabled: bool              # Default: true
      mode: string
    beforeShellExecution:
      enabled: bool              # Default: true
      mode: string
    preToolUse:
      enabled: bool              # Default: true
      mode: string

# OpenCode-specific behavior.
opencode:
  tool_execute_before:
    mode: string                 # "block" | "warn" | "log" (default: detection.default_mode or "block")

# Runtime installation / hook wiring (advanced).
runtime:
  hook_command: string           # Optional; override hook command used in provider configs
  install_mode: string           # "copy" | "symlink" | "none" (default: "copy")

# CLI / install behavior (advanced).
install:
  default_providers: [string]    # Optional; providers enabled when running `install` with no --only (default: all true entries in providers)
```

## Bypass Tags

When `bypass_tags_enabled` is true (default), users can add tags to prompts to intentionally allow secret references.

By default, the following tags are recognized in Cursor `beforeSubmitPrompt` events:

- `[allow-all]` — Skip all detection; allow the prompt.
- `[allow-secret]` — Skip env/file detection for this prompt.
- `[allow-pii]` — Same as allow-secret (future: separate PII detection).

You can customize tag names with the optional `bypass_tags` section. Omit individual fields to keep built-in defaults (e.g. only `allow_secret` customizes secret tags; `allow_all` stays `["allow-all"]`):

```yaml
bypass_tags_enabled: true
bypass_tags:
  allow_all: ["allow-all"]
  allow_secret: ["allow-secret", "allow-pii"]
```

**Scope:** Bypass tags apply only to Cursor `beforeSubmitPrompt`. File reads and shell commands always run full detection regardless of bypass tags.

When `bypass_tags_enabled: false`, bypass tags are ignored even if `bypass_tags` is present.

## File Patterns (block vs allow)

Paths are evaluated in order: **allow first**, then block (like .gitignore where `!` negations override).

- If a path matches any `allow_globs` or `allow_regex` → pass (never blocked).
- Else if it matches any `block_globs` or `block_regex` → block.

Default `files.allow_globs` includes `.env.example`, `.env.template`, `.env.sample`, `.env.schema` so template files can be read. Add more in `.secretrc` per project.

## Detection Heuristics

Detection heuristics control how payloads are scanned for potential leaks.

### Path-like keys

By default, keys like `path`, `filepath`, `file_path`, `filename`, `uri`, `absolute_path`, `relative_path`, `relative_workspace_path`, etc. are treated as “path-like”. Values under these keys are scanned against `files.*` patterns.

You can extend this set:

```yaml
detection:
  path_like_keys:
    - fileUri
    - workspacePath
```

These keys are merged with the built-in set; they do not replace it.

### File-reading commands

Shell commands are scanned for file arguments when they use common file-reading tools (e.g. `cat .env`, `rg pattern -- .env.local`).

By default, commands like `cat`, `head`, `tail`, `less`, `more`, `grep`, `awk`, `sed`, `bat`, and `rg` are treated as file-reading commands.

You can extend this set:

```yaml
detection:
  file_read_commands:
    - fd
    - my-cat
```

These commands are merged with the built-in set; they do not replace it.

### Env reference patterns

Env vars are detected by name (from `env.block_exact` / `env.block_regex`) using a small set of built-in patterns, such as:

- `$VAR` or `${VAR}`
- `VAR=...` or `export VAR`
- Bare `VAR` tokens in text

You can add extra match patterns via `detection.env_reference_patterns`. Each pattern is a regular expression template where `{NAME}` will be replaced with the escaped env var name:

```yaml
detection:
  env_reference_patterns:
    - "\\bsecret\\s+{NAME}\\b"
```

If this list is omitted or empty, only the built-in patterns are used.

## Behavior Modes (block / warn / log)

Detection results can be applied in different modes:

- `block` — Block the operation and show a message to the user.
- `warn` — Allow the operation but attach a warning message (when supported).
- `log` — Allow the operation silently; detection is only logged to stderr.

The top-level `detection.default_mode` controls the default when a more specific per-provider setting is absent.

Per-provider overrides:

- Cursor:
  - `cursor.events.<event>.mode` (for `beforeSubmitPrompt`, `beforeReadFile`, `beforeTabFileRead`, `beforeShellExecution`, `preToolUse`).
- OpenCode:
  - `opencode.tool_execute_before.mode`.

If no mode is configured anywhere, the effective mode is `block` (preserving current behavior).

## Merge Rules

- **Dicts:** Deep merge. Override values win for leaves; nested dicts merged recursively.
- **Lists:** Concatenate then deduplicate by canonical JSON key (`JSON.stringify(val, Object.keys(val).sort())`).

In practice:

- Global config (`config.yaml`) is merged first with the built-in `DEFAULT_POLICY`.
- Project config (`.secretrc`) is then merged on top.

For project-level overrides, it is safe (and expected) to override:

- `env.*`, `files.*` lists to tune what counts as a secret.
- `detection.path_like_keys`, `detection.file_read_commands`, `detection.env_reference_patterns`.
- `detection.default_mode` and any per-provider mode fields (`cursor.events.*.mode`, `opencode.tool_execute_before.mode`).
- `cursor.events.*.enabled` to disable specific Cursor events.
- `bypass_tags_enabled` and `bypass_tags.*` to control prompt bypass behavior.
- `install.default_providers` to narrow which providers are configured by default on `install`.

## Default Policy

See `src/defaults.ts` or `DEFAULT_POLICY` constant. Includes common secrets (GITHUB_PAT, OPENAI_API_KEY, etc.), file patterns (.env, *.pem, credentials, etc.), and all providers enabled.

## Upgrading Configuration

Existing `config.yaml` and `.secretrc` files require no changes. New fields are optional:

- `detection`, `cursor`, `opencode` — All default to current behavior when absent.
- Add `detection.default_mode: warn` to observe before blocking.
- Add `cursor.events.<event>.enabled: false` to disable specific hooks.
- Add `bypass_tags` to customize tag names while keeping `bypass_tags_enabled`.
