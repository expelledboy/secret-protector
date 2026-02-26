import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "yaml";
import { DEFAULT_POLICY } from "./defaults.js";
import { writeText } from "./io.js";
import type { RuntimePaths } from "./paths.js";

export function orderedUnique(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const value of values) {
    const key =
      typeof value === "object" && value !== null && !Array.isArray(value)
        ? JSON.stringify(value, Object.keys(value as object).sort())
        : JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function mergeValues(base: unknown, override: unknown): unknown {
  if (
    typeof base === "object" &&
    base !== null &&
    !Array.isArray(base) &&
    typeof override === "object" &&
    override !== null &&
    !Array.isArray(override)
  ) {
    const result = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      if (key in result) {
        (result as Record<string, unknown>)[key] = mergeValues(
          (result as Record<string, unknown>)[key],
          value
        );
      } else {
        (result as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(value));
      }
    }
    return result;
  }
  if (Array.isArray(base) && Array.isArray(override)) {
    return orderedUnique([...base, ...override]);
  }
  return JSON.parse(JSON.stringify(override));
}

export function asList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter((v) => v != null).map((v) => String(v));
  }
  return [String(value)];
}

export function getNested(
  policy: Record<string, unknown>,
  ...pathSegments: string[]
): unknown {
  let cur: unknown = policy;
  for (const key of pathSegments) {
    if (typeof cur !== "object" || cur === null || !(key in (cur as object))) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function findProjectConfig(startDir?: string): string | null {
  const current = path.resolve(startDir ?? process.cwd());
  let dir = current;
  for (;;) {
    const candidate = path.join(dir, ".secretrc");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadYamlDict(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  const raw = yaml.parse(fs.readFileSync(filePath, "utf-8"));
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Expected object in ${filePath}, got ${typeof raw}`);
  }
  return raw as Record<string, unknown>;
}

export function saveYamlDict(filePath: string, obj: Record<string, unknown>): void {
  const text = yaml.stringify(obj, { sortMapEntries: false });
  writeText(filePath, text);
}

export function loadEffectivePolicy(
  paths: RuntimePaths,
  projectDir?: string
): [Record<string, unknown>, string | null] {
  let policy = JSON.parse(JSON.stringify(DEFAULT_POLICY)) as Record<string, unknown>;
  policy = mergeValues(
    policy,
    loadYamlDict(paths.globalConfigPath)
  ) as Record<string, unknown>;

  let projectConfigPath: string | null = null;
  if (projectDir) {
    const candidate = path.join(projectDir, ".secretrc");
    if (fs.existsSync(candidate)) projectConfigPath = candidate;
  }
  if (projectConfigPath === null) {
    projectConfigPath = findProjectConfig(projectDir);
  }
  if (projectConfigPath) {
    policy = mergeValues(
      policy,
      loadYamlDict(projectConfigPath)
    ) as Record<string, unknown>;
  }
  return [policy, projectConfigPath];
}
