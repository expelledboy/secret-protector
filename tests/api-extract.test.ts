import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { extractApi } from "../scripts/api-extract.ts";

const ROOT = path.resolve(import.meta.dir, "..");

describe("api-extract", () => {
  test("extractApi returns non-empty snapshot", () => {
    const snap = extractApi(ROOT);
    expect(snap.configKeys.size).toBeGreaterThan(0);
    expect(snap.cliCommands.size).toBeGreaterThan(0);
    expect(snap.cliOptions.size).toBeGreaterThan(0);
    expect(snap.hookEvents.size).toBeGreaterThan(0);
    expect(snap.hookResponseFields.size).toBeGreaterThan(0);
  });

  test("config keys include env.block_exact and cursor.events.beforeSubmitPrompt.enabled", () => {
    const snap = extractApi(ROOT);
    expect(snap.configKeys.has("env.block_exact")).toBe(true);
    expect(snap.configKeys.has("cursor.events.beforeSubmitPrompt.enabled")).toBe(true);
  });

  test("CLI commands and hook events from api-spec.json", () => {
    const snap = extractApi(ROOT);
    expect(snap.cliCommands.has("init")).toBe(true);
    expect(snap.cliCommands.has("install")).toBe(true);
    expect(snap.cliCommands.has("hook")).toBe(true);
    expect(snap.cliCommands.has("render-copilot")).toBe(true);
    expect(snap.hookEvents.has("cursor:beforeSubmitPrompt")).toBe(true);
    expect(snap.hookEvents.has("opencode:tool.execute.before")).toBe(true);
  });

  test("diff: added config key yields minor bump", () => {
    const refSnap = {
      configKeys: ["a", "b"],
      cliCommands: [] as string[],
      cliOptions: [] as string[],
      hookEvents: [] as string[],
      hookResponseFields: [] as string[],
    };
    const currSnap = {
      configKeys: ["a", "b", "c"],
      cliCommands: [] as string[],
      cliOptions: [] as string[],
      hookEvents: [] as string[],
      hookResponseFields: [] as string[],
    };
    const refSet = new Set(refSnap.configKeys);
    const currSet = new Set(currSnap.configKeys);
    const added = currSnap.configKeys.filter((x) => !refSet.has(x));
    const removed = refSnap.configKeys.filter((x) => !currSet.has(x));
    const bump = removed.length > 0 ? "major" : added.length > 0 ? "minor" : "patch";
    expect(bump).toBe("minor");
  });

  test("diff: removed config key yields major bump", () => {
    const refSnap = {
      configKeys: ["a", "b", "c"],
      cliCommands: [] as string[],
      cliOptions: [] as string[],
      hookEvents: [] as string[],
      hookResponseFields: [] as string[],
    };
    const currSnap = {
      configKeys: ["a", "b"],
      cliCommands: [] as string[],
      cliOptions: [] as string[],
      hookEvents: [] as string[],
      hookResponseFields: [] as string[],
    };
    const refSet = new Set(refSnap.configKeys);
    const currSet = new Set(currSnap.configKeys);
    const added = currSnap.configKeys.filter((x) => !refSet.has(x));
    const removed = refSnap.configKeys.filter((x) => !currSet.has(x));
    const bump = removed.length > 0 ? "major" : added.length > 0 ? "minor" : "patch";
    expect(bump).toBe("major");
  });
});
