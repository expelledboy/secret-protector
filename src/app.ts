import * as path from "node:path";
import { fileURLToPath } from "node:url";
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
  args: { project?: string; dryRun?: boolean; only?: string[] },
  paths: RuntimePaths,
  distSourceDir: string
): number {
  const projectDir = args.project ? path.resolve(args.project) : process.cwd();
  const hasGlobalConfig = fs.existsSync(paths.globalConfigPath);
  const [policy, projectConfig] = loadEffectivePolicy(paths, projectDir);

  if (args.dryRun) {
    const outputs: string[] = [];
    if (!hasGlobalConfig) outputs.push("Would write global config: " + paths.globalConfigPath);
    else outputs.push("Policy source: " + paths.globalConfigPath);
    if (providerEnabled(policy, "cursor") && (!args.only || args.only.includes("cursor"))) {
      outputs.push("Would upsert Cursor hooks: " + paths.cursorHooksPath);
    }
    if (providerEnabled(policy, "opencode") && (!args.only || args.only.includes("opencode"))) {
      outputs.push("Would install OpenCode plugin: " + paths.opencodePluginPath);
    }
    if (providerEnabled(policy, "codex") && (!args.only || args.only.includes("codex"))) {
      outputs.push("Would upsert Codex config: " + paths.codexConfigPath);
    }
    if (providerEnabled(policy, "copilot") && (!args.only || args.only.includes("copilot"))) {
      const globalFile = getNested(policy, "copilot", "global_file");
      const globalPath =
        globalFile != null && String(globalFile).trim()
          ? path.resolve(String(globalFile).replace(/^~/, os.homedir()))
          : paths.copilotGlobalExportPath;
      outputs.push("Would write Copilot artifact: " + globalPath);
      if (projectDir && getNested(policy, "copilot", "write_repo_file") !== false) {
        const repoFile = String(getNested(policy, "copilot", "repo_file") ?? ".github/copilot-content-exclusions.txt");
        outputs.push("Would write Copilot repo artifact: " + path.join(projectDir, repoFile));
      }
    }
    outputs.push(projectConfig ? `Project override: ${projectConfig}` : "Project override: none (.secretrc not found)");
    console.log(outputs.join("\n"));
    return 0;
  }

  if (!hasGlobalConfig) {
    saveYamlDict(paths.globalConfigPath, { ...DEFAULT_POLICY } as Record<string, unknown>);
  }

  const shouldInstall = (p: string) =>
    providerEnabled(policy, p) && (!args.only || (args.only && args.only.includes(p)));

  installRuntime(paths, distSourceDir);

  const outputs: string[] = [];
  if (shouldInstall("cursor")) {
    const p = upsertCursorHooks(paths, policy, (pr, ev) => hookCommandFor(paths, pr, ev));
    outputs.push(`Cursor hooks upserted: ${p}`);
  }
  if (shouldInstall("opencode")) {
    const p = installOpencodePlugin(paths);
    outputs.push(`OpenCode plugin installed: ${p}`);
  }
  if (shouldInstall("codex")) {
    const p = installCodexConfig(paths, policy);
    outputs.push(`Codex config upserted: ${p}`);
  }
  if (shouldInstall("copilot")) {
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
  args: { project?: string; output?: string; format?: "default" | "github" },
  paths: RuntimePaths
): number {
  const projectDir = args.project ? path.resolve(args.project) : process.cwd();
  const [policy] = loadEffectivePolicy(paths, projectDir);
  const format = args.format ?? "default";
  const content = renderCopilotExclusions(policy, format);
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

  const VALID_PROVIDERS = ["cursor", "opencode", "codex", "copilot"] as const;

  const parseInit = () => ({ force: rest.includes("--force") });
  const parseInstall = () => {
    const onlyVal = rest.find((_, i, a) => a[i - 1] === "--only") ?? rest.find((x) => x.startsWith("--only="))?.split("=")[1];
    let only: string[] | undefined;
    if (onlyVal) {
      only = onlyVal.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const invalid = only.filter((p) => !VALID_PROVIDERS.includes(p as typeof VALID_PROVIDERS[number]));
      if (invalid.length > 0) {
        eprint(`Unknown provider: ${invalid.join(", ")}. Valid: ${VALID_PROVIDERS.join(", ")}`);
        return { _invalid: true } as { project?: string; dryRun?: boolean; only?: string[]; _invalid?: boolean };
      }
    }
    return {
      project: rest.find((_, i, a) => a[i - 1] === "--project") ?? undefined,
      dryRun: rest.includes("--dry-run"),
      only,
    };
  };
  const parseHook = () => ({ provider: rest[0] ?? "", event: rest[1] ?? "" });
  const parseRenderCopilot = () => {
    const formatIdx = rest.findIndex((x) => x === "--format" || x.startsWith("--format="));
    let format: "default" | "github" | undefined;
    if (formatIdx >= 0) {
      const arg = rest[formatIdx];
      const val = arg.startsWith("--format=") ? arg.slice(9) : rest[formatIdx + 1];
      format = val === "github" ? "github" : undefined;
    }
    return {
      project: rest.find((_, i, a) => a[i - 1] === "--project") ?? undefined,
      output: rest.find((_, i, a) => a[i - 1] === "--output") ?? undefined,
      format,
    };
  };

  try {
    if (cmd === "init") return cmdInit(parseInit(), paths);
    if (cmd === "install") {
      const installArgs = parseInstall();
      if ((installArgs as { _invalid?: boolean })._invalid) return 1;
      return cmdInstall(installArgs, paths, distDir);
    }
    if (cmd === "hook") return cmdHook(parseHook(), paths);
    if (cmd === "render-copilot") return cmdRenderCopilot(parseRenderCopilot(), paths);
  } catch (e) {
    eprint(`error: ${e}`);
    return 1;
  }
  return 1;
}
