# Contributing

Thanks for your interest in contributing to secret-protector.

## Development Setup

1. Clone the repo:

   ```bash
   git clone https://github.com/expelledboy/secret-protector.git
   cd secret-protector
   ```

2. Install dependencies (Bun or npm):

   ```bash
   bun install
   # or: npm install
   ```

3. Run tests:

   ```bash
   bun test
   # or: npm test
   ```

   Run a subset of tests:

   ```bash
   bun test ./tests/detector.test.ts
   ```

   Opt-in live blocking tests (require Cursor and a writable hooks path):

   ```bash
   SECRET_PROTECTOR_RUN_LIVE_CLI_TESTS=1 bun test ./tests/live-blocking.test.ts
   ```

## Reporting Issues

Open an issue at [https://github.com/expelledboy/secret-protector/issues](https://github.com/expelledboy/secret-protector/issues). Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment (OS, Node/Bun version, provider: Cursor/OpenCode/Codex/Copilot)

## Pull Requests

1. Fork the repo and create a branch.
2. Make your changes; ensure `bun test` passes.
3. Open a PR with a clear description and link any related issues.

## Documentation

- [docs/README.md](docs/README.md) — Policy schema, merge rules, tests
- [docs/design/ARCHITECTURE.md](docs/design/ARCHITECTURE.md) — Module layout, data flow
