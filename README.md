# secret-protector

`secret-protector` centralizes secret-blocking policy in:

- global: `~/.config/secret-protector/config.yaml`
- project override: `./.secretrc` (discovered by walking up from cwd)

It installs/upserts controls for:

- Cursor hooks (`~/.cursor/hooks.json`)
- OpenCode plugin hook (`~/.config/opencode/plugin/secret-protector.js`)
- Codex env policy (`~/.codex/config.toml`)
- Copilot exclusion artifacts (manual apply in GitHub settings)

## Quick Start

```bash
cd /private/tmp/secret-protector
./secret-protector.py init
./secret-protector.py install
```

Optional (explicit project directory):

```bash
./secret-protector.py install --project /path/to/repo
```

## Commands

- `init`: create default global config
- `install`: upsert provider configs from merged policy
- `hook <provider> <event>`: hook runtime entrypoint (used by Cursor/OpenCode)
- `render-copilot`: render Copilot exclusion artifact from merged policy

## Tests

Run all tests:

```bash
python3 -m unittest discover -s tests -v
```

Run only CLI smoke tests (entrypoint + external CLIs):

```bash
python3 -m unittest tests.test_cli_smoke -v
```

## Policy File

Default file: `~/.config/secret-protector/config.yaml`

```yaml
version: 1
env:
  exact:
    - GITHUB_PAT
  regex:
    - '(?i)^[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|PAT)$'
  allow_exact:
    - HOME
    - PATH
  allow_regex:
    - '^LC_.*$'
files:
  globs:
    - '.env'
    - '.env.*'
    - '**/.env'
    - '**/.env.*'
  regex:
    - '(?i)(^|/)(credentials?|secrets?|tokens?)(/|\\|$)'
providers:
  cursor: true
  opencode: true
  codex: true
  copilot: true
copilot:
  repo_file: .github/copilot-content-exclusions.txt
```

Project-specific overrides go in `./.secretrc`; lists are merged and deduplicated.
See `example.secretrc` for a minimal project override example.

## Important Notes

- Codex: this tool configures `shell_environment_policy`; Codex does not currently expose a documented equivalent of Cursor/OpenCode hook files for prompt interception.
- Copilot: content exclusion must be configured in GitHub settings (repo/org/enterprise). This tool writes artifact files to copy from, but GitHub does not auto-read them.
