import * as fs from "node:fs";
import * as path from "node:path";
import { writeText } from "./io.js";
import type { RuntimePaths } from "./paths.js";

export function hookCommandFor(
  paths: RuntimePaths,
  provider: string,
  event: string
): string {
  return `${paths.globalHookBinPath} ${provider} ${event}`;
}

export function installRuntime(
  paths: RuntimePaths,
  distSourceDir: string
): void {
  ensureParent(paths.globalDistPath);
  copyDirSync(distSourceDir, paths.globalDistPath);

  const wrapper = `#!/usr/bin/env bash
set -euo pipefail
exec node "${path.join(paths.globalDir, "dist", "cli.js")}" hook "$@"
`;
  ensureParent(paths.globalHookBinPath);
  writeText(paths.globalHookBinPath, wrapper, 0o755);
}

function ensureParent(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
