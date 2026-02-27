import * as path from "node:path";
import { minimatch } from "minimatch";
import { eprint } from "./io.js";
import { asList, getNested } from "./policy.js";

const BUILTIN_PATH_LIKE_KEYS = new Set([
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

const BUILTIN_FILE_READ_COMMANDS = new Set([
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "grep",
  "awk",
  "sed",
  "bat",
  "rg",
]);

export function getPathLikeKeys(policy: Record<string, unknown>): Set<string> {
  const configured = asList(getNested(policy, "detection", "path_like_keys") ?? []);
  if (configured.length === 0) return BUILTIN_PATH_LIKE_KEYS;
  return new Set([...BUILTIN_PATH_LIKE_KEYS, ...configured.map((k) => String(k).replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())]);
}

export function getFileReadCommands(policy: Record<string, unknown>): Set<string> {
  const configured = asList(getNested(policy, "detection", "file_read_commands") ?? []);
  if (configured.length === 0) return BUILTIN_FILE_READ_COMMANDS;
  return new Set([...BUILTIN_FILE_READ_COMMANDS, ...configured.map((k) => String(k).toLowerCase())]);
}

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
  keyHint?: string,
  pathLikeKeys?: Set<string>
): void {
  const keys = pathLikeKeys ?? BUILTIN_PATH_LIKE_KEYS;
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value)) {
      for (const item of value) collectPaths(item, out, keyHint, keys);
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = String(key).replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
      collectPaths(item, out, normalizedKey, keys);
    }
    return;
  }
  if (typeof value !== "string") return;
  const isPathKey = keyHint ? keys.has(keyHint) : false;
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

function getEnvReferencePatterns(policy: Record<string, unknown>): string[] {
  return asList(getNested(policy, "detection", "env_reference_patterns") ?? []);
}

export function firstEnvMatch(
  text: string,
  envExact: string[],
  envRegex: RegExp[],
  envReferencePatterns?: string[]
): string | null {
  for (const name of envExact) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const checks: RegExp[] = [
      new RegExp(`\\$\\{?${escaped}\\}?`),
      new RegExp(`\\b${escaped}\\b\\s*=`),
      new RegExp(`\\bexport\\s+${escaped}\\b`),
      new RegExp(`\\b${escaped}\\b`),
    ];
    if (envReferencePatterns?.length) {
      for (const tpl of envReferencePatterns) {
        try {
          const pattern = tpl.replace(/\{NAME\}/g, escaped);
          checks.push(new RegExp(pattern));
        } catch {
          // skip invalid pattern
        }
      }
    }
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

/**
 * Best-effort extraction of file paths from a shell command string.
 * Handles: cat .env, grep x .env.local, head -n 1 .env, rg pattern -- .env.
 * Limitations: subshells $(...), backticks, variable expansion in paths not parsed.
 */
export function extractPathsFromCommand(
  command: string,
  fileReadCommands?: Set<string>
): string[] {
  if (typeof command !== "string" || !command.trim()) return [];

  const commands = fileReadCommands ?? BUILTIN_FILE_READ_COMMANDS;
  const tokens = tokenizeCommand(command);
  const paths: string[] = [];
  let afterFileReadCommand = false;
  let skipUntilNextArg = false;

  for (const t of tokens) {
    if (t === "|" || t === ";" || t === "&" || t === "&&" || t === "||") {
      afterFileReadCommand = false;
      skipUntilNextArg = false;
      continue;
    }

    if (commands.has(t.toLowerCase())) {
      afterFileReadCommand = true;
      skipUntilNextArg = false;
      continue;
    }

    if (t === "--") {
      skipUntilNextArg = false;
      afterFileReadCommand = true;
      continue;
    }

    if (t.startsWith("-") && t !== "--") {
      if (afterFileReadCommand) skipUntilNextArg = true;
      continue;
    }

    if (skipUntilNextArg && afterFileReadCommand) {
      skipUntilNextArg = false;
      continue;
    }

    if (afterFileReadCommand) {
      if (t.includes("/") || t.includes("\\") || t.startsWith(".") || /^[\w.-]+$/.test(t) || t.includes(" ")) {
        paths.push(t);
      }
    }
  }
  return paths;
}

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < command.length) {
    while (i < command.length && /\s/.test(command[i])) i++;
    if (i >= command.length) break;

    const ch = command[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let end = i;
      while (end < command.length && command[end] !== quote) {
        if (command[end] === "\\") end++;
        end++;
      }
      tokens.push(command.slice(i, end).replace(/\\"/g, '"'));
      i = end < command.length ? end + 1 : end;
    } else {
      let end = i;
      while (end < command.length && !/\s/.test(command[end]) && command[end] !== "|" && command[end] !== ";" && command[end] !== "&" && command[end] !== '"' && command[end] !== "'") {
        if (command[end] === "\\") end++;
        end++;
      }
      tokens.push(end > i ? command.slice(i, end) : command[i] ?? "");
      i = end === i && end < command.length ? end + 1 : end;
    }
  }
  return tokens;
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

function pathMatchesAllow(
  p: string,
  allowGlobs: string[],
  allowRegex: RegExp[]
): boolean {
  const normalized = normalizePath(p);
  const basename = path.basename(normalized);
  for (const glob of allowGlobs) {
    try {
      if (minimatch(normalized, glob) || minimatch(basename, glob)) return true;
    } catch {
      // skip invalid glob
    }
  }
  for (const re of allowRegex) {
    if (re.test(normalized)) return true;
  }
  return false;
}

export function pathMatchesWithAllow(
  p: string,
  blockGlobs: string[],
  blockRegex: RegExp[],
  allowGlobs: string[],
  allowRegex: RegExp[]
): string | null {
  if (pathMatchesAllow(p, allowGlobs, allowRegex)) return null;
  return pathMatches(p, blockGlobs, blockRegex);
}

export function policyMatchers(
  policy: Record<string, unknown>
): [string[], RegExp[], string[], RegExp[], string[], RegExp[]] {
  const envExact = asList(getNested(policy, "env", "block_exact") ?? []).filter((s) => s.trim());
  const envRegex = compileRegexes(asList(getNested(policy, "env", "block_regex") ?? []));
  const fileGlobs = asList(getNested(policy, "files", "block_globs") ?? []).filter((s) => s.trim());
  const fileRegex = compileRegexes(asList(getNested(policy, "files", "block_regex") ?? []));
  const allowGlobs = asList(getNested(policy, "files", "allow_globs") ?? []).filter((s) => s.trim());
  const allowRegex = compileRegexes(asList(getNested(policy, "files", "allow_regex") ?? []));
  return [envExact, envRegex, fileGlobs, fileRegex, allowGlobs, allowRegex];
}

export function detectSecretLeak(
  payload: unknown,
  policy: Record<string, unknown>
): string | null {
  const [envExact, envRegex, fileGlobs, fileRegex, allowGlobs, allowRegex] = policyMatchers(policy);
  const pathLikeKeys = getPathLikeKeys(policy);
  const envRefPatterns = getEnvReferencePatterns(policy);

  const strings: string[] = [];
  collectStrings(payload, strings);
  for (const text of strings) {
    const envHit = firstEnvMatch(text, envExact, envRegex, envRefPatterns.length ? envRefPatterns : undefined);
    if (envHit) return `Detected secret environment variable reference: ${envHit}`;
  }

  const paths: string[] = [];
  collectPaths(payload, paths, undefined, pathLikeKeys);
  for (const p of paths) {
    const hit = pathMatchesWithAllow(p, fileGlobs, fileRegex, allowGlobs, allowRegex);
    if (hit) return `Detected sensitive file path pattern: ${hit}`;
  }
  return null;
}

export function detectSensitiveRead(
  payload: unknown,
  policy: Record<string, unknown>
): string | null {
  const [, , fileGlobs, fileRegex, allowGlobs, allowRegex] = policyMatchers(policy);
  const pathLikeKeys = getPathLikeKeys(policy);
  const paths: string[] = [];
  collectPaths(payload, paths, undefined, pathLikeKeys);
  for (const p of paths) {
    const hit = pathMatchesWithAllow(p, fileGlobs, fileRegex, allowGlobs, allowRegex);
    if (hit) return `Read blocked for sensitive file pattern: ${hit}`;
  }
  return null;
}

export function detectSensitiveCommand(
  payload: unknown,
  policy: Record<string, unknown>
): string | null {
  const [envExact, envRegex, fileGlobs, fileRegex, allowGlobs, allowRegex] = policyMatchers(policy);
  const pathLikeKeys = getPathLikeKeys(policy);
  const fileReadCommands = getFileReadCommands(policy);

  const envRefPatterns = getEnvReferencePatterns(policy);
  const strings: string[] = [];
  collectStrings(payload, strings);
  for (const text of strings) {
    const envHit = firstEnvMatch(text, envExact, envRegex, envRefPatterns.length ? envRefPatterns : undefined);
    if (envHit) return `Command references secret environment variable: ${envHit}`;
  }

  const paths: string[] = [];
  collectPaths(payload, paths, undefined, pathLikeKeys);

  for (const text of strings) {
    const cmdPaths = extractPathsFromCommand(text, fileReadCommands);
    paths.push(...cmdPaths);
  }

  for (const p of paths) {
    const hit = pathMatchesWithAllow(p, fileGlobs, fileRegex, allowGlobs, allowRegex);
    if (hit) return `Command references sensitive file path pattern: ${hit}`;
  }
  return null;
}
