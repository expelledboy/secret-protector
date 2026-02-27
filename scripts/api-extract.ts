#!/usr/bin/env bun
/**
 * Extracts API surface from api-spec.json, defaults.ts
 * Self-contained: only node:fs, node:path. No project imports.
 * Usage: bun run scripts/api-extract.ts [basePath]
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface ApiSnapshot {
  configKeys: Set<string>;
  cliCommands: Set<string>;
  cliOptions: Set<string>;
  hookEvents: Set<string>;
  hookResponseFields: Set<string>;
}

function extractBracedContent(s: string, start: number): string {
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 1;
  let i = start + 1;
  const len = s.length;
  while (i < len && depth > 0) {
    const c = s[i];
    if (c === open && (i === 0 || s[i - 1] !== "\\")) depth++;
    else if (c === close && (i === 0 || s[i - 1] !== "\\")) depth--;
    i++;
  }
  return s.slice(start + 1, i - 1);
}

function extractConfigKeysFromDefaultPolicy(content: string): Set<string> {
  const keys = new Set<string>();
  const match = content.match(/DEFAULT_POLICY\s*:\s*Record<string,\s*unknown>\s*=\s*\{/);
  if (!match) return keys;
  const start = match.index! + match[0].length - 1;
  const objStr = extractBracedContent(content, start);
  function walk(str: string, prefix: string): void {
    let i = 0;
    const len = str.length;
    while (i < len) {
      const rest = str.slice(i);
      const keyMatch = rest.match(/^\s*(\w+)\s*:\s*/);
      if (!keyMatch) {
        i++;
        continue;
      }
      const key = keyMatch[1];
      i += keyMatch[0].length;
      const afterColon = str.slice(i);
      const valueStart = afterColon.search(/\S/);
      if (valueStart < 0) break;
      const valueIdx = i + valueStart;
      const nextChar = str[valueIdx];
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.add(fullKey);
      if (nextChar === "{") {
        const inner = extractBracedContent(str, valueIdx);
        walk(inner, fullKey);
        i = valueIdx + 1 + inner.length + 1;
      } else if (nextChar === "[") {
        i = skipBracket(str, valueIdx);
      } else {
        i = skipPrimitive(str, valueIdx);
      }
    }
  }

  function skipBracket(s: string, start: number): number {
    let depth = 0;
    let i = start;
    const len = s.length;
    if (s[i] === "[") depth = 1;
    i++;
    while (i < len && depth > 0) {
      if (s[i] === "[" && (i === 0 || s[i - 1] !== "\\")) depth++;
      else if (s[i] === "]" && (i === 0 || s[i - 1] !== "\\")) depth--;
      i++;
    }
    return i;
  }

  function skipPrimitive(s: string, start: number): number {
    let i = start;
    const len = s.length;
    if (i >= len) return i;
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < len && (s[i] !== quote || s[i - 1] === "\\")) i++;
      return i + 1;
    }
    if (c === "t" && s.slice(i, i + 4) === "true") return i + 4;
    if (c === "f" && s.slice(i, i + 5) === "false") return i + 5;
    if (c === "n" && s.slice(i, i + 4) === "null") return i + 4;
    if (/[\d-]/.test(c)) {
      while (i < len && /[\d.eE+-]/.test(s[i])) i++;
      return i;
    }
    return i + 1;
  }

  try {
    walk(objStr, "");
  } catch {
    // fallback: no keys
  }
  return keys;
}

function extractConfigKeys(defaultsPath: string): Set<string> {
  try {
    const content = fs.readFileSync(defaultsPath, "utf-8");
    return extractConfigKeysFromDefaultPolicy(content);
  } catch {
    return new Set();
  }
}

function extractFromSpec(specPath: string): {
  cliCommands: Set<string>;
  cliOptions: Set<string>;
  hookEvents: Set<string>;
  hookResponseFields: Set<string>;
} {
  const empty = {
    cliCommands: new Set<string>(),
    cliOptions: new Set<string>(),
    hookEvents: new Set<string>(),
    hookResponseFields: new Set<string>(),
  };
  try {
    const raw = fs.readFileSync(specPath, "utf-8");
    const spec = JSON.parse(raw);

    const cliCommands = new Set<string>();
    const cliOptions = new Set<string>();
    const hookEvents = new Set<string>();
    const hookResponseFields = new Set<string>();

    for (const cmd of spec.commands ?? []) {
      cliCommands.add(cmd.name);
      for (const opt of cmd.options ?? []) {
        cliOptions.add(opt);
      }
    }
    for (const opt of spec.globalOptions ?? []) {
      cliOptions.add(opt);
    }
    for (const [provider, events] of Object.entries(spec.hookEvents ?? {})) {
      for (const ev of events as string[]) {
        hookEvents.add(`${provider}:${ev}`);
      }
    }
    for (const [provider, events] of Object.entries(spec.hookResponseFields ?? {})) {
      for (const [ev, fields] of Object.entries(events as Record<string, string[]>)) {
        for (const f of fields) {
          hookResponseFields.add(`${provider}:${ev}:${f}`);
        }
      }
    }

    return {
      cliCommands,
      cliOptions,
      hookEvents,
      hookResponseFields,
    };
  } catch {
    return empty;
  }
}

export function extractApi(basePath: string): ApiSnapshot {
  const resolved = path.resolve(basePath);
  const specPath = path.join(resolved, "api-spec.json");
  const defaultsPath = path.join(resolved, "src", "defaults.ts");

  const specResult = extractFromSpec(specPath);
  const configKeys = extractConfigKeys(defaultsPath);

  return {
    configKeys,
    cliCommands: specResult.cliCommands,
    cliOptions: specResult.cliOptions,
    hookEvents: specResult.hookEvents,
    hookResponseFields: specResult.hookResponseFields,
  };
}

function snapshotToJson(snap: ApiSnapshot): Record<string, string[]> {
  return {
    configKeys: [...snap.configKeys].sort(),
    cliCommands: [...snap.cliCommands].sort(),
    cliOptions: [...snap.cliOptions].sort(),
    hookEvents: [...snap.hookEvents].sort(),
    hookResponseFields: [...snap.hookResponseFields].sort(),
  };
}

function main(): void {
  const basePath = process.argv[2] ?? ".";
  const snapshot = extractApi(basePath);
  const json = snapshotToJson(snapshot);
  console.log(JSON.stringify(json));
}

if (import.meta.main) {
  main();
}
