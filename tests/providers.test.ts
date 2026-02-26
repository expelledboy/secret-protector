import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_POLICY } from "../src/defaults.js";
import { installRuntime, hookCommandFor } from "../src/install-runtime.js";
import { runtimePaths } from "../src/paths.js";
import { installConfig } from "../src/providers/codex.js";
import { installArtifacts } from "../src/providers/copilot.js";
import { upsertCursorHooks } from "../src/providers/cursor.js";
import { installPlugin } from "../src/providers/opencode.js";

const policy = JSON.parse(JSON.stringify(DEFAULT_POLICY)) as Record<string, unknown>;

describe("providers", () => {
  test("cursor upsert is idempotent", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-cur-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    try {
      const paths = runtimePaths(tmpHome);
      upsertCursorHooks(paths, (p, e) => hookCommandFor(paths, p, e));
      upsertCursorHooks(paths, (p, e) => hookCommandFor(paths, p, e));
      const data = JSON.parse(fs.readFileSync(paths.cursorHooksPath, "utf-8"));
      const events = ["beforeSubmitPrompt", "beforeReadFile", "beforeTabFileRead", "beforeShellExecution", "preToolUse"];
      for (const event of events) {
        expect(data.hooks[event].length).toBe(1);
      }
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("codex config contains managed policy", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-cdx-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(path.join(tmpHome, ".codex"), { recursive: true });
    try {
      const paths = runtimePaths(tmpHome);
      fs.writeFileSync(
        paths.codexConfigPath,
        '[shell_environment_policy]\ninherit = "all"\n\n[profile]\nname = "x"\n',
        "utf-8"
      );
      installConfig(paths, policy);
      const content = fs.readFileSync(paths.codexConfigPath, "utf-8");
      expect(content).toContain("# >>> secret-protector begin");
      expect(content).toContain('inherit = "core"');
      expect(content).toContain('[profile]\nname = "x"');
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("opencode plugin written", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-oc-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    try {
      const paths = runtimePaths(tmpHome);
      const pluginPath = installPlugin(paths);
      const content = fs.readFileSync(pluginPath, "utf-8");
      expect(content).toContain('"tool.execute.before"');
      expect(content).toContain("secret-protector-hook");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  test("copilot artifacts written", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-cop-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-copp-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    try {
      const paths = runtimePaths(tmpHome);
      const outputs = installArtifacts(paths, policy, tmpProject);
      expect(outputs.length).toBe(2);
      for (const output of outputs) {
        expect(fs.existsSync(output)).toBe(true);
      }
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test("install_runtime copies dist and creates hook wrapper", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-inst-${Date.now()}`);
    const tmpSrc = path.join(os.tmpdir(), `sp-src-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpSrc, { recursive: true });
    fs.writeFileSync(path.join(tmpSrc, "cli.js"), "#!/usr/bin/env node\nconsole.log('ok');\n", "utf-8");
    try {
      const paths = runtimePaths(tmpHome);
      installRuntime(paths, tmpSrc);
      expect(fs.existsSync(paths.globalDistPath)).toBe(true);
      expect(fs.existsSync(path.join(paths.globalDistPath, "cli.js"))).toBe(true);
      expect(fs.existsSync(paths.globalHookBinPath)).toBe(true);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpSrc, { recursive: true, force: true });
    }
  });
});
