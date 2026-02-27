import { eprint } from "./io.js";
import { asList, getNested } from "./policy.js";
import {
  detectSecretLeak,
  detectSensitiveRead,
  detectSensitiveCommand,
} from "./detector.js";
import { loadSpec } from "./spec.js";

export type DecisionMode = "block" | "warn" | "log";

export function resolveMode(
  policy: Record<string, unknown>,
  provider: string,
  event: string
): DecisionMode {
  const p = provider.trim().toLowerCase();
  const ev = String(event);
  const raw =
    p === "cursor"
      ? getNested(policy, "cursor", "events", ev, "mode")
      : p === "opencode" && ev === "tool.execute.before"
        ? getNested(policy, "opencode", "tool_execute_before", "mode")
        : undefined;
  if (raw === "warn" || raw === "log") return raw;
  if (raw === "block") return "block";
  const defaultMode = getNested(policy, "detection", "default_mode");
  if (defaultMode === "warn" || defaultMode === "log") return defaultMode as DecisionMode;
  return "block";
}

export function isCursorEventEnabled(
  policy: Record<string, unknown>,
  event: string
): boolean {
  const raw = getNested(policy, "cursor", "events", event, "enabled");
  if (raw === false) return false;
  return true;
}

function getBypassTags(policy: Record<string, unknown>): {
  allowAll: string[];
  allowSecret: string[];
} {
  const bypass = getNested(policy, "bypass_tags") as Record<string, unknown> | undefined;
  const allowAllRaw = bypass?.allow_all != null ? asList(bypass.allow_all) : [];
  const allowSecretRaw = bypass?.allow_secret != null ? asList(bypass.allow_secret) : [];
  return {
    allowAll: allowAllRaw.length > 0 ? allowAllRaw : ["allow-all"],
    allowSecret: allowSecretRaw.length > 0 ? allowSecretRaw : ["allow-secret", "allow-pii"],
  };
}

function hasBypassTag(text: string, tags: string[]): boolean {
  if (typeof text !== "string") return false;
  const lower = text.toLowerCase();
  for (const tag of tags) {
    const needle = `[${tag}]`.toLowerCase();
    if (lower.includes(needle)) return true;
  }
  return false;
}

/** Gather user prompt text from multiple possible payload locations (Cursor/Claude variants). */
function getPromptTextForBypass(payload: unknown): string {
  if (typeof payload !== "object" || !payload) return "";
  const p = payload as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["prompt", "input", "text", "content"]) {
    const v = p[key];
    if (typeof v === "string" && v.trim()) parts.push(v);
  }
  const msgs = p.messages;
  if (Array.isArray(msgs) && msgs.length > 0) {
    const last = msgs[msgs.length - 1] as Record<string, unknown> | undefined;
    const content = last?.content;
    if (typeof content === "string" && content.trim()) parts.push(content);
  }
  return parts.join("\n");
}

export function cursorDecision(
  event: string,
  payload: unknown,
  policy: Record<string, unknown>
): Record<string, unknown> {
  if (event === "beforeSubmitPrompt") {
    if (!isCursorEventEnabled(policy, event)) return { continue: true };
    const bypassEnabled = getNested(policy, "bypass_tags_enabled") !== false;
    const promptText = getPromptTextForBypass(payload);

    if (bypassEnabled) {
      const { allowAll, allowSecret } = getBypassTags(policy);
      if (hasBypassTag(promptText, allowAll)) return { continue: true };
      if (hasBypassTag(promptText, allowSecret)) return { continue: true };
    }

    const reason = detectSecretLeak(payload, policy);
    if (reason) {
      const mode = resolveMode(policy, "cursor", event);
      const msg = `Blocked by secret-protector. ${reason}`;
      if (mode === "block") {
        return { continue: false, user_message: msg };
      }
      if (mode === "warn") {
        return { continue: true, user_message: msg };
      }
      eprint(msg);
      return { continue: true };
    }
    return { continue: true };
  }
  if (event === "beforeReadFile" || event === "beforeTabFileRead") {
    if (!isCursorEventEnabled(policy, event)) return { permission: "allow" };
    const reason = detectSensitiveRead(payload, policy);
    if (reason) {
      const mode = resolveMode(policy, "cursor", event);
      const msg = `Blocked by secret-protector. ${reason}`;
      if (mode === "block") {
        return { permission: "deny", user_message: msg };
      }
      if (mode === "warn") {
        return { permission: "allow", user_message: msg };
      }
      eprint(msg);
      return { permission: "allow" };
    }
    return { permission: "allow" };
  }
  if (event === "beforeShellExecution" || event === "preToolUse") {
    if (!isCursorEventEnabled(policy, event)) return { permission: "allow" };
    const reason = detectSensitiveCommand(payload, policy);
    if (reason) {
      const mode = resolveMode(policy, "cursor", event);
      const msg = `Blocked by secret-protector. ${reason}`;
      if (mode === "block") {
        return { permission: "deny", user_message: msg };
      }
      if (mode === "warn") {
        return { permission: "allow", user_message: msg };
      }
      eprint(msg);
      return { permission: "allow" };
    }
    return { permission: "allow" };
  }
  return {};
}

export function opencodeDecision(
  event: string,
  payload: unknown,
  policy: Record<string, unknown>
): Record<string, unknown> {
  if (event !== "tool.execute.before") {
    return { block: false };
  }
  let reason: string | null = null;
  const p = payload as Record<string, unknown>;
  const tool = p?.tool as Record<string, unknown> | undefined;
  let toolName = "";
  let toolArgs: Record<string, unknown> = {};
  if (tool && typeof tool === "object") {
    toolName = String(tool.name ?? "");
    const raw = tool.arguments;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      toolArgs = raw as Record<string, unknown>;
    }
  }
  if (toolName.toLowerCase() === "read") {
    reason = detectSensitiveRead(toolArgs, policy);
  }
  if (reason === null && ["bash", "shell", "exec", "command"].includes(toolName.toLowerCase())) {
    reason = detectSensitiveCommand(toolArgs, policy);
  }
  if (reason === null) {
    reason = detectSensitiveCommand(payload, policy);
  }
  if (reason) {
    const mode = resolveMode(policy, "opencode", event);
    const msg = `Blocked by secret-protector. ${reason}`;
    if (mode === "block") {
      return { block: true, user_message: msg };
    }
    if (mode === "warn") {
      return { block: false, user_message: msg };
    }
    eprint(msg);
    return { block: false };
  }
  return { block: false };
}

export function evaluateHook(
  provider: string,
  event: string,
  payload: unknown,
  policy: Record<string, unknown>
): Record<string, unknown> {
  const p = provider.trim().toLowerCase();
  const spec = loadSpec();
  const events = spec.hookEvents[p];
  if (!events || !events.includes(event)) return {};
  if (p === "cursor") return cursorDecision(event, payload, policy);
  if (p === "opencode") return opencodeDecision(event, payload, policy);
  return {};
}
