import * as fs from "node:fs";
import { MANAGED_BLOCK_END, MANAGED_BLOCK_START } from "../defaults.js";
import { writeText } from "../io.js";
import type { RuntimePaths } from "../paths.js";
import { asList, getNested, orderedUnique } from "../policy.js";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripManagedBlock(content: string): string {
  const start = escapeRe(MANAGED_BLOCK_START);
  const end = escapeRe(MANAGED_BLOCK_END);
  const re = new RegExp(`\\n?${start}[\\s\\S]*?${end}\\n?`, "g");
  return content.replace(re, "\n");
}

function stripTomlTable(content: string, tableName: string): string {
  const lines = content.split(/\r?\n/).map((l) => l + "\n");
  const startRe = new RegExp(`^\\s*\\[${escapeRe(tableName)}\\]\\s*$`);
  const headerRe = /^\s*\[[^\[]+]\s*$/;
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (!skipping && startRe.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && headerRe.test(line)) {
      skipping = false;
      out.push(line);
      continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join("");
}

function tomlQuote(v: string): string {
  return JSON.stringify(v);
}

function tomlArray(values: string[]): string {
  if (values.length === 0) return "[]";
  return "[" + values.map(tomlQuote).join(", ") + "]";
}

function buildEnvPolicy(
  policy: Record<string, unknown>
): [string[], string[]] {
  const envExact = asList(getNested(policy, "env", "block_exact") ?? []);
  const envRegex = asList(getNested(policy, "env", "block_regex") ?? []);
  const allowExact = asList(getNested(policy, "env", "allow_exact") ?? []);
  const allowRegex = asList(getNested(policy, "env", "allow_regex") ?? []);

  const includeOnly: string[] = [];
  for (const name of allowExact) {
    if (name) includeOnly.push(`^${escapeRe(name)}$`);
  }
  includeOnly.push(...allowRegex.filter(Boolean));

  const exclude: string[] = [];
  for (const name of envExact) {
    if (name) exclude.push(`^${escapeRe(name)}$`);
  }
  exclude.push(...envRegex.filter(Boolean));

  return [
    orderedUnique(includeOnly) as string[],
    orderedUnique(exclude) as string[],
  ];
}

export function installConfig(
  paths: RuntimePaths,
  policy: Record<string, unknown>
): string {
  const [includeOnly, exclude] = buildEnvPolicy(policy);
  let existing = "";
  if (fs.existsSync(paths.codexConfigPath)) {
    existing = fs.readFileSync(paths.codexConfigPath, "utf-8");
  }
  let updated = stripManagedBlock(existing);
  updated = stripTomlTable(updated, "shell_environment_policy");
  updated = updated.replace(/\s*$/, "\n\n");

  const managedBlock =
    `${MANAGED_BLOCK_START}\n` +
    "[shell_environment_policy]\n" +
    'inherit = "core"\n' +
    `include_only = ${tomlArray(includeOnly)}\n` +
    `exclude = ${tomlArray(exclude)}\n` +
    `${MANAGED_BLOCK_END}\n`;

  writeText(paths.codexConfigPath, updated + managedBlock);
  return paths.codexConfigPath;
}
