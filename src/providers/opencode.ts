import { writeText } from "../io.js";
import type { RuntimePaths } from "../paths.js";

function renderPlugin(): string {
  return `import { spawnSync } from "node:child_process";

const hook = process.env.SECRET_PROTECTOR_HOOK_CMD || \`\${process.env.HOME}/.config/secret-protector/bin/secret-protector-hook\`;

function runHook(event, payload) {
  const result = spawnSync(hook, ["opencode", event], {
    input: JSON.stringify(payload ?? {}),
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || "secret-protector hook failed").trim();
    throw new Error(msg || "secret-protector hook failed");
  }

  const stdout = (result.stdout || "{}").trim();
  if (!stdout) {
    return {};
  }

  try {
    return JSON.parse(stdout);
  } catch (err) {
    throw new Error(\`secret-protector hook returned invalid JSON: \${String(err)}\`);
  }
}

const SecretProtector = {
  "tool.execute.before": async (input) => {
    const decision = runHook("tool.execute.before", input);
    if (decision && decision.block) {
      throw new Error(decision.user_message || "Blocked by secret-protector");
    }
    return input;
  },
};

export default async () => SecretProtector;
`;
}

export function installPlugin(paths: RuntimePaths): string {
  writeText(paths.opencodePluginPath, renderPlugin());
  return paths.opencodePluginPath;
}
