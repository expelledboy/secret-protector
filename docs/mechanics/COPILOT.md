# GitHub Copilot Content Exclusion Mechanics

How GitHub Copilot content exclusion works and how secret-protector supports it.

---

## Official References

- [Excluding content from GitHub Copilot](https://docs.github.com/en/copilot/how-tos/content-exclusion/exclude-content-from-copilot)
- [Configure and audit content exclusion](https://docs.github.com/en/copilot/how-tos/configure-content-exclusion)
- [Content exclusion for GitHub Copilot](https://docs.github.com/en/copilot/concepts/content-exclusion)

---

## Scope: What Content Exclusion Applies To

| Feature | Content exclusion applies? |
|---------|----------------------------|
| Code completion (inline suggestions) | ✅ Yes |
| Copilot Chat in IDEs | ✅ Yes |
| Copilot code review (GitHub website) | ✅ Yes |
| **Copilot CLI** | ❌ **No** |
| **Copilot coding agent** | ❌ **No** |
| **Agent mode in Copilot Chat** | ❌ **No** |

**Critical:** Content exclusion does **not** protect Copilot CLI or Agent mode. Those can still access excluded files. secret-protector's Copilot artifact helps for completion and Chat only; for CLI/Agent, use Cursor or OpenCode hooks instead.

---

## Configuration Levels

| Level | Who configures | Scope |
|-------|----------------|-------|
| Repository | Repo admins | Files in that repo only |
| Organization | Org owners | Any repo for users with Copilot seats |
| Enterprise | Enterprise owners | All orgs in enterprise |

Repository exclusions inherit from org/enterprise. Org exclusions appear as gray boxes (read-only) at repo level.

---

## Format (GitHub Settings)

GitHub expects **fnmatch** patterns. Repository format:

```yaml
- ".env"
- "**/.env.*"
- "secrets.json"
- "/scripts/**"
```

Organization format (with repo reference):

```yaml
"*":
  - "**/.env"

octo-repo:
  - "/src/some-dir/kernel.rs"

https://github.com/primer/react.git:
  - "secrets.json"
  - "/src/**/temp.rb"
```

**fnmatch:** Case-insensitive; supports `*`, `?`, `**`. See [Ruby File.fnmatch](https://ruby-doc.org/core-2.5.1/File.html#method-c-fnmatch).

---

## secret-protector Artifact

secret-protector writes a **source-of-truth file** that users must **manually copy** into GitHub settings. GitHub does **not** auto-read this file.

**Paths:**

- Global: `~/.config/secret-protector/copilot-content-exclusions.txt`
- Repo: `<project_dir>/.github/copilot-content-exclusions.txt` (or `copilot.repo_file` from policy)

**Format:**

```
# Secret Protector - Copilot content exclusion candidates
# Apply these patterns in GitHub Copilot content exclusion settings (repo/org/enterprise).
# This file is a source-of-truth artifact; GitHub does not auto-read this file.

[glob_patterns]
.env
.env.*
**/.env
...

[regex_patterns]
(?i)(^|/)(credentials?|secrets?|tokens?)(/|\|$)
...
```

**Conversion:** GitHub repo settings use fnmatch. Our `files.block_globs` map directly. Our `files.block_regex` patterns may need manual adaptation—GitHub uses fnmatch, not full regex. For regex-style patterns, use the closest fnmatch equivalent (e.g. `*secrets*` for `(^|/)secrets?(/|$)`).

---

## Propagation

After changing exclusions in GitHub:

- **IDE reload:** Up to 30 minutes; reload window (VS Code: Developer: Reload Window) to fetch sooner
- **Neovim:** Fetches on each file open
- **JetBrains / Visual Studio:** Restart app

---

## render-copilot Command

```bash
npx secret-protector render-copilot [--project /path/to/repo] [--output /path/to/file]
```

- Prints exclusion content to stdout
- With `--output`: writes to file
- With `--project`: uses policy from that directory (including `.secretrc`)

---

## Limitations

- **Symlinks:** Content exclusion may not apply to symlinked files
- **Remote filesystems:** May not apply to repos on network mounts
- **Semantic info:** Excluded file content may still leak via IDE type info or other indirect context
- **CLI/Agent:** No protection for Copilot CLI or Agent mode
