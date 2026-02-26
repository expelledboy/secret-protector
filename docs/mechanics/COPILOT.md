# GitHub Copilot Content Exclusion Mechanics

## Official References

- [Excluding content from GitHub Copilot](https://docs.github.com/en/copilot/how-tos/content-exclusion/exclude-content-from-copilot)
- [Configuring content exclusions](https://docs.github.com/en/copilot/how-tos/configure-content-exclusion)

## Scope

- **Applies to:** Code completion, Copilot Chat in IDEs
- **Does NOT apply to:** Copilot CLI, Copilot coding agent, Agent mode in Copilot Chat

## Configuration

**Repository:** Settings → Copilot → Content exclusion  
**Organization:** Settings → Copilot → Content exclusion

**Format:** fnmatch patterns. Example:

```yaml
- ".env"
- "**/.env.*"
- "secrets.json"
- "/scripts/**"
```

## secret-protector Artifact

secret-protector writes a source-of-truth file (e.g. `.github/copilot-content-exclusions.txt`) with `[glob_patterns]` and `[regex_patterns]` sections. Users must manually copy patterns into GitHub settings; GitHub does not auto-read the file.

## Propagation

Changes can take up to 30 minutes in IDEs. Reload IDE or restart to fetch sooner.
