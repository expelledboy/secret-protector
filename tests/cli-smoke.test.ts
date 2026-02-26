import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dir, "..");
const ENTRYPOINT = path.join(ROOT, "dist", "cli.js");

function runCommand(
  argv: string[],
  opts: { cwd?: string; env?: Record<string, string>; stdin?: string } = {}
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("node", [ENTRYPOINT, ...argv], {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...opts.env },
    input: opts.stdin,
    encoding: "utf-8",
    timeout: 20000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? -1,
  };
}

describe("cli smoke", () => {
  test("entrypoint help", () => {
    const result = runCommand([]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("install");
  });

  test("init install and hook flow", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-smoke-home-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-smoke-proj-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    fs.writeFileSync(
      path.join(tmpProject, ".secretrc"),
      "env:\n  exact:\n    - PROJECT_SECRET_TOKEN\n",
      "utf-8"
    );
    const env = { ...process.env, HOME: tmpHome };
    try {
      const initResult = runCommand(["init"], { env });
      expect(initResult.exitCode).toBe(0);

      const installResult = runCommand(["install", "--project", tmpProject], { env });
      expect(installResult.exitCode).toBe(0);

      expect(fs.existsSync(path.join(tmpHome, ".config", "secret-protector", "config.yaml"))).toBe(true);
      expect(fs.existsSync(path.join(tmpHome, ".cursor", "hooks.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpHome, ".config", "opencode", "plugins", "secret-protector.js"))).toBe(true);
      expect(fs.existsSync(path.join(tmpHome, ".codex", "config.toml"))).toBe(true);
      expect(fs.existsSync(path.join(tmpHome, ".config", "secret-protector", "bin", "secret-protector-hook"))).toBe(true);
      expect(fs.existsSync(path.join(tmpProject, ".github", "copilot-content-exclusions.txt"))).toBe(true);

      const hookResult = runCommand(
        ["hook", "cursor", "beforeSubmitPrompt"],
        { cwd: tmpProject, env, stdin: '{"prompt":"share GITHUB_PAT"}' }
      );
      expect(hookResult.exitCode).toBe(0);
      const decision = JSON.parse(hookResult.stdout);
      expect(decision.continue).toBe(false);
      expect(decision.user_message).toContain("Blocked by secret-protector");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });
});
