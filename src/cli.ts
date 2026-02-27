#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "./app.js";
import { eprint } from "./io.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");
const specPath = path.join(packageRoot, "api-spec.json");

let spec: {
  commands: Array<{ name: string; description?: string; options: string[] }>;
  globalOptions: string[];
};

try {
  const raw = fs.readFileSync(specPath, "utf-8");
  spec = JSON.parse(raw);
} catch (e) {
  eprint(`Failed to load api-spec.json: ${e}`);
  process.exit(1);
}

// Preprocess argv: -i/--install as first arg => treat as "install" command
const argv = process.argv.slice(2);
if (argv[0] === "--install" || argv[0] === "-i") {
  argv[0] = "install";
}

const program = new Command();
program
  .name("secret-protector")
  .description("Install and enforce secret leak protections across AI coding tools")
  .configureOutput({
    writeErr: (str) => process.stdout.write(str),
  })
  .exitOverride((err) => {
    if (err.code === "commander.help" || err.code === "commander.helpDisplayed") {
      process.exit(0);
    }
    throw err;
  });

for (const opt of spec.globalOptions) {
  program.option(opt, "");
}

const distDir = __dirname;

for (const cmdSpec of spec.commands) {
  const cmd = program
    .command(cmdSpec.name)
    .description(cmdSpec.description ?? "");

  for (const opt of cmdSpec.options) {
    cmd.option(opt, "");
  }

  if (cmdSpec.name === "hook") {
    cmd.argument("<provider>", "Provider name").argument("<event>", "Event name");
    cmd.action((provider: string, event: string) => {
      const opts = cmd.opts();
      const code = main(cmdSpec.name, opts as Record<string, unknown>, [provider, event], { distDir });
      process.exit(code);
    });
  } else {
    cmd.action(() => {
      const opts = cmd.opts();
      const code = main(cmdSpec.name, opts as Record<string, unknown>, [], { distDir });
      process.exit(code);
    });
  }
}

program.parse([process.argv[0], process.argv[1], ...argv]);
