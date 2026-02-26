import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runtimePaths } from "../src/paths.js";
import { loadEffectivePolicy, mergeValues, saveYamlDict } from "../src/policy.js";

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
        env: { exact: ["GLOBAL_TOKEN"] },
        providers: { copilot: false },
      });
      fs.writeFileSync(
        path.join(tmpProject, ".secretrc"),
        "env:\n  exact:\n    - PROJECT_TOKEN\nfiles:\n  globs:\n    - '**/*.local.env'\n",
        "utf-8"
      );
      const [policy, projectCfgPath] = loadEffectivePolicy(paths, tmpProject);
      expect(projectCfgPath).not.toBeNull();
      const envExact = new Set((policy.env as Record<string, string[]>).exact);
      expect(envExact.has("GLOBAL_TOKEN")).toBe(true);
      expect(envExact.has("PROJECT_TOKEN")).toBe(true);
      expect(envExact.has("GITHUB_PAT")).toBe(true);
      expect((policy.providers as Record<string, boolean>).copilot).toBe(false);
      expect((policy.files as Record<string, string[]>).globs).toContain("**/*.local.env");
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  });
});
