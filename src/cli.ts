#!/usr/bin/env node
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./app.js";

const argv = process.argv.slice(2);
let cmd = argv[0];

if (cmd === "--install" || cmd === "-i") {
  cmd = "install";
}

const distDir = path.dirname(fileURLToPath(import.meta.url));
const args = cmd ? [cmd, ...argv.slice(1)] : [];

if (!cmd || cmd.startsWith("-")) {
  console.log(`secret-protector - Install and enforce secret leak protections across AI coding tools.

Commands:
  init              Create default global config
  install           Upsert provider configs and hooks
  hook <p> <e>     Hook entrypoint for provider integrations
  render-copilot    Render Copilot exclusion artifact

Options:
  --install, -i    Alias for install
  --force          Overwrite existing config (init)
  --dry-run        Preview install without writing files (install)
  --only <list>    Providers to install: cursor,opencode,codex,copilot (install)
  --project <path>  Project directory (install, render-copilot)
  --output <path>  Write to file (render-copilot)
  --format <fmt>   Output format: default, github (render-copilot)
`);
  process.exit(cmd ? 1 : 0);
}

const code = main(args, { distDir });
process.exit(code);
