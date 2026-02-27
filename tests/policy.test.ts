import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runtimePaths } from "../src/paths.js";
import {
  findProjectConfig,
  getNested,
  loadEffectivePolicy,
  loadYamlDict,
  mergeValues,
  saveYamlDict,
} from "../src/policy.js";

describe("policy", () => {
  test("merge_values deduplicates lists", () => {
    const base = { arr: ["a", "b", { x: 1 }] };
    const override = { arr: ["b", "c", { x: 1 }] };
    const merged = mergeValues(base, override) as Record<string, unknown>;
    expect(merged.arr).toEqual(["a", "b", { x: 1 }, "c"]);
  });

  test("load_effective_policy merges global and project", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-policy-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-proj-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    try {
      const paths = runtimePaths(tmpHome);
      fs.mkdirSync(path.dirname(paths.globalConfigPath), { recursive: true });
      saveYamlDict(paths.globalConfigPath, {
        env: { block_exact: ["GLOBAL_TOKEN"] },
        providers: { copilot: false },
      });
      fs.writeFileSync(
        path.join(tmpProject, ".secretrc"),
        "env:\n  block_exact:\n    - PROJECT_TOKEN\nfiles:\n  block_globs:\n    - '**/*.local.env'\n",
        "utf-8"
      );
      const [policy, projectCfgPath] = loadEffectivePolicy(paths, tmpProject);
      expect(projectCfgPath).not.toBeNull();
      const envExact = new Set((policy.env as Record<string, string[]>).block_exact);
      expect(envExact.has("GLOBAL_TOKEN")).toBe(true);
      expect(envExact.has("PROJECT_TOKEN")).toBe(true);
      expect(envExact.has("GITHUB_PAT")).toBe(true);
      expect((policy.providers as Record<string, boolean>).copilot).toBe(false);
      expect((policy.files as Record<string, string[]>).block_globs).toContain("**/*.local.env");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test("loadYamlDict throws on invalid YAML", () => {
    const tmpDir = path.join(os.tmpdir(), `sp-yaml-inv-${Date.now()}`);
    const badFile = path.join(tmpDir, "bad.yaml");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(badFile, "foo: [unclosed\nbar: 1", "utf-8");
    try {
      expect(() => loadYamlDict(badFile)).toThrow();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("loadYamlDict throws on non-object root", () => {
    const tmpDir = path.join(os.tmpdir(), `sp-yaml-arr-${Date.now()}`);
    const arrFile = path.join(tmpDir, "arr.yaml");
    const scalarFile = path.join(tmpDir, "scalar.yaml");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(arrFile, "[1, 2, 3]", "utf-8");
    fs.writeFileSync(scalarFile, "42", "utf-8");
    try {
      expect(() => loadYamlDict(arrFile)).toThrow("Expected object");
      expect(() => loadYamlDict(scalarFile)).toThrow("Expected object");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("findProjectConfig walks up to find .secretrc", () => {
    const tmpDir = path.join(os.tmpdir(), `sp-walk-${Date.now()}`);
    const parent = path.join(tmpDir, "parent");
    const grandchild = path.join(parent, "child", "grandchild");
    fs.mkdirSync(grandchild, { recursive: true });
    fs.writeFileSync(path.join(parent, ".secretrc"), "env:\n  block_exact: [WALKUP]\n", "utf-8");
    try {
      const found = findProjectConfig(grandchild);
      expect(found).toBe(path.join(parent, ".secretrc"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("loadEffectivePolicy uses ancestor .secretrc when project dir has none", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-ancestor-${Date.now()}`);
    const parent = path.join(os.tmpdir(), `sp-ancestor-p-${Date.now()}`);
    const child = path.join(parent, "child");
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(child, { recursive: true });
    fs.writeFileSync(path.join(parent, ".secretrc"), "env:\n  block_exact: [ANCESTOR_TOKEN]\n", "utf-8");
    const paths = runtimePaths(tmpHome);
    fs.mkdirSync(path.dirname(paths.globalConfigPath), { recursive: true });
    saveYamlDict(paths.globalConfigPath, { version: 1, env: { block_exact: [] }, files: { block_globs: [] } });
    try {
      const [policy, projectCfgPath] = loadEffectivePolicy(paths, child);
      expect(projectCfgPath).toBe(path.join(parent, ".secretrc"));
      const envExact = new Set((policy.env as Record<string, string[]>).block_exact);
      expect(envExact.has("ANCESTOR_TOKEN")).toBe(true);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  test("loadEffectivePolicy merges detection and cursor sections from project .secretrc", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-det-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-det-proj-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    const paths = runtimePaths(tmpHome);
    fs.mkdirSync(path.dirname(paths.globalConfigPath), { recursive: true });
    saveYamlDict(paths.globalConfigPath, { version: 1, env: { block_exact: [] }, files: { block_globs: [] } });
    fs.writeFileSync(
      path.join(tmpProject, ".secretrc"),
      "detection:\n  default_mode: warn\n  path_like_keys:\n    - fileUri\ncursor:\n  events:\n    beforeReadFile:\n      enabled: false\n",
      "utf-8"
    );
    try {
      const [policy] = loadEffectivePolicy(paths, tmpProject);
      expect(getNested(policy, "detection", "default_mode")).toBe("warn");
      expect((getNested(policy, "detection", "path_like_keys") as string[])).toContain("fileUri");
      expect(getNested(policy, "cursor", "events", "beforeReadFile", "enabled")).toBe(false);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });

  test("loadEffectivePolicy merges allow_globs from project .secretrc", () => {
    const tmpHome = path.join(os.tmpdir(), `sp-allow-${Date.now()}`);
    const tmpProject = path.join(os.tmpdir(), `sp-allow-proj-${Date.now()}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpProject, { recursive: true });
    const paths = runtimePaths(tmpHome);
    fs.mkdirSync(path.dirname(paths.globalConfigPath), { recursive: true });
    saveYamlDict(paths.globalConfigPath, { version: 1, env: { block_exact: [] }, files: { block_globs: [".env"], allow_globs: [".env.example"] } });
    fs.writeFileSync(
      path.join(tmpProject, ".secretrc"),
      "files:\n  allow_globs:\n    - 'config/local.env.example'\n",
      "utf-8"
    );
    try {
      const [policy] = loadEffectivePolicy(paths, tmpProject);
      const allowGlobs = (policy.files as Record<string, string[]>).allow_globs ?? [];
      expect(allowGlobs).toContain(".env.example");
      expect(allowGlobs).toContain("config/local.env.example");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });
});
