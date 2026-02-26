import { getNested } from "./policy.js";
import {
  detectSecretLeak,
  detectSensitiveRead,
  detectSensitiveCommand,
} from "./detector.js";

function hasBypassTag(prompt: string, tag: string): boolean {
  if (typeof prompt !== "string") return false;
  const needle = `[${tag}]`.toLowerCase();
  return prompt.toLowerCase().includes(needle);
}

export function cursorDecision(
  event: string,
  payload: unknown,
  policy: Record<string, unknown>
): Record<string, unknown> {
  if (event === "beforeSubmitPrompt") {
    const bypassEnabled = getNested(policy, "bypass_tags_enabled") !== false;
    const prompt = typeof payload === "object" && payload && "prompt" in payload
      ? String((payload as Record<string, unknown>).prompt ?? "")
      : "";

    if (bypassEnabled) {
      if (hasBypassTag(prompt, "allow-all")) return { continue: true };
      if (hasBypassTag(prompt, "allow-secret") || hasBypassTag(prompt, "allow-pii")) return { continue: true };
    }

    const reason = detectSecretLeak(payload, policy);
    if (reason) {
      return {
        continue: false,
        user_message: `Blocked by secret-protector. ${reason}`,
      };
    }
    return { continue: true };
  }
  if (event === "beforeReadFile" || event === "beforeTabFileRead") {
    const reason = detectSensitiveRead(payload, policy);
    if (reason) {
      return {
        permission: "deny",
        user_message: `Blocked by secret-protector. ${reason}`,
      };
    }
    return { permission: "allow" };
  }
  if (event === "beforeShellExecution" || event === "preToolUse") {
    const reason = detectSensitiveCommand(payload, policy);
    if (reason) {
      return {
        permission: "deny",
        user_message: `Blocked by secret-protector. ${reason}`,
      };
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
    return {
      block: true,
      user_message: `Blocked by secret-protector. ${reason}`,
    };
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
  if (p === "cursor") return cursorDecision(event, payload, policy);
  if (p === "opencode") return opencodeDecision(event, payload, policy);
  return {};
}
