# Codex Configuration Mechanics

## Official References

- [Configuration Reference](https://developers.openai.com/codex/config-reference)
- [shell_environment_policy](https://github.com/openai/codex/issues/1249)

## Config File

**Location:** `~/.codex/config.toml`

## shell_environment_policy

Controls which environment variables are passed to subprocesses.

| Key | Type | Values |
|-----|------|--------|
| `inherit` | string | `all`, `core`, `none` |
| `include_only` | array | Regex patterns; when set, only matching vars kept |
| `exclude` | array | Regex patterns; vars matching are removed |
| `set` | map | Explicit overrides |

**secret-protector approach:** Set `inherit = "core"`, `include_only` from policy `env.allow_*`, `exclude` from policy `env.exact` and `env.regex`.

## Managed Block

secret-protector wraps its changes in markers:

```
# >>> secret-protector begin
[shell_environment_policy]
inherit = "core"
include_only = [...]
exclude = [...]
# <<< secret-protector end
```

On each install: strip existing managed block, strip existing `[shell_environment_policy]` table, append fresh block. Keeps other config intact.

## Limitation

Codex does not expose Cursor-style hooks for prompt interception. Only env filtering is available.
