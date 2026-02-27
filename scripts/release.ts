#!/usr/bin/env bun
/**
 * Release: bump version from commits since last tag, then commit, tag, push.
 * Uses conventional commits (feat/fix/BREAKING) to determine patch/minor/major.
 * Pushing tag v* triggers the publish workflow.
 *
 * Usage: bun run scripts/release.ts [--dry-run]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

type Bump = "major" | "minor" | "patch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");

function run(cmd: string, args: string[], opts?: { input?: string }): { stdout: string; stderr: string; code: number } {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf-8",
    input: opts?.input,
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    code: r.status ?? -1,
  };
}

function inferBumpFromCommits(commitText: string): Bump {
  const blocks = commitText.split("---").map((b) => b.trim()).filter(Boolean);
  let hasBreaking = false;
  let hasFeat = false;
  let hasFix = false;

  for (const block of blocks) {
    const lines = block.split("\n");
    const subject = lines[0] ?? "";

    // BREAKING CHANGE in body
    if (lines.some((l) => /^BREAKING CHANGE:/i.test(l))) hasBreaking = true;

    // Conventional commit: type(scope)!: or type!: or type:
    if (/^feat(\([^)]*\))?!?:/.test(subject)) {
      if (subject.includes("!:")) hasBreaking = true;
      else hasFeat = true;
    }
    if (/^fix(\([^)]*\))?!?:/.test(subject)) {
      if (subject.includes("!:")) hasBreaking = true;
      else hasFix = true;
    }
  }

  if (hasBreaking) return "major";
  if (hasFeat) return "minor";
  if (hasFix) return "patch";
  return "patch";
}

function bumpVersion(current: string, bump: Bump): string {
  const parts = current.split(".").map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;

  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function main(): number {
  const dryRun = process.argv.includes("--dry-run");

  const lastTagResult = run("git", ["describe", "--tags", "--abbrev=0"]);
  const lastTag = lastTagResult.code === 0 ? lastTagResult.stdout.trim() : null;

  const logRange = lastTag ? `${lastTag}..HEAD` : "HEAD";
  const logResult = run("git", ["log", "--pretty=format:%s%n%b---", logRange]);

  const commitText = logResult.stdout.trim();
  const bump = inferBumpFromCommits(commitText);

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version: string };
  const next = bumpVersion(pkg.version, bump);

  console.log(`Bump: ${bump} (${pkg.version} -> ${next})`);
  if (commitText) {
    console.log(`Commits since ${lastTag ?? "root"}:`);
    const subjects = commitText
      .split("---")
      .map((b) => (b.split("\n")[0] ?? "").trim())
      .filter(Boolean);
    for (const s of subjects) console.log(`  - ${s}`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would:");
    console.log(`  - Set package.json version to ${next}`);
    console.log(`  - git commit -m "chore: release v${next}"`);
    console.log(`  - git tag v${next}`);
    console.log(`  - git push origin HEAD --follow-tags`);
    return 0;
  }

  pkg.version = next;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  if (run("git", ["add", "package.json"]).code !== 0) return 1;
  if (run("git", ["commit", "-m", `chore: release v${next}`]).code !== 0) return 1;
  if (run("git", ["tag", `v${next}`]).code !== 0) return 1;
  if (run("git", ["push", "origin", "HEAD", "--follow-tags"]).code !== 0) return 1;

  console.log(`\nReleased v${next}. Publish workflow will run on GitHub.`);
  return 0;
}

process.exit(main());
