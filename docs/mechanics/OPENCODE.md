# OpenCode Plugin Mechanics

How OpenCode plugins work and how secret-protector integrates.

---

## Official References

- [Plugins | OpenCode](https://opencode.ai/docs/plugins/)
- [.env protection example](https://opencode.ai/docs/plugins/) (in Examples section)

---

## Plugin Directories

| Location | Scope |
|----------|-------|
| `~/.config/opencode/plugins/` | Global (use **plural** per official docs) |
| `.opencode/plugins/` | Project-level |

Files in these directories are loaded automatically at startup.

**Load order:** Project plugins → Global plugins → Project config → Global config.

---

## Plugin Export Format

OpenCode expects plugins to export **async functions** that receive a context object and return a hooks object:

```javascript
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => { ... },
    "tool.execute.after": async (input, output) => { ... }
  }
}
```

**Context:** `$` (Bun shell), `client` (OpenCode SDK), `worktree`, `directory`, `project`.

**secret-protector plugin:** Exports `export default async () => SecretProtector`, where `SecretProtector` is an object with `tool.execute.before`. OpenCode requires the async function format.

---

## Event: tool.execute.before

**Fires:** Before any tool (read, bash, shell, etc.) executes.

**Signature:** `async (input, output) => ...`

- **input:** `{ tool: { name: string, arguments: object }, ... }` — tool name and args as passed by the agent
- **output:** Mutable; can modify `output.args` to change what the tool receives (e.g. path rewriting for redaction)

**Blocking:** Throw an `Error`. The thrown message is shown to the user. OpenCode does not use a decision object like Cursor.

**OpenCode tool names:** `read`, `bash`, `shell`, `exec`, `command` (case may vary).

---

## secret-protector Integration

1. **Install path:** `~/.config/opencode/plugins/secret-protector.js` (plural `plugins` per `src/paths.ts`).

2. **Plugin content:** The plugin spawns a subprocess:
   ```
   $HOME/.config/secret-protector/bin/secret-protector-hook opencode tool.execute.before
   ```
   Or uses `SECRET_PROTECTOR_HOOK_CMD` if set.

3. **Flow:**
   - Plugin receives `(input, output)` — we use `input` (full payload) for detection
   - Plugin runs `spawnSync(hook, ["opencode", "tool.execute.before"], { input: JSON.stringify(input) })`
   - Hook (secret-protector CLI) returns JSON: `{ block: true, user_message: "..." }` or `{ block: false }`
   - If `block: true`, plugin throws `new Error(decision.user_message)`

4. **Detection logic** (`opencodeDecision` in `hooks.ts`):
   - For `read` tool: `detectSensitiveRead(toolArgs, policy)` — check `path`, `filePath`, etc.
   - For `bash`/`shell`/`exec`/`command`: `detectSensitiveCommand(toolArgs, policy)` — check `command`, env refs, paths
   - Fallback: `detectSensitiveCommand(payload, policy)` on full payload

5. **Input shape:** OpenCode may pass `input.tool.arguments` or `output.args`; we read from `tool.arguments` in the payload. Path-like keys: `path`, `filePath`, `file_path`, etc.

---

## Comparison: envsitter-guard

[boxpositron/envsitter-guard](https://github.com/boxpositron/envsitter-guard) is an alternative OpenCode plugin that:

- Blocks `read`, `edit`, `write`, `patch`, `multiedit` on `.env*` paths only
- Provides safe tools (`envsitter_keys`, `envsitter_match`, etc.) for inspecting keys without values
- Uses `output.args.filePath` in the `tool.execute.before` handler

secret-protector blocks more broadly (policy-driven patterns, env refs in commands) but does not provide safe-tool alternatives. Consider envsitter-guard for OpenCode-only, .env-focused use cases.

---

## Node.js Requirement

The plugin uses `spawnSync` from `node:child_process`. OpenCode runs on Bun, which provides Node-compatible APIs. The hook binary runs `node dist/cli.js` (from the installed runtime) so Node is required on the system for the subprocess.
