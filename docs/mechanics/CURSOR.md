# Cursor Hook Mechanics

How Cursor's lifecycle hooks work and how secret-protector integrates.

---

## Official References

- [Third Party Hooks | Cursor Docs](https://cursor.com/docs/agent/third-party-hooks)
- [Deep Dive into Cursor Hooks | Butler's Log](https://blog.gitbutler.com/cursor-hooks-deep-dive)

---

## Configuration Locations

| Location | Scope |
|----------|-------|
| `~/.cursor/hooks.json` | User (global) |
| `.cursor/hooks.json` | Project |
| `/etc/cursor/hooks.json` | Enterprise |
| `.cursor/hooks.local.json` | Project-local (gitignored) |

Hooks from all locations are merged; higher-priority hooks run first. Any hook can block lower-priority hooks.

---

## hooks.json Structure

```json
{
  "version": 1,
  "hooks": {
    "beforeSubmitPrompt": [
      { "type": "command", "command": "/path/to/script", "timeout": 10 }
    ],
    "beforeReadFile": [...],
    "beforeTabFileRead": [...],
    "beforeShellExecution": [...],
    "preToolUse": [...]
  }
}
```

- **type:** `"command"` (runs executable)
- **command:** Full command string; receives JSON on stdin, must output JSON on stdout
- **timeout:** Seconds (default 10)

---

## Events & Payloads

### beforeSubmitPrompt

**Fires:** When user submits a prompt, *before* the agent sends it to the model.

**Payload (stdin):**

```json
{
  "conversation_id": "uuid",
  "generation_id": "uuid",
  "prompt": "user's prompt text",
  "attachments": [{ "type": "file", "file_path": "path/to/file" }],
  "hook_event_name": "beforeSubmitPrompt",
  "workspace_roots": ["/path/to/project"]
}
```

**Response (stdout):** `continue` controls whether the prompt is sent.

```json
{ "continue": true }
```
```json
{ "continue": false, "user_message": "Blocked: reason here" }
```

- **Alternative:** Exit code 2 also blocks (Cursor treats it as deny regardless of stdout).
- **Note:** Cursor docs sometimes use camelCase `userMessage`; secret-protector uses `user_message`. Both appear to work; prefer snake_case for consistency with our hooks.

---

### beforeReadFile

**Fires:** Before the agent reads a file and sends its contents to the model.

**Payload (stdin):**

```json
{
  "conversation_id": "uuid",
  "generation_id": "uuid",
  "content": "file contents (sometimes pre-loaded)",
  "file_path": "path/to/file",
  "hook_event_name": "beforeReadFile",
  "workspace_roots": ["/path/to/project"]
}
```

**Response (stdout):** `permission` controls file read.

```json
{ "permission": "allow" }
```
```json
{ "permission": "deny", "user_message": "Blocked: reason here" }
```

---

### beforeTabFileRead

**Fires:** Before a tab/file is read (similar to beforeReadFile; may be IDE-specific).

**Payload/Response:** Same format as beforeReadFile.

---

### beforeShellExecution

**Fires:** Before a shell command runs.

**Payload (stdin):**

```json
{
  "conversation_id": "uuid",
  "generation_id": "uuid",
  "command": "git status",
  "cwd": "/path/to/cwd",
  "hook_event_name": "beforeShellExecution",
  "workspace_roots": ["/path/to/project"]
}
```

**Response (stdout):**

```json
{ "continue": true, "permission": "allow" }
```
```json
{ "continue": false, "permission": "deny", "userMessage": "absolutely not" }
```

**Note:** secret-protector has logic for this event in `hooks.ts` (`cursorDecision`) but the Cursor provider does *not* currently install it. Only `beforeSubmitPrompt`, `beforeReadFile`, `beforeTabFileRead` are registered in `src/providers/cursor.ts`.

---

### preToolUse

**Fires:** Before any tool (Read, Bash, etc.) executes. Mapped from Claude Code's `PreToolUse` when using third-party skills.

**Response:** Same format as beforeShellExecution (`permission`, `continue`, `user_message` / `userMessage`).

---

## secret-protector Integration

1. **Install:** `npx secret-protector install` upserts entries in `~/.cursor/hooks.json` for `beforeSubmitPrompt`, `beforeReadFile`, `beforeTabFileRead`.

2. **Command:** Each hook invokes:
   ```
   $HOME/.config/secret-protector/bin/secret-protector-hook cursor <event>
   ```

3. **Wrapper:** The hook wrapper runs `node dist/cli.js hook cursor <event>`, which:
   - Reads JSON from stdin
   - Calls `evaluateHook("cursor", event, payload, policy)`
   - Outputs decision JSON to stdout

4. **Idempotency:** Before appending, existing entries containing `secret-protector-hook cursor <event>` are removed. Marker format ensures we don't duplicate on reinstall.

5. **Policy:** Loaded via `loadEffectivePolicy(paths, projectDir)`; project dir comes from `--project` or cwd when running install. Hook runs with cwd = project; policy uses `.secretrc` from that directory or ancestors.

---

## Detection Mapping

| Event | Detector | What is checked |
|-------|----------|-----------------|
| beforeSubmitPrompt | `detectSecretLeak` | Env refs in `prompt`; sensitive paths in `attachments` |
| beforeReadFile | `detectSensitiveRead` | `file_path` against policy `files.globs` and `files.regex` |
| beforeTabFileRead | `detectSensitiveRead` | Same as beforeReadFile |
| beforeShellExecution | `detectSensitiveCommand` | `command` for env refs; paths in command |
| preToolUse | `detectSensitiveCommand` | Tool args for env refs and sensitive paths |

---

## Known Issues

- **sessionStart continue: false:** Some Cursor versions reportedly ignore `continue: false` for `sessionStart`; not used by secret-protector.
- **beforeSubmitPrompt output:** Early Cursor beta docs claimed beforeSubmitPrompt didn't respect output; current behavior accepts JSON block.
- **ENAMETOOLONG:** `preToolUse` can fail on Windows when `tool_input.content` is very large (full file content); consider streaming or temp files for large payloads.
