# secret-protector

`secret-protector` centralizes secret-blocking policy in:

- global: `~/.config/secret-protector/config.yaml`
- project override: `./.secretrc` (discovered by walking up from cwd)

It installs/upserts controls for:

- Cursor hooks (`~/.cursor/hooks.json`)
- OpenCode plugin (`~/.config/opencode/plugins/secret-protector.js`)
- Codex env policy (`~/.codex/config.toml`)
- Copilot exclusion artifacts (manual apply in GitHub settings)

## Quick Start

```bash
npx secret-protector init
npx secret-protector install
```

Optional (explicit project directory):

```bash
npx secret-protector install --project /path/to/repo
```

## Commands

- `init`: create default global config
- `install`: upsert provider configs from merged policy
- `hook <provider> <event>`: hook runtime entrypoint (used by Cursor/OpenCode)
- `render-copilot`: render Copilot exclusion artifact from merged policy

## Tests

```bash
bun test
# or
bun test ./tests/detector.test.ts ./tests/policy.test.ts ./tests/providers.test.ts ./tests/cli-smoke.test.ts
```

Run opt-in live blocking tests:

```bash
SECRET_PROTECTOR_RUN_LIVE_CLI_TESTS=1 bun test ./tests/live-blocking.test.ts
```

## Policy File

Default: `~/.config/secret-protector/config.yaml`

See [docs/design/POLICY_SCHEMA.md](design/POLICY_SCHEMA.md) for schema. Project overrides go in `./.secretrc`; lists are merged and deduplicated. See [example.secretrc](example.secretrc).

## Important Notes

- Codex: configures `shell_environment_policy`; Codex does not expose Cursor-style hooks for prompt interception.
- Copilot: content exclusion must be configured in GitHub settings (repo/org/enterprise). This tool writes artifact files to copy from.
