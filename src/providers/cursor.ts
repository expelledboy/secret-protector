import { readJsonDict, writeJsonDict } from "../io.js";
import type { RuntimePaths } from "../paths.js";

const EVENTS = [
  "beforeSubmitPrompt",
  "beforeReadFile",
  "beforeTabFileRead",
] as const;

export function upsertCursorHooks(
  paths: RuntimePaths,
  hookCommandFactory: (provider: string, event: string) => string
): string {
  let data: Record<string, unknown>;
  try {
    data = readJsonDict(paths.cursorHooksPath);
  } catch {
    data = {};
  }
  if (!data || typeof data !== "object") {
    data = { version: 1, hooks: {} };
  }
  const version = data.version;
  if (typeof version !== "number" || version < 1) {
    data.version = 1;
  }
  let hooks = data.hooks;
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
    hooks = {};
  }
  data.hooks = hooks as Record<string, unknown[]>;
  const hooksObj = data.hooks as Record<string, unknown[]>;

  for (const event of EVENTS) {
    const command = hookCommandFactory("cursor", event);
    const entry = {
      type: "command",
      command,
      timeout: 10,
    };
    let current = hooksObj[event];
    if (!Array.isArray(current)) current = [];
    const marker = `secret-protector-hook cursor ${event}`;
    const filtered = current.filter((item) => {
      if (typeof item !== "object" || item === null) return true;
      const cmd = (item as Record<string, unknown>).command;
      return !String(cmd ?? "").includes(marker);
    });
    filtered.push(entry);
    hooksObj[event] = filtered;
  }

  writeJsonDict(paths.cursorHooksPath, data);
  return paths.cursorHooksPath;
}
