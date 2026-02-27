# Ecosystem Validation

Investigation of alternatives and user feedback to validate secret-protector's approach.

---

## Summary

**secret-protector's approach is validated** by ecosystem research. Its main differentiators—configurable policy, project overrides, multi-agent support, and bypass tags—directly address pain points reported by users of alternatives. One gap stands out: **file allowlisting** (e.g. `.env.example`, `.env.template`) is demanded by users but not yet supported.

---

## User Feedback by Alternative

### mintmcp/agent-security (~62 stars)

**What users value:**
- "Standalone, local-first scanner with minimal footprint"
- "No external dependencies"—regex-only, no telemetry
- "Easy to set up so teams can adopt it without friction"
- Pre hooks block; **post hooks warn**—users want both modes
- "Runs completely locally. No code, prompts, or files leave your system"
- Patterns from detect-secrets (Apache 2.0)

**Pain points:** No issues on GitHub; small community. Hardcoded patterns, no YAML config, no project override. Cursor + Claude Code only—no Codex, OpenCode, Copilot.

**Validation:** secret-protector matches on local-first, easy setup, multi-event hooks. Exceeds on policy (YAML + `.secretrc`), project overrides, and agent coverage. Missing: post-mode warnings.

---

### OpenCode built-in .env blocking (issue #4969)

**What users complained about:**
- "Overly restrictive"—`filepath.includes(".env")` blocks ANY path with "env"
- Blocks `src/environment.ts`, `config/env/settings.ts`, `utils/envParser.ts`
- Blocks `.env.template`, `.env.example` (safe templates)
- Blocks `.envrc` (direnv)—"having to dust off claude code just to edit my direnv config"
- "Laravel projects got messy due to this .env blocking"
- **"Users need control over what gets blacklisted when"**
- "Saying that the user requested this in the error message is downright misleading!" (blocking wasn't user-configured)

**Root cause:** Broad substring match, no allowlist, no configurability.

**Validation:** secret-protector uses basename-aware globs (`**/.env.*`) and regex—better than substring. As of the file allowlist feature, default `files.allow_globs` includes `.env.example`, `.env.template`, `.env.sample`, `.env.schema`. Users can add more in `.secretrc`. Allow takes precedence over block (gitignore-style).

---

### boxpositron/envsitter-guard

**What users value:**
- Blocks `.env*` but **allows** `.env.example`
- **Safe tools**: `envsitter_keys`, `envsitter_match`, `envsitter_scan`—inspect structure without exposing values
- "Agent can still reason about config structure"
- Blocks read/edit/write on sensitive paths

**Validation:** secret-protector blocks more broadly (prompts, shell commands, env refs) but lacks safe-tool pattern. envsitter-guard is OpenCode-only; secret-protector covers four agents. File allowlist (allow_globs/allow_regex) is implemented; safe tools could be a future enhancement.

---

### trevorstenson/claude-redact-env (~0 stars)

**What the approach offers:**
- **Redaction** instead of block—agent sees `OPENAI_API_KEY=<REDACTED>` structure
- "Check my config" without leaking keys
- Bash command interception: detects `cat .env`, creates temp redacted file, rewrites path
- Keeps structure intact so agent understands "you have DATABASE_URL set"

**User insight:** Block frustrates when you need to show structure. Redact allows reasoning without exposure.

**Validation:** secret-protector blocks—stronger guarantee but less flexible. Bypass tags (`[allow-secret]`) partially address "intentional inspection" use case. Redaction is a different trade-off; could be future mode. Bash path extraction in `detectSensitiveCommand` already exists (e.g. `cat .env`).

---

### sensitive-canary (Claude Code plugin)

**What users value:**
- **Bypass tags**: `[allow-secret]`, `[allow-pii]`, `[allow-all]` for intentional sharing
- 29 secret types + PII
- Zero config, marketplace install
- Runs locally

**Validation:** secret-protector already has bypass tags. Matches on local, explicit override. Claude Code only vs. four agents.

---

### 1Password/cursor-hooks (~7 stars)

**What users value:**
- Just-in-time secrets from 1Password—no hardcoding
- Validates mounted .env files before shell execution
- "Required files missing or invalid" → block with fix instructions

**Validation:** Different use case—1Password ecosystem. secret-protector is general-purpose; no conflict. Could document as complementary (1Password for secret sourcing, secret-protector for leak prevention).

---

### Cursor sandbox credential leaks (Luca Becker, Nov 2025)

**What researchers found:**
- Cursor sandbox exposes `~/.npmrc`, `~/.aws/credentials`, `~/.docker/config.json`, `~/.ssh/config`, `~/.gitconfig`
- Developers building custom hooks to protect dotfiles
- Command substitution (`$(...)`, backticks) could bypass naive checks
- "Designed to prevent most common accidental exposures, not perfect security"

**Validation:** secret-protector's default policy includes `**/.aws`, `**/.ssh`, `**/.gnupg` via regex; `extractPathsFromCommand` handles `cat .env`. Covers common vectors. Command-substitution bypass is acknowledged limitation—same as Luca Becker's hook.

---

### GitGuardian Cursor

**What users value:**
- 500+ patterns, real-time scan on save
- .gitguardian.yaml for false positives
- Privacy/security focus, 5-star rating

**Pain points:** Detect only—no block. "Does not stop the agent from reading or exfiltrating secrets during a session." Requires SaaS.

**Validation:** secret-protector blocks—different threat model. GitGuardian for commit-time; secret-protector for session-time. Complementary.

---

## Validation Matrix

| User need | secret-protector | Alternatives |
|-----------|------------------|--------------|
| Configurable policy | YAML + `.secretrc` | agent-security: none; OpenCode: none |
| Project override | `.secretrc` merge | agent-security: no; others: no |
| Multi-agent | Cursor, OpenCode, Codex, Copilot | agent-security: 2; others: 1 |
| Bypass for intentional use | `[allow-secret]`, etc. | sensitive-canary: yes |
| Allow `.env.example` | Yes (files.allow_globs) | envsitter-guard: yes |
| Post-mode warnings | No | agent-security: yes |
| Redaction option | No | claude-redact-env: yes |
| Safe-tool pattern | No | envsitter-guard: yes |
| Local, no SaaS | Yes | Most: yes; GitGuardian: no |
| beforeShellExecution | Yes | agent-security: no in Cursor example |

---

## Recommendations

1. **files.allow_globs / files.allow_regex — implemented**  
   Allow patterns take precedence over block. Default includes `.env.example`, `.env.template`, etc. Users extend via `.secretrc`.

2. **Consider post-mode**  
   agent-security's "block on pre, warn on post" could reduce false-negative anxiety. Lower priority.

3. **Consider safe-tool pattern**  
   envsitter-guard's approach—tools that expose keys/fingerprints but not values—is elegant for "help me understand my config" flows. Higher design effort.

---

## References

- [mintmcp/agent-security](https://github.com/mintmcp/agent-security)
- [OpenCode #4969: Overly restrictive .env blocking](https://github.com/anomalyco/opencode/issues/4969)
- [trevorstenson/claude-redact-env](https://github.com/trevorstenson/claude-redact-env)
- [Agent Redaction (Trevo.rs)](https://trevo.rs/agent-redaction)
- [boxpositron/envsitter-guard](https://github.com/boxpositron/envsitter-guard)
- [1Password cursor-hooks](https://github.com/1Password/cursor-hooks)
- [Luca Becker: Cursor Sandboxing Leaks Secrets](https://luca-becker.me/blog/cursor-sandboxing-leaks-secrets)
- [sensitive-canary (DEV.to intro)](https://dev.to/chataclaw/stop-claude-code-from-leaking-your-secrets-introducing-sensitive-canary-826)
- [GitGuardian Cursor docs](https://docs.gitguardian.com/ggshield-docs/integrations/ide-integrations/cursor)
