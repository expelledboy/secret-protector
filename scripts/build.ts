import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");
const cliSrc = path.join(srcDir, "cli.ts");

fs.mkdirSync(distDir, { recursive: true });

const result = Bun.build({
  entrypoints: [cliSrc],
  outdir: distDir,
  minify: true,
  target: "node",
  format: "esm",
  sourcemap: "external",
});

if (!result.success) {
  console.error("Build failed:", result.logs);
  process.exit(1);
}

// Ensure shebang is on the output (Bun may strip it)
const cliOut = path.join(distDir, "cli.js");
let content = fs.readFileSync(cliOut, "utf-8");
if (!content.startsWith("#!")) {
  content = "#!/usr/bin/env node\n" + content;
  fs.writeFileSync(cliOut, content);
}
fs.chmodSync(cliOut, 0o755);

console.log("Built dist/cli.js");
