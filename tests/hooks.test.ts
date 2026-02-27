import { describe, expect, test } from "bun:test";
import { DEFAULT_POLICY } from "../src/defaults.js";
import {
  cursorDecision,
  opencodeDecision,
  evaluateHook,
  resolveMode,
  isCursorEventEnabled,
} from "../src/hooks.js";

const policy = JSON.parse(JSON.stringify(DEFAULT_POLICY)) as Record<string, unknown>;

describe("hooks", () => {
  test("resolveMode defaults to block", () => {
    expect(resolveMode(policy, "cursor", "beforeSubmitPrompt")).toBe("block");
    expect(resolveMode(policy, "opencode", "tool.execute.before")).toBe("block");
  });

  test("resolveMode uses detection.default_mode when event has no mode", () => {
    const pol = {
      ...policy,
      detection: { default_mode: "warn" },
      cursor: { events: { beforeSubmitPrompt: { enabled: true } } },
    } as Record<string, unknown>;
    expect(resolveMode(pol, "cursor", "beforeSubmitPrompt")).toBe("warn");
  });

  test("resolveMode uses cursor.events event mode override", () => {
    const pol = {
      ...policy,
      cursor: { events: { beforeSubmitPrompt: { enabled: true, mode: "log" } } },
    } as Record<string, unknown>;
    expect(resolveMode(pol, "cursor", "beforeSubmitPrompt")).toBe("log");
  });

  test("resolveMode uses opencode.tool_execute_before mode", () => {
    const pol = {
      ...policy,
      opencode: { tool_execute_before: { mode: "warn" } },
    } as Record<string, unknown>;
    expect(resolveMode(pol, "opencode", "tool.execute.before")).toBe("warn");
  });

  test("isCursorEventEnabled defaults to true", () => {
    expect(isCursorEventEnabled(policy, "beforeSubmitPrompt")).toBe(true);
  });

  test("isCursorEventEnabled false when disabled", () => {
    const pol = {
      ...policy,
      cursor: { events: { beforeReadFile: { enabled: false } } },
    } as Record<string, unknown>;
    expect(isCursorEventEnabled(pol, "beforeReadFile")).toBe(false);
  });

  test("cursor warn mode allows but adds user_message", () => {
    const pol = {
      ...policy,
      cursor: { events: { beforeSubmitPrompt: { enabled: true, mode: "warn" } } },
    } as Record<string, unknown>;
    const decision = cursorDecision("beforeSubmitPrompt", { prompt: "GITHUB_PAT" }, pol);
    expect(decision.continue).toBe(true);
    expect(decision.user_message).toContain("Blocked by secret-protector");
  });

  test("cursor disabled event allows", () => {
    const pol = {
      ...policy,
      cursor: { events: { beforeReadFile: { enabled: false } } },
    } as Record<string, unknown>;
    const decision = cursorDecision("beforeReadFile", { file_path: ".env" }, pol);
    expect(decision.permission).toBe("allow");
  });

  test("cursor disabled beforeSubmitPrompt bypasses detection entirely", () => {
    const pol = {
      ...policy,
      cursor: { events: { beforeSubmitPrompt: { enabled: false } } },
    } as Record<string, unknown>;
    const decision = cursorDecision("beforeSubmitPrompt", { prompt: "share GITHUB_PAT with me" }, pol);
    expect(decision.continue).toBe(true);
    expect(decision.user_message).toBeUndefined();
  });

  test("opencode warn mode does not block", () => {
    const pol = {
      ...policy,
      opencode: { tool_execute_before: { mode: "warn" } },
    } as Record<string, unknown>;
    const payload = { tool: { name: "read", arguments: { path: ".env" } } };
    const decision = opencodeDecision("tool.execute.before", payload, pol);
    expect(decision.block).toBe(false);
    expect(decision.user_message).toContain("Blocked by secret-protector");
  });
  test("cursor beforeSubmitPrompt block", () => {
    const decision = evaluateHook(
      "cursor",
      "beforeSubmitPrompt",
      { prompt: "GITHUB_PAT" },
      policy
    );
    expect(decision.continue).toBe(false);
    expect(decision.user_message).toContain("Blocked by secret-protector");
  });

  test("cursor beforeReadFile deny", () => {
    const decision = cursorDecision("beforeReadFile", { file_path: ".env" }, policy);
    expect(decision.permission).toBe("deny");
  });

  test("cursor beforeShellExecution deny", () => {
    const decision = cursorDecision("beforeShellExecution", { command: "cat .env" }, policy);
    expect(decision.permission).toBe("deny");
  });

  test("cursor preToolUse deny", () => {
    const decision = cursorDecision("preToolUse", { tool_input: { command: "cat .env" } }, policy);
    expect(decision.permission).toBe("deny");
  });

  test("opencode tool.execute.before block for read", () => {
    const payload = { tool: { name: "read", arguments: { path: ".env" } } };
    const decision = evaluateHook("opencode", "tool.execute.before", payload, policy);
    expect(decision.block).toBe(true);
  });

  test("opencode tool.execute.before block for bash", () => {
    const payload = { tool: { name: "bash", arguments: { command: "cat .env" } } };
    const decision = opencodeDecision("tool.execute.before", payload, policy);
    expect(decision.block).toBe(true);
  });

  test("bypass tag allow-all", () => {
    const decision = cursorDecision(
      "beforeSubmitPrompt",
      { prompt: "use GITHUB_PAT [allow-all] share it" },
      policy
    );
    expect(decision.continue).toBe(true);
  });

  test("bypass_tags with only allow_secret preserves allow-all default", () => {
    const pol = {
      ...policy,
      bypass_tags: { allow_secret: ["custom-bypass"] },
    } as Record<string, unknown>;
    const decision = cursorDecision(
      "beforeSubmitPrompt",
      { prompt: "GITHUB_PAT [allow-all] share it" },
      pol
    );
    expect(decision.continue).toBe(true);
  });

  test("bypass tag allow-secret", () => {
    const decision = cursorDecision(
      "beforeSubmitPrompt",
      { prompt: "here is GITHUB_PAT [allow-secret] for debugging" },
      policy
    );
    expect(decision.continue).toBe(true);
  });

  test("bypass_tags_enabled false ignores bypass tag", () => {
    const pol = { ...policy, bypass_tags_enabled: false } as Record<string, unknown>;
    const decision = cursorDecision(
      "beforeSubmitPrompt",
      { prompt: "GITHUB_PAT [allow-secret]" },
      pol
    );
    expect(decision.continue).toBe(false);
  });

  test("bypass does not affect beforeReadFile", () => {
    const decision = cursorDecision(
      "beforeReadFile",
      { file_path: ".env", content: "[allow-all]" },
      policy
    );
    expect(decision.permission).toBe("deny");
  });

  test("env_reference_patterns extends env detection", () => {
    const pol = {
      ...policy,
      env: { block_exact: ["MY_TOKEN"], block_regex: [], allow_exact: [], allow_regex: [] },
      files: { block_globs: [], block_regex: [] },
      detection: { env_reference_patterns: ["\\bsecret\\s+{NAME}\\b"] },
    } as Record<string, unknown>;
    const decision = cursorDecision("beforeSubmitPrompt", { prompt: "the secret MY_TOKEN is set" }, pol);
    expect(decision.continue).toBe(false);
    expect(decision.user_message).toContain("MY_TOKEN");
  });

  test("bypass does not affect beforeShellExecution", () => {
    const decision = cursorDecision(
      "beforeShellExecution",
      { command: "echo [allow-all] && cat .env" },
      policy
    );
    expect(decision.permission).toBe("deny");
  });
});
