import * as path from "node:path";
import { writeText } from "../io.js";
import type { RuntimePaths } from "../paths.js";
import { asList, getNested } from "../policy.js";

export function renderExclusions(policy: Record<string, unknown>): string {
  const globs = asList(getNested(policy, "files", "globs") ?? []);
  const regex = asList(getNested(policy, "files", "regex") ?? []);
  const lines = [
    "# Secret Protector - Copilot content exclusion candidates",
    "# Apply these patterns in GitHub Copilot content exclusion settings (repo/org/enterprise).",
    "# This file is a source-of-truth artifact; GitHub does not auto-read this file.",
    "",
    "[glob_patterns]",
    ...[...new Set(globs)].sort(),
    "",
    "[regex_patterns]",
    ...[...new Set(regex)].sort(),
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
  writeText(paths.copilotGlobalExportPath, content);
  out.push(paths.copilotGlobalExportPath);
  if (projectDir) {
    const repoFile = String(
      getNested(policy, "copilot", "repo_file") ?? ".github/copilot-content-exclusions.txt"
    );
    const repoPath = path.join(projectDir, repoFile);
    writeText(repoPath, content);
    out.push(repoPath);
  }
  return out;
}
