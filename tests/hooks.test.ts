import { describe, expect, test } from "bun:test";
import { DEFAULT_POLICY } from "../src/defaults.js";
import { cursorDecision, opencodeDecision, evaluateHook } from "../src/hooks.js";

const policy = JSON.parse(JSON.stringify(DEFAULT_POLICY)) as Record<string, unknown>;

describe("hooks", () => {
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

  test("bypass does not affect beforeShellExecution", () => {
    const decision = cursorDecision(
      "beforeShellExecution",
      { command: "echo [allow-all] && cat .env" },
      policy
    );
    expect(decision.permission).toBe("deny");
  });
});
