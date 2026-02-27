import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, "..");
const specPath = path.join(packageRoot, "api-spec.json");

export interface ApiSpec {
  commands: Array<{ name: string; description?: string; options: string[] }>;
  globalOptions: string[];
  hookEvents: Record<string, string[]>;
  hookResponseFields: Record<string, Record<string, string[]>>;
}

let _spec: ApiSpec | null = null;

export function loadSpec(): ApiSpec {
  if (_spec) return _spec;
  let raw: string;
  try {
    raw = fs.readFileSync(specPath, "utf-8");
  } catch (e) {
    throw new Error(`Failed to read api-spec.json at ${specPath}: ${e}`);
  }
  try {
    _spec = JSON.parse(raw) as ApiSpec;
    return _spec;
  } catch (e) {
    throw new Error(`Failed to parse api-spec.json: ${e}`);
  }
}
