import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

export interface RuntimePaths {
  readonly home: string;
  readonly globalDir: string;
  readonly globalConfigPath: string;
  readonly globalDistPath: string;
  readonly globalHookBinPath: string;
  readonly cursorHooksPath: string;
  readonly opencodePluginDir: string;
  readonly opencodePluginPath: string;
  readonly codexConfigPath: string;
  readonly copilotGlobalExportPath: string;
}

export function fromHome(home: string): RuntimePaths {
  const globalDir = path.join(home, ".config", "secret-protector");
  return {
    home,
    globalDir,
    globalConfigPath: path.join(globalDir, "config.yaml"),
    globalDistPath: path.join(globalDir, "dist"),
    globalHookBinPath: path.join(globalDir, "bin", "secret-protector-hook"),
    cursorHooksPath: path.join(home, ".cursor", "hooks.json"),
    opencodePluginDir: path.join(home, ".config", "opencode", "plugins"),
    opencodePluginPath: path.join(home, ".config", "opencode", "plugins", "secret-protector.js"),
    codexConfigPath: path.join(home, ".codex", "config.toml"),
    copilotGlobalExportPath: path.join(globalDir, "copilot-content-exclusions.txt"),
  };
}

export function runtimePaths(home?: string): RuntimePaths {
  const resolved = path.resolve(home ?? os.homedir());
  return fromHome(resolved);
}
