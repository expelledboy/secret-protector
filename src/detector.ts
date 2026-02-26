import * as path from "node:path";
import { minimatch } from "minimatch";
import { eprint } from "./io.js";
import { asList, getNested } from "./policy.js";

const PATH_LIKE_KEYS = new Set([
  "path",
  "filepath",
  "file_path",
  "filename",
  "uri",
  "absolute_path",
  "absolutepath",
  "relative_path",
  "relativepath",
  "relative_workspace_path",
  "relativeworkspacepath",
]);

export function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      for (const item of value) collectStrings(item, out);
    } else {
      for (const [key, item] of Object.entries(value)) {
        out.push(String(key));
        collectStrings(item, out);
      }
    }
  }
}

export function collectPaths(
  value: unknown,
  out: string[],
  keyHint?: string
): void {
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      for (const item of value) collectPaths(item, out, keyHint);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = String(key).replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
      collectPaths(item, out, normalizedKey);
    }
    return;
  }
  if (typeof value !== "string") return;
  const isPathKey = keyHint ? PATH_LIKE_KEYS.has(keyHint) : false;
  const seemsLikePath = value.includes("/") || value.includes("\\") || value.startsWith(".");
  if (isPathKey || seemsLikePath) out.push(value);
}

export function normalizePath(p: string): string {
  return p.trim().replace(/\\/g, "/");
}

function compileRegexes(patterns: string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (let pattern of patterns) {
    const iFlag = /^\(\?i\)/.test(pattern);
    if (iFlag) pattern = pattern.replace(/^\(\?i\)/, "");
    try {
      compiled.push(new RegExp(pattern, iFlag ? "i" : ""));
    } catch (err) {
      eprint(`warning: invalid regex ignored: ${JSON.stringify(pattern)} (${err})`);
    }
  }
  return compiled;
}

export function firstEnvMatch(
  text: string,
  envExact: string[],
  envRegex: RegExp[]
): string | null {
  for (const name of envExact) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const checks = [
      new RegExp(`\\$\\{?${escaped}\\}?`),
      new RegExp(`\\b${escaped}\\b\\s*=`),
      new RegExp(`\\bexport\\s+${escaped}\\b`),
      new RegExp(`\\b${escaped}\\b`),
    ];
    for (const re of checks) {
      if (re.test(text)) return name;
    }
  }
  for (const re of envRegex) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

export function pathMatches(
  p: string,
  fileGlobs: string[],
  fileRegex: RegExp[]
): string | null {
  const normalized = normalizePath(p);
  const basename = path.basename(normalized);

  for (const glob of fileGlobs) {
    try {
      if (minimatch(normalized, glob) || minimatch(basename, glob)) return glob;
    } catch {
      // skip invalid glob
    }
  }
  for (const re of fileRegex) {
    if (re.test(normalized)) return re.source;
  }
  return null;
}

export function policyMatchers(
  policy: Record<string, unknown>
): [string[], RegExp[], string[], RegExp[]] {
  const envExact = asList(getNested(policy, "env", "exact") ?? []).filter((s) => s.trim());
  const envRegex = compileRegexes(asList(getNested(policy, "env", "regex") ?? []));
  const fileGlobs = asList(getNested(policy, "files", "globs") ?? []).filter((s) => s.trim());
  const fileRegex = compileRegexes(asList(getNested(policy, "files", "regex") ?? []));
  return [envExact, envRegex, fileGlobs, fileRegex];
}

export function detectSecretLeak(
  payload: unknown,
  policy: Record<string, unknown>
): string | null {
  const [envExact, envRegex, fileGlobs, fileRegex] = policyMatchers(policy);

  const strings: string[] = [];
  collectStrings(payload, strings);
  for (const text of strings) {
    const envHit = firstEnvMatch(text, envExact, envRegex);
    if (envHit) return `Detected secret environment variable reference: ${envHit}`;
  }

  const paths: string[] = [];
  collectPaths(payload, paths);
  for (const p of paths) {
    const hit = pathMatches(p, fileGlobs, fileRegex);
    if (hit) return `Detected sensitive file path pattern: ${hit}`;
  }
  return null;
}

export function detectSensitiveRead(
  payload: unknown,
  policy: Record<string, unknown>
): string | null {
  const [, , fileGlobs, fileRegex] = policyMatchers(policy);
  const paths: string[] = [];
  collectPaths(payload, paths);
  for (const p of paths) {
    const hit = pathMatches(p, fileGlobs, fileRegex);
    if (hit) return `Read blocked for sensitive file pattern: ${hit}`;
  }
  return null;
}

export function detectSensitiveCommand(
  payload: unknown,
  policy: Record<string, unknown>
): string | null {
  const [envExact, envRegex, fileGlobs, fileRegex] = policyMatchers(policy);

  const strings: string[] = [];
  collectStrings(payload, strings);
  for (const text of strings) {
    const envHit = firstEnvMatch(text, envExact, envRegex);
    if (envHit) return `Command references secret environment variable: ${envHit}`;
  }

  const paths: string[] = [];
  collectPaths(payload, paths);
  for (const p of paths) {
    const hit = pathMatches(p, fileGlobs, fileRegex);
    if (hit) return `Command references sensitive file path pattern: ${hit}`;
  }
  return null;
}
