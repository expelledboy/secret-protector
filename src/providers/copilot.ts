import * as os from "node:os";
import * as path from "node:path";
import { writeText } from "../io.js";
import type { RuntimePaths } from "../paths.js";
import { asList, getNested } from "../policy.js";

function resolveGlobalPath(paths: RuntimePaths, policy: Record<string, unknown>): string {
  const override = getNested(policy, "copilot", "global_file");
  if (override != null && String(override).trim()) {
    return path.resolve(String(override).replace(/^~/, os.homedir()));
  }
  return paths.copilotGlobalExportPath;
}

export function renderExclusions(
  policy: Record<string, unknown>,
  format: "default" | "github" = "default"
): string {
  const globs = [...new Set(asList(getNested(policy, "files", "block_globs") ?? []))].sort();
  const regex = [...new Set(asList(getNested(policy, "files", "block_regex") ?? []))].sort();

  if (format === "github") {
    const lines = [
      "# Secret Protector - Copilot content exclusion (GitHub format)",
      "# Copy these lines into GitHub Copilot content exclusion settings (repo/org/enterprise).",
      "# GitHub uses fnmatch; regex patterns are omitted.",
      "",
      ...globs.map((g) => `- "${g}"`),
      "",
    ];
    return lines.join("\n");
  }

  const lines = [
    "# Secret Protector - Copilot content exclusion candidates",
    "# Apply these patterns in GitHub Copilot content exclusion settings (repo/org/enterprise).",
    "# This file is a source-of-truth artifact; GitHub does not auto-read this file.",
    "",
    "[glob_patterns]",
    ...globs,
    "",
    "[regex_patterns]",
    ...regex,
    "",
  ];
  return lines.join("\n");
}

export function installArtifacts(
  paths: RuntimePaths,
  policy: Record<string, unknown>,
  projectDir: string | null
): string[] {
  const out: string[] = [];
  const content = renderExclusions(policy);
  const globalPath = resolveGlobalPath(paths, policy);
  writeText(globalPath, content);
  out.push(globalPath);
  const writeRepo = getNested(policy, "copilot", "write_repo_file");
  if (projectDir && writeRepo !== false) {
    const repoFile = String(
      getNested(policy, "copilot", "repo_file") ?? ".github/copilot-content-exclusions.txt"
    );
    const repoPath = path.join(projectDir, repoFile);
    writeText(repoPath, content);
    out.push(repoPath);
  }
  return out;
}
