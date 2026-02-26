import { describe, expect, test } from "bun:test";
import { DEFAULT_POLICY } from "../src/defaults.js";
import { detectSecretLeak, detectSensitiveRead } from "../src/detector.js";
import { evaluateHook } from "../src/hooks.js";

const policy = JSON.parse(JSON.stringify(DEFAULT_POLICY)) as Record<string, unknown>;

describe("detector", () => {
  test("detect_secret_leak env", () => {
    const reason = detectSecretLeak({ prompt: "use GITHUB_PAT for this" }, policy);
    expect(reason).not.toBeNull();
    expect(reason).toContain("GITHUB_PAT");
  });

  test("detect_secret_leak file pattern", () => {
    const reason = detectSecretLeak({ path: ".env.local" }, policy);
    expect(reason).not.toBeNull();
    expect(reason).toContain("sensitive file path pattern");
  });

  test("detect_sensitive_read blocks env file", () => {
    const reason = detectSensitiveRead({ filePath: "secrets/.env" }, policy);
    expect(reason).not.toBeNull();
  });
});

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

  test("opencode tool.execute.before block", () => {
    const payload = { tool: { name: "read", arguments: { path: ".env" } } };
    const decision = evaluateHook("opencode", "tool.execute.before", payload, policy);
    expect(decision.block).toBe(true);
  });
});
