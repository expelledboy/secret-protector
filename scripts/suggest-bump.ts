#!/usr/bin/env bun
/**
 * Suggests semver bump by diffing API snapshots between ref and current.
 * Uses git worktree for full checkout at ref so ref's api-extract runs against ref's code.
 * Usage: bun run scripts/suggest-bump.ts [ref]
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

type SnapshotJson = {
  configKeys: string[];
  cliCommands: string[];
  cliOptions: string[];
  hookEvents: string[];
  hookResponseFields: string[];
};

type Bump = "major" | "minor" | "patch";
type Category =
  | "config"
  | "cli command"
  | "cli option"
  | "hook event"
  | "hook response field";

const CATEGORY_LABELS: Record<string, Category> = {
  configKeys: "config",
  cliCommands: "cli command",
  cliOptions: "cli option",
  hookEvents: "hook event",
  hookResponseFields: "hook response field",
};

function run(cmd: string, args: string[], cwd: string): { stdout: string; stderr: string; code: number } {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: "utf-8",
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    code: r.status ?? -1,
  };
}

function diffSets(
  refArr: string[],
  currArr: string[]
): { added: string[]; removed: string[] } {
  const refSet = new Set(refArr);
  const currSet = new Set(currArr);
  const added: string[] = [];
  const removed: string[] = [];
  for (const s of currSet) {
    if (!refSet.has(s)) added.push(s);
  }
  for (const s of refSet) {
    if (!currSet.has(s)) removed.push(s);
  }
  return { added, removed };
}

function diffSnapshots(
  refSnap: SnapshotJson,
  currSnap: SnapshotJson
): { added: Array<{ category: Category; item: string }>; removed: Array<{ category: Category; item: string }> } {
  const added: Array<{ category: Category; item: string }> = [];
  const removed: Array<{ category: Category; item: string }> = [];

  const keys: (keyof SnapshotJson)[] = [
    "configKeys",
    "cliCommands",
    "cliOptions",
    "hookEvents",
    "hookResponseFields",
  ];

  for (const k of keys) {
    const { added: a, removed: r } = diffSets(
      refSnap[k] ?? [],
      currSnap[k] ?? []
    );
    const cat = CATEGORY_LABELS[k] ?? ("config" as Category);
    for (const item of a) added.push({ category: cat, item });
    for (const item of r) removed.push({ category: cat, item });
  }

  return { added, removed };
}

function suggestBump(
  added: Array<{ category: Category; item: string }>,
  removed: Array<{ category: Category; item: string }>
): Bump {
  if (removed.length > 0) return "major";
  if (added.length > 0) return "minor";
  return "patch";
}

function formatItem(category: Category, item: string): string {
  if (category === "config") return `config: ${item}`;
  if (category === "cli option") return `cli option: ${item}`;
  return `${category}: ${item}`;
}

function main(): number {
  const projectRoot = process.cwd();
  const refArg = process.argv[2];

  let ref: string;
  if (refArg) {
    ref = refArg;
  } else {
    const r = run("git", ["describe", "--tags", "--abbrev=0"], projectRoot);
    if (r.code !== 0) {
      console.error("No git tags found. Run with a ref, e.g. v0.1.0");
      return 1;
    }
    ref = r.stdout.trim();
  }

  const worktreeDir = path.join(
    os.tmpdir(),
    `secret-protector-ref-${Date.now()}-${process.pid}`
  );

  try {
    const addResult = run("git", ["worktree", "add", worktreeDir, ref], projectRoot);
    if (addResult.code !== 0) {
      console.error(`git worktree add failed: ${addResult.stderr}`);
      return 1;
    }

    const refExtractorPath = path.join(worktreeDir, "scripts", "api-extract.ts");
    let refSnapshotJson: string;
    if (fs.existsSync(refExtractorPath)) {
      const runRef = run("bun", ["run", "scripts/api-extract.ts", "."], worktreeDir);
      if (runRef.code !== 0) {
        console.error(`Ref extractor failed: ${runRef.stderr}`);
        return 1;
      }
      refSnapshotJson = runRef.stdout;
    } else {
      const runCurrent = run("bun", ["run", "scripts/api-extract.ts", worktreeDir], projectRoot);
      if (runCurrent.code !== 0) {
        console.error(`Current extractor on ref files failed: ${runCurrent.stderr}`);
        return 1;
      }
      refSnapshotJson = runCurrent.stdout;
    }

    const runCurrent = run("bun", ["run", "scripts/api-extract.ts", "."], projectRoot);
    if (runCurrent.code !== 0) {
      console.error(`Current extractor failed: ${runCurrent.stderr}`);
      return 1;
    }
    const currentSnapshotJson = runCurrent.stdout;

    const refSnap = JSON.parse(refSnapshotJson) as SnapshotJson;
    const currSnap = JSON.parse(currentSnapshotJson) as SnapshotJson;

    const { added, removed } = diffSnapshots(refSnap, currSnap);
    const bump = suggestBump(added, removed);

    console.log(`Suggested bump: ${bump}`);
    console.log("Reasons:");
    for (const { category, item } of added) {
      console.log(`  + ${formatItem(category, item)}`);
    }
    if (removed.length === 0) {
      console.log("  - (none)");
    } else {
      for (const { category, item } of removed) {
        console.log(`  - ${formatItem(category, item)}`);
      }
    }

    return 0;
  } finally {
    run("git", ["worktree", "remove", worktreeDir, "--force"], projectRoot);
  }
}

process.exit(main());
