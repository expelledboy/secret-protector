import * as path from "node:path";
import { DEFAULT_POLICY } from "./defaults.js";
import { evaluateHook } from "./hooks.js";
import { installRuntime, hookCommandFor } from "./install-runtime.js";
import { eprint, writeText } from "./io.js";
import { runtimePaths } from "./paths.js";
import * as fs from "node:fs";
import * as os from "node:os";
import {
  loadEffectivePolicy,
  saveYamlDict,
  getNested,
} from "./policy.js";
import {
  installConfig as installCodexConfig,
  installArtifacts as installCopilotArtifacts,
  installPlugin as installOpencodePlugin,
  renderCopilotExclusions,
  upsertCursorHooks,
} from "./providers/index.js";
import type { RuntimePaths } from "./paths.js";

function providerEnabled(policy: Record<string, unknown>, provider: string): boolean {
  const value = getNested(policy, "providers", provider) ?? true;
  return Boolean(value);
}

function parseStdinJson(): Record<string, unknown> {
  if (process.stdin.isTTY) return {};
  const raw = fs.readFileSync(0, "utf-8").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (e) {
    throw new Error(`Invalid JSON on stdin: ${e}`);
  }
}

export function cmdInit(args: { force?: boolean }, paths: RuntimePaths): number {
  if (fs.existsSync(paths.globalConfigPath) && !args.force) {
    eprint(`Config already exists: ${paths.globalConfigPath}`);
    eprint("Use --force to overwrite.");
    return 1;
  }
  saveYamlDict(paths.globalConfigPath, { ...DEFAULT_POLICY } as Record<string, unknown>);
  console.log(`Wrote default config: ${paths.globalConfigPath}`);
  return 0;
}

export function cmdInstall(
  args: { project?: string },
  paths: RuntimePaths,
  distSourceDir: string
): number {
  if (!fs.existsSync(paths.globalConfigPath)) {
    saveYamlDict(paths.globalConfigPath, { ...DEFAULT_POLICY } as Record<string, unknown>);
  }
  const projectDir = args.project ? path.resolve(args.project) : process.cwd();
  const [policy, projectConfig] = loadEffectivePolicy(paths, projectDir);

  installRuntime(paths, distSourceDir);

  const outputs: string[] = [];
  if (providerEnabled(policy, "cursor")) {
    const p = upsertCursorHooks(paths, (pr, ev) => hookCommandFor(paths, pr, ev));
    outputs.push(`Cursor hooks upserted: ${p}`);
  }
  if (providerEnabled(policy, "opencode")) {
    const p = installOpencodePlugin(paths);
    outputs.push(`OpenCode plugin installed: ${p}`);
  }
  if (providerEnabled(policy, "codex")) {
    const p = installCodexConfig(paths, policy);
    outputs.push(`Codex config upserted: ${p}`);
  }
  if (providerEnabled(policy, "copilot")) {
    for (const p of installCopilotArtifacts(paths, policy, projectDir)) {
      outputs.push(`Copilot exclusion artifact written: ${p}`);
    }
  }
  outputs.push(`Policy source: ${paths.globalConfigPath}`);
  outputs.push(
    projectConfig ? `Project override: ${projectConfig}` : "Project override: none (.secretrc not found)"
  );
  console.log(outputs.join("\n"));
  return 0;
}

export function cmdHook(
  args: { provider: string; event: string },
  paths: RuntimePaths
): number {
  const [policy] = loadEffectivePolicy(paths, process.cwd());
  let payload: Record<string, unknown>;
  try {
    payload = parseStdinJson();
  } catch (e) {
    eprint(String(e));
    return 2;
  }
  const decision = evaluateHook(args.provider, args.event, payload, policy);
  console.log(JSON.stringify(decision));
  return 0;
}

export function cmdRenderCopilot(
  args: { project?: string; output?: string },
  paths: RuntimePaths
): number {
  const projectDir = args.project ? path.resolve(args.project) : process.cwd();
  const [policy] = loadEffectivePolicy(paths, projectDir);
  const content = renderCopilotExclusions(policy);
  if (args.output) {
    const outPath = path.resolve(args.output.replace(/^~/, os.homedir()));
    writeText(outPath, content);
    console.log(`Wrote: ${outPath}`);
  } else {
    console.log(content);
  }
  return 0;
}

export function main(
  argv: string[],
  options: { home?: string; distDir?: string } = {}
): number {
  const paths = runtimePaths(options.home);
  const distDir = options.distDir ?? path.dirname(fileURLToPath(import.meta.url));

  const cmd = argv[0];
  const rest = argv.slice(1);

  const parseInit = () => ({ force: rest.includes("--force") });
  const parseInstall = () => ({ project: rest.find((_, i, a) => a[i - 1] === "--project") ?? undefined });
  const parseHook = () => ({ provider: rest[0] ?? "", event: rest[1] ?? "" });
  const parseRenderCopilot = () => ({
    project: rest.find((_, i, a) => a[i - 1] === "--project") ?? undefined,
    output: rest.find((_, i, a) => a[i - 1] === "--output") ?? undefined,
  });

  try {
    if (cmd === "init") return cmdInit(parseInit(), paths);
    if (cmd === "install") return cmdInstall(parseInstall(), paths, distDir);
    if (cmd === "hook") return cmdHook(parseHook(), paths);
    if (cmd === "render-copilot") return cmdRenderCopilot(parseRenderCopilot(), paths);
  } catch (e) {
    eprint(`error: ${e}`);
    return 1;
  }
  return 1;
}
