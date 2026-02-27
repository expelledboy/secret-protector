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
  test("init when config exists exits with error", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-init-exists-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["init"], { env });
      const result = runCommand(["init"], { env });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Config already exists");
      expect(result.stderr).toContain("Use --force");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("init --force overwrites existing config", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-init-force-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    const configPath = path.join(tmpHome, ".config", "secret-protector", "config.yaml");
    try {
      runCommand(["init"], { env });
      fs.writeFileSync(configPath, "version: 1\nenv:\n  block_exact: [CUSTOM_ONLY]\n", "utf-8");
      runCommand(["init", "--force"], { env });
      const content = fs.readFileSync(configPath, "utf-8");
      expect(content).toContain("GITHUB_PAT");
      expect(content).not.toContain("CUSTOM_ONLY");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

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
      "env:\n  block_exact:\n    - PROJECT_SECRET_TOKEN\n",
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

  test("hook with warn mode allows prompt but includes user_message", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-warn-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-warn-proj-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    fs.writeFileSync(
      path.join(tmpProject, ".secretrc"),
      "detection:\n  default_mode: warn\ncursor:\n  events:\n    beforeSubmitPrompt:\n      enabled: true\n      mode: warn\n",
      "utf-8"
    );
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["init"], { env });
      runCommand(["install", "--project", tmpProject], { env });
      const result = runCommand(
        ["hook", "cursor", "beforeSubmitPrompt"],
        { cwd: tmpProject, env, stdin: '{"prompt":"use GITHUB_PAT for auth"}' }
      );
      expect(result.exitCode).toBe(0);
      const decision = JSON.parse(result.stdout);
      expect(decision.continue).toBe(true);
      expect(decision.user_message).toContain("Blocked by secret-protector");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test("hook with invalid JSON on stdin exits with error", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-hook-json-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-hook-proj-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["init"], { env });
      runCommand(["install", "--project", tmpProject], { env });
      const result = runCommand(
        ["hook", "cursor", "beforeSubmitPrompt"],
        { cwd: tmpProject, env, stdin: "{invalid json" }
      );
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("Invalid JSON");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test("install creates config when missing", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-no-init-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-no-init-proj-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    try {
      const result = runCommand(["install", "--project", tmpProject], { env });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(path.join(tmpHome, ".config", "secret-protector", "config.yaml"))).toBe(true);
      expect(fs.existsSync(path.join(tmpHome, ".cursor", "hooks.json"))).toBe(true);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test("install --dry-run creates no files", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-dry-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    try {
      const result = runCommand(["install", "--dry-run"], { env });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Would");
      expect(fs.existsSync(path.join(tmpHome, ".cursor", "hooks.json"))).toBe(false);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("install --only cursor", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-only-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-onlyp-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["init"], { env });
      runCommand(["install", "--project", tmpProject, "--only", "cursor"], { env });
      expect(fs.existsSync(path.join(tmpHome, ".cursor", "hooks.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpHome, ".config", "opencode", "plugins", "secret-protector.js"))).toBe(false);
      expect(fs.existsSync(path.join(tmpHome, ".codex", "config.toml"))).toBe(false);
      expect(fs.existsSync(path.join(tmpProject, ".github", "copilot-content-exclusions.txt"))).toBe(false);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test("install skips disabled provider", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-disabled-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-disabled-proj-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    fs.mkdirSync(path.join(tmpHome, ".config", "secret-protector"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".config", "secret-protector", "config.yaml"),
      "version: 1\nproviders:\n  cursor: false\n  opencode: true\n  codex: true\n  copilot: true\nenv:\n  block_exact: [GITHUB_PAT]\nfiles:\n  block_globs: [.env]\n",
      "utf-8"
    );
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["install", "--project", tmpProject], { env });
      expect(fs.existsSync(path.join(tmpHome, ".config", "opencode", "plugins", "secret-protector.js"))).toBe(true);
      expect(fs.existsSync(path.join(tmpHome, ".codex", "config.toml"))).toBe(true);
      expect(fs.existsSync(path.join(tmpHome, ".cursor", "hooks.json"))).toBe(false);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test("install --only invalid exits with error", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-inv-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["init"], { env });
      const result = runCommand(["install", "--only", "invalid"], { env });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown provider");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("render-copilot --format=github", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-fmt-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["init"], { env });
      const result = runCommand(["render-copilot", "--format", "github"], { env });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('- ".env"');
      expect(result.stdout).not.toContain("[glob_patterns]");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("render-copilot --output writes to file", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-out-${Date.now()}`);
    const outFile = path.join(os.tmpdir(), `sp-render-out-${Date.now()}.txt`);
    fs.mkdirSync(tmpHome, { recursive: true });
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["init"], { env });
      const result = runCommand(["render-copilot", "--output", outFile], { env });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(outFile)).toBe(true);
      const content = fs.readFileSync(outFile, "utf-8");
      expect(content).toContain("[glob_patterns]");
      expect(content).toContain(".env");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  });

  test("render-copilot --project uses project policy", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-proj-render-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-proj-render-proj-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    fs.writeFileSync(
      path.join(tmpProject, ".secretrc"),
      "files:\n  block_globs:\n    - '**/custom-secrets.json'\n",
      "utf-8"
    );
    const env = { ...process.env, HOME: tmpHome };
    try {
      runCommand(["init"], { env });
      const result = runCommand(["render-copilot", "--project", tmpProject], { env });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("custom-secrets.json");
      expect(result.stdout).toContain(".env");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });
});
