import * as fs from "node:fs";
import * as path from "node:path";

export function eprint(...args: unknown[]): void {
  console.error(...args);
}

export function ensureParent(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export function writeText(filePath: string, text: string, mode?: number): void {
  ensureParent(filePath);
  fs.writeFileSync(filePath, text, { encoding: "utf-8" });
  if (mode !== undefined) {
    fs.chmodSync(filePath, mode);
  }
}

export function readJsonDict(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Expected object in ${filePath}`);
  }
  return raw as Record<string, unknown>;
}

export function writeJsonDict(filePath: string, data: Record<string, unknown>): void {
  const text = JSON.stringify(data, null, 2) + "\n";
  writeText(filePath, text);
}
