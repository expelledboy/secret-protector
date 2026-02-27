# secret-protector – Agent Guidelines

## Documentation Convention

**All .md documentation lives under `./docs/`.** README.md and AGENTS.md may stay at project root for visibility. All other docs (design, mechanics, ecosystem, changelog, contributing, etc.) go in `./docs/*`.

## Project Context

secret-protector centralizes secret-blocking policy and installs controls for Cursor, OpenCode, Codex, and Copilot.

**Commands:** `init`, `install`, `hook <provider> <event>`, `render-copilot`

**Key paths:** `~/.config/secret-protector/config.yaml`, `~/.cursor/hooks.json`, `~/.config/opencode/plugins/`, `~/.codex/config.toml`

## Before Commit

Before writing a commit message, run `bun run suggest-bump` to see API changes since the last tag. Use the output to write a semantic commit message:

- Added API items → `feat(scope): add X`
- Removed API items → `feat!: remove X` or `BREAKING CHANGE: X`
- Bug fixes → `fix(scope): description`
- Docs, tests, refactors → `chore:`, `docs:`, `test:`

## Regeneration

To regenerate the project from specs: read `docs/design/REGENERATION.md` and follow the file-by-file mapping. All design specs are in `docs/design/`.

## Improvement Sync

To sync improvements from tracked external projects: read `docs/ecosystem/TRACKING.md` and follow the incorporation workflow. Update `docs/ecosystem/OVERVIEW.md` when adding or changing comparisons.
