import { describe, expect, test } from "bun:test";
import { DEFAULT_POLICY } from "../src/defaults.js";
import {
  detectSecretLeak,
  detectSensitiveRead,
  detectSensitiveCommand,
  extractPathsFromCommand,
} from "../src/detector.js";

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

  test("extractPathsFromCommand", () => {
    expect(extractPathsFromCommand("cat .env")).toEqual([".env"]);
    expect(extractPathsFromCommand("grep x .env.local")).toContain(".env.local");
    expect(extractPathsFromCommand("head -n 1 .env")).toContain(".env");
    expect(extractPathsFromCommand("rg pattern -- .env")).toContain(".env");
    expect(extractPathsFromCommand('cat "file with spaces"')).toContain("file with spaces");
    expect(extractPathsFromCommand("echo [allow-all] && cat .env")).toContain(".env");
    expect(extractPathsFromCommand("")).toEqual([]);
    expect(extractPathsFromCommand("   ")).toEqual([]);
  });

  test("detectSensitiveCommand with command string (Cursor shape)", () => {
    const reason = detectSensitiveCommand({ command: "cat .env" }, policy);
    expect(reason).not.toBeNull();
    expect(reason).toContain("sensitive file path pattern");
  });

  test("detectSensitiveCommand with OpenCode bash shape", () => {
    const payload = { tool: { name: "bash", arguments: { command: "cat .env" } } };
    const reason = detectSensitiveCommand(payload, policy);
    expect(reason).not.toBeNull();
  });

  test("detectSensitiveCommand allows non-sensitive path", () => {
    const reason = detectSensitiveCommand({ command: "cat README.md" }, policy);
    expect(reason).toBeNull();
  });
});
