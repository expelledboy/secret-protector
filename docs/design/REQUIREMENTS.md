# Requirements

## Purpose

secret-protector centralizes secret-blocking policy and installs/upserts controls across AI coding tools (Cursor, OpenCode, Codex, Copilot) to prevent credentials and sensitive file contents from leaking to AI models.

## Functional Requirements

### FR-1: Policy Configuration

- **FR-1.1** Support global config at `~/.config/secret-protector/config.yaml`
- **FR-1.2** Support project override via `.secretrc` (discovered by walking up from cwd)
- **FR-1.3** Merge policy: global + project; list values merged and deduplicated (canonical JSON key)
- **FR-1.4** Policy schema: `version`, `env` (block_exact, block_regex, allow_exact, allow_regex), `files` (block_globs, block_regex, allow_globs, allow_regex), `providers`, `copilot`

### FR-2: Commands

- **FR-2.1** `init`: Create default global config; `--force` overwrites
- **FR-2.2** `install`: Upsert provider configs from merged policy; `--project` for explicit project dir
- **FR-2.3** `hook <provider> <event>`: Read JSON from stdin, output decision JSON to stdout; used by Cursor/OpenCode
- **FR-2.4** `render-copilot`: Output Copilot exclusion artifact; `--output` write to file; `--project` for policy source

### FR-3: Providers

- **FR-3.1** **Cursor**: Upsert hooks in `~/.cursor/hooks.json` for beforeSubmitPrompt, beforeReadFile, beforeTabFileRead (optionally beforeShellExecution, preToolUse)
- **FR-3.2** **OpenCode**: Install plugin at `~/.config/opencode/plugins/secret-protector.js` (tool.execute.before)
- **FR-3.3** **Codex**: Upsert `shell_environment_policy` in `~/.codex/config.toml` (managed block)
- **FR-3.4** **Copilot**: Write artifact to global path and optionally project `.github/copilot-content-exclusions.txt`

### FR-4: Detection

- **FR-4.1** Env var detection: exact names + regex patterns; check for references in payload strings (prompt, command, tool args)
- **FR-4.2** File path detection: glob + regex; collect path-like values from payloads (path keys, slash/backslash in strings)
- **FR-4.3** Honor `env.allow_exact` / `env.allow_regex` for Codex env policy (whitelist) alongside `env.block_exact` / `env.block_regex` for exclusion
- **FR-4.4** Honor `files.allow_globs` / `files.allow_regex` — paths matching allow never blocked even if they match `files.block_globs` / `files.block_regex` (gitignore-style)

## Non-Functional Requirements

### NFR-1: Runtime

- Support Node.js 18+
- Support Bun 1.0+ for development

### NFR-2: Installation

- Publish to npm; `npx secret-protector` runs the CLI
- `install` copies binaries to `~/.config/secret-protector/` so hooks run without npx

### NFR-3: Dependencies

- Minimal: YAML parsing (`yaml` or `js-yaml`); no Ruby fallback
- No external API calls; runs fully locally

### NFR-4: Documentation

- All docs under `./docs/`
- Design specs in `./docs/design` enable full project regeneration by another agent

## Success Criteria

- `npx secret-protector init` creates config
- `npx secret-protector install` updates all enabled provider configs
- `npx secret-protector hook cursor beforeSubmitPrompt` blocks when payload contains secret env ref
- Unit tests pass; smoke tests pass; live tests (opt-in) pass when CLIs are installed
