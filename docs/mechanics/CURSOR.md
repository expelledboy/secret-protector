# Cursor Hook Mechanics

## Official References

- [Third Party Hooks | Cursor Docs](https://cursor.com/docs/agent/third-party-hooks)
- [Deep Dive into Cursor Hooks | Butler's Log](https://blog.gitbutler.com/cursor-hooks-deep-dive)

## Configuration

**Locations:** `~/.cursor/hooks.json`, `.cursor/hooks.json` (project), `/etc/cursor/hooks.json` (enterprise)

**Structure:**

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [{ "type": "command", "command": "...", "timeout": 10 }],
    "beforeReadFile": [...],
    "beforeTabFileRead": [...],
    "beforeShellExecution": [...],
    "preToolUse": [...]
  }
}
```

## Events

| Event | Fires | Response |
|-------|-------|----------|
| `beforeSubmitPrompt` | User submits prompt, before model | `{ continue: true }` or `{ continue: false, user_message }` |
| `beforeReadFile` | Before agent reads file | `{ permission: "allow" }` or `{ permission: "deny", user_message }` |
| `beforeTabFileRead` | Before tab file read | Same as beforeReadFile |
| `beforeShellExecution` | Before shell command | Same permission format |
| `preToolUse` | Before tool (Read, Bash, etc.) | Same permission format |

## Payload (stdin)

Example `beforeSubmitPrompt`:

```json
{
  "conversation_id": "...",
  "generation_id": "...",
  "prompt": "do something",
  "attachments": [...],
  "hook_event_name": "beforeSubmitPrompt",
  "workspace_roots": ["/path/to/project"]
}
```

Example `beforeReadFile`:

```json
{
  "conversation_id": "...",
  "generation_id": "...",
  "content": "...",
  "file_path": "path/to/file",
  "hook_event_name": "beforeReadFile",
  "workspace_roots": [...]
}
```

Example `beforeShellExecution`:

```json
{
  "conversation_id": "...",
  "generation_id": "...",
  "command": "git status",
  "cwd": "",
  "hook_event_name": "beforeShellExecution",
  "workspace_roots": [...]
}
```

## Blocking

- Exit code 2 also blocks (alternative to JSON)
- Return `permission: "deny"` or `continue: false` with `user_message` for user feedback
