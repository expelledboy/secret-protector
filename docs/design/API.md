# API

## CLI

### Entry

```
secret-protector [command] [options]
```

### Commands

| Command | Args | Options | Exit |
|---------|------|---------|------|
| `init` | - | `--force` | 0 success, 1 if exists and no --force |
| `install` | - | `--project <path>` | 0 success, 1 error |
| `hook` | `<provider> <event>` | - | 0 success, 1 error, 2 invalid stdin |
| `render-copilot` | - | `--project <path>`, `--output <path>` | 0 success |

### hook: stdin/stdout

**Stdin:** JSON payload. Empty input → `{}`.

**Stdout:** Decision JSON. Must be valid JSON, single object.

**Cursor events:**

- `beforeSubmitPrompt`: `{ continue: true }` or `{ continue: false, user_message: string }`
- `beforeReadFile` / `beforeTabFileRead`: `{ permission: "allow" }` or `{ permission: "deny", user_message: string }`
- `beforeShellExecution` / `preToolUse`: same as read

**OpenCode `tool.execute.before`:**

- Allow: `{ block: false }`
- Block: `{ block: true, user_message: string }`

**Exit code 2:** Invalid JSON on stdin.
