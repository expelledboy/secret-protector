import { getNested } from "../policy.js";
import { readJsonDict, writeJsonDict } from "../io.js";
import type { RuntimePaths } from "../paths.js";

const EVENTS = [
  "beforeSubmitPrompt",
  "beforeReadFile",
  "beforeTabFileRead",
  "beforeShellExecution",
  "preToolUse",
] as const;

function eventsToInstall(policy: Record<string, unknown>): readonly string[] {
  const eventsObj = getNested(policy, "cursor", "events") as Record<string, unknown> | undefined;
  if (!eventsObj || typeof eventsObj !== "object") {
    return EVENTS;
  }
  const out: string[] = [];
  for (const ev of EVENTS) {
    const cfg = eventsObj[ev] as Record<string, unknown> | undefined;
    const explicitlyDisabled = cfg && typeof cfg === "object" && cfg.enabled === false;
    if (!explicitlyDisabled) out.push(ev);
  }
  return out;
}

function timeoutSeconds(policy: Record<string, unknown>): number {
  const raw = getNested(policy, "cursor", "timeout_seconds");
  if (typeof raw === "number" && raw > 0) return Math.floor(raw);
  return 10;
}

export function upsertCursorHooks(
  paths: RuntimePaths,
  policy: Record<string, unknown>,
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

  const events = eventsToInstall(policy);
  const timeout = timeoutSeconds(policy);
  const markerPrefix = "secret-protector-hook cursor ";

  for (const event of EVENTS) {
    const current = hooksObj[event];
    const arr = Array.isArray(current) ? [...current] : [];
    const filtered = arr.filter((item) => {
      if (typeof item !== "object" || item === null) return true;
      const cmd = (item as Record<string, unknown>).command;
      return !String(cmd ?? "").includes(markerPrefix + event);
    });

    if (events.includes(event)) {
      filtered.push({
        type: "command",
        command: hookCommandFactory("cursor", event),
        timeout,
      });
    }
    hooksObj[event] = filtered;
  }

  writeJsonDict(paths.cursorHooksPath, data);
  return paths.cursorHooksPath;
}
