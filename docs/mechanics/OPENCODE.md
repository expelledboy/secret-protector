# OpenCode Plugin Mechanics

## Official References

- [Plugins | OpenCode](https://opencode.ai/docs/plugins/)
- [.env protection example](https://opencode.ai/docs/plugins/) (in Examples section)

## Plugin Directories

- **Global:** `~/.config/opencode/plugins/` (use plural per docs)
- **Project:** `.opencode/plugins/`

Note: Some examples use `plugin` (singular); official docs specify `plugins` (plural).

## Event: tool.execute.before

Fires before a tool (read, bash, etc.) executes.

**Input shape:** `{ tool: { name: string, arguments: object }, ... }`

**Blocking:** Throw an Error. The plugin can call an external process (e.g. secret-protector hook) and throw if `block: true`.

**Example:**

```javascript
"tool.execute.before": async (input, output) => {
  if (input.tool === "read" && output.args.filePath?.includes(".env")) {
    throw new Error("Do not read .env files");
  }
}
```

## Plugin Format

ES module exporting a function that returns hooks:

```javascript
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => { ... }
  }
}
```

## secret-protector Integration

Plugin spawns `secret-protector-hook opencode tool.execute.before`, sends payload via stdin, reads JSON from stdout. If `block: true`, throws with `user_message`.
