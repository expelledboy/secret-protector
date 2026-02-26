# Regeneration Guide

This document explains how another agent can read `docs/design/` and regenerate the entire secret-protector project from scratch.

## Prerequisites

- Bun or Node.js 18+
- TypeScript knowledge
- Understanding of CLI tools, YAML, and hook systems

## Read Order

1. **REQUIREMENTS.md** – What the system must do
2. **ARCHITECTURE.md** – Module layout and data flow
3. **API.md** – CLI contract and hook stdin/stdout
4. **PROVIDERS.md** – Per-provider install logic
5. **POLICY_SCHEMA.md** – YAML schema and merge rules

## File-by-File Mapping

| Design spec | Implementation |
|-------------|----------------|
| REQUIREMENTS FR-1 | policy.ts, defaults.ts |
| REQUIREMENTS FR-2 | app.ts, cli.ts |
| REQUIREMENTS FR-3 | providers/*.ts, install-runtime.ts |
| REQUIREMENTS FR-4 | detector.ts, hooks.ts |
| ARCHITECTURE paths | paths.ts |
| API hook contract | hooks.ts, app.ts (cmd_hook) |
| PROVIDERS Cursor | providers/cursor.ts |
| PROVIDERS OpenCode | providers/opencode.ts |
| PROVIDERS Codex | providers/codex.ts |
| PROVIDERS Copilot | providers/copilot.ts |
| POLICY_SCHEMA | defaults.ts, policy.ts |

## Regeneration Steps

1. Create `package.json` with name `secret-protector`, bin, engines, files.
2. Create `tsconfig.json` targeting ES2020, module NodeNext.
3. Implement `src/paths.ts` from ARCHITECTURE path table.
4. Implement `src/defaults.ts` from POLICY_SCHEMA.
5. Implement `src/io.ts` (writeText, readJsonDict, writeJsonDict, eprint).
6. Implement `src/policy.ts` (mergeValues, loadEffectivePolicy, findProjectConfig).
7. Implement `src/detector.ts` (collectStrings, collectPaths, policyMatchers, detect*).
8. Implement `src/hooks.ts` (cursorDecision, opencodeDecision, evaluateHook).
9. Implement `src/providers/*.ts` from PROVIDERS.md.
10. Implement `src/install-runtime.ts`.
11. Implement `src/app.ts` and `src/cli.ts`.
12. Add build script (bun build or tsc).
13. Add tests in tests/.
14. Add docs/mechanics, docs/ecosystem, AGENTS.md.

## Validation

- `bun run src/cli.ts init`
- `bun run src/cli.ts install --project .`
- `echo '{"prompt":"use GITHUB_PAT"}' | bun run src/cli.ts hook cursor beforeSubmitPrompt` → `continue: false`
- `bun test`
