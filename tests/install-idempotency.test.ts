import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dir, "..");
const ENTRYPOINT = path.join(ROOT, "dist", "cli.js");

function runCommand(
  argv: string[],
  opts: { env?: Record<string, string>; cwd?: string } = {}
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("node", [ENTRYPOINT, ...argv], {
    cwd: opts.cwd ?? ROOT,
    env: { ...process.env, ...opts.env },
    encoding: "utf-8",
    timeout: 20000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? -1,
  };
}

describe("install idempotency", () => {
  test("install twice yields no duplicate hook entries", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-idem-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-idemp-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["init"], { env });
      runCommand(["install", "--project", tmpProject], { env });
      runCommand(["install", "--project", tmpProject], { env });
      const hooksPath = path.join(tmpHome, ".cursor", "hooks.json");
      const data = JSON.parse(fs.readFileSync(hooksPath, "utf-8"));
      const events = ["beforeSubmitPrompt", "beforeReadFile", "beforeTabFileRead", "beforeShellExecution", "preToolUse"];
      for (const event of events) {
        expect(data.hooks[event].length).toBe(1);
      }
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test("install preserves manual hook after reinstall", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-manual-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-manp-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["init"], { env });
      runCommand(["install", "--project", tmpProject], { env });
      const hooksPath = path.join(tmpHome, ".cursor", "hooks.json");
      let data = JSON.parse(fs.readFileSync(hooksPath, "utf-8"));
      data.hooks.beforeSubmitPrompt.push({
        type: "command",
        command: "/usr/bin/echo manual-hook",
        timeout: 5,
      });
      fs.writeFileSync(hooksPath, JSON.stringify(data, null, 2));
      runCommand(["install", "--project", tmpProject], { env });
      data = JSON.parse(fs.readFileSync(hooksPath, "utf-8"));
      const beforeSubmit = data.hooks.beforeSubmitPrompt;
      expect(beforeSubmit.length).toBe(2);
      const manual = beforeSubmit.find((h: { command?: string }) => String(h?.command ?? "").includes("manual-hook"));
      expect(manual).toBeDefined();
      const sp = beforeSubmit.filter((h: { command?: string }) => String(h?.command ?? "").includes("secret-protector-hook"));
      expect(sp.length).toBe(1);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });
});
