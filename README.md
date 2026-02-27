# secret-protector

**Secrets stay local. AI stays useful.**

You're about to paste a prompt that mentions `$GITHUB_PAT`. Or read `.env` into context. Or run `cat credentials.json` in a shell.

Without secret-protector, it goes to the model.

With secret-protector, it stops. You get a clear message. The model never sees it.

---

## Setup

```bash
npx secret-protector install
```

That's it. We create the config if needed, configure Cursor, OpenCode, Codex, and Copilot, and copy the runtime so hooks run without npx. You're protected.

**Quick reference:** `init` = create policy file only. `install` = apply policy to all tools (and create config if missing). `render-copilot` = output Copilot content only, no install. See [Commands](#commands) for details.

---

## What We Block

| Check | Example |
|-------|---------|
| **Env vars in prompts** | `"check if $GITHUB_PAT is set"` → blocked |
| **Env vars in commands** | `export OPENAI_API_KEY=...` → blocked |
| **Sensitive file paths** | Reading `.env`, `*.pem`, `id_rsa`, `credentials.json` → blocked |
| **Paths in shell commands** | `cat .env`, `grep secret .env.local` → blocked |

Default policy covers common secrets (GITHUB_PAT, OPENAI_API_KEY, AWS keys, etc.) and files (`.env*`, `*.pem`, `id_rsa`, etc.). Fully configurable in `~/.config/secret-protector/config.yaml`.

---

## Project Overrides

Drop a `.secretrc` in your repo. Lists merge with global; scalars override. Your team inherits the same rules. File patterns work like .gitignore: allow patterns take precedence over block.

```yaml
# .secretrc
env:
  block_exact: [STRIPE_SECRET_KEY]
files:
  block_globs: ['**/*production*.tfvars']
  allow_globs: ['config/env.example.yml']
```

---

## Configuration Reference

Policy is defined in `~/.config/secret-protector/config.yaml` (global) and `.secretrc` (project override). Lists merge; scalars override. The merged policy controls what we block and how.

### What we detect

| Section | Purpose |
|--------|---------|
| `env` | Block/allow env vars by exact name or regex |
| `files` | Block/allow file paths (globs and regex; allow wins over block) |
| `detection.path_like_keys` | Extra JSON keys treated as paths (extends built-ins) |
| `detection.file_read_commands` | Extra commands treated as file readers (e.g. `fd`) |
| `detection.env_reference_patterns` | Extra regex patterns for env detection (`{NAME}` placeholder) |

### How we react (block / warn / log)

Each provider and event has a mode:

- **block** — Deny the operation and show a message (default).
- **warn** — Allow but attach a warning message (when the provider supports it).
- **log** — Allow silently; detection is logged to stderr only.

| Section | Purpose |
|--------|---------|
| `detection.default_mode` | Default mode when no per-event override exists |
| `cursor.events.<event>.enabled` | Enable/disable each Cursor hook (`true` by default) |
| `cursor.events.<event>.mode` | Per-event mode override (beforeSubmitPrompt, beforeReadFile, beforeTabFileRead, beforeShellExecution, preToolUse) |
| `cursor.timeout_seconds` | Hook timeout (default: 10) |
| `opencode.tool_execute_before.mode` | Mode for OpenCode tool execution checks |
| `copilot.global_file` | Override global Copilot artifact path |
| `copilot.write_repo_file` | Set `false` to skip writing `.github/copilot-content-exclusions.txt` |

### Bypass tags and upgrading

- **`bypass_tags_enabled`**, **`bypass_tags`** — Customize prompt bypass tags. Omit individual fields to keep defaults (e.g. only `allow_secret` customizes secret tags; `allow_all` stays `["allow-all"]`).
- **Upgrading:** Existing configs work unchanged. New sections are optional. Add `detection.default_mode: warn` to observe before blocking, or `cursor.events.<event>.enabled: false` to disable specific hooks.

Full reference: [docs/design/POLICY_SCHEMA.md](docs/design/POLICY_SCHEMA.md). Commented example: [docs/example.secretrc](docs/example.secretrc).

---

## Commands

### `init` — Create the policy file

Writes `~/.config/secret-protector/config.yaml` with default rules. Does **not** configure any tools.

```bash
npx secret-protector init
npx secret-protector init --force   # overwrite existing
```

Use this when you want to explicitly create or reset your config before running install.

---

### `install` — Apply policy to all tools

Creates config if missing, copies the runtime, and configures Cursor, OpenCode, Codex, and Copilot. Writes hooks, plugins, and (for Copilot) exclusion files to their standard locations.

```bash
npx secret-protector install
npx secret-protector install --project /path/to/repo
npx secret-protector install --only cursor
npx secret-protector install --dry-run
```

This is the main command. Run it once (or again after changing policy). For Copilot, it writes the exclusion file to `~/.config/secret-protector/copilot-content-exclusions.txt` and `.github/copilot-content-exclusions.txt` in your project — you still must copy into GitHub settings manually.

---

### `render-copilot` — Output Copilot content only

Generates the Copilot exclusion content and prints it (or writes to `--output`). Does **not** run install or touch any provider configs.

```bash
npx secret-protector render-copilot
npx secret-protector render-copilot --output ./exclusions.txt
npx secret-protector render-copilot --project /path/to/repo --format github
```

Use this when you want the content without running full install — e.g. pipe elsewhere, CI, or a custom path.

---

## Bypass Tags (Optional)

When `bypass_tags_enabled` is true (default), add to your prompt:

- `[allow-all]` — Skip all checks
- `[allow-secret]` or `[allow-pii]` — Skip env/file detection for this prompt

Customize tag names via `bypass_tags` in config; omit fields to keep built-in defaults. File reads and shell commands always run full detection.

---

## Notes

- **Codex:** Configures `shell_environment_policy` only — env vars in subprocesses. No prompt or file read hooks.
- **Copilot:** Generates exclusion files you must copy into GitHub repo/org/enterprise settings. Does not apply to Copilot CLI or Agent mode.

No cloud. No API calls. Everything runs locally.

---

## Docs

- [Full documentation](docs/README.md) — Policy schema, merge rules, tests
- [Per-provider mechanics](docs/mechanics/) — Cursor, OpenCode, Codex, Copilot
- [Architecture](docs/design/ARCHITECTURE.md) — For contributors

Node.js 18+ or Bun 1.0+.
