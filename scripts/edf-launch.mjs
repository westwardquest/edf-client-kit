/**
 * Run once after opening a scaffolded workspace in Cursor (from the workspace repo root).
 * - npm install inside vendor/edf-client-kit
 * - ensure edf.config exists (copy from example if missing)
 *
 * Webhook: run node vendor/edf-client-kit/scripts/create-knowledge-webhook.mjs
 * Ticketing + MCP: from the EDF monorepo, npm run quickstart:customer -- --client-root <this-dir>
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

function workspaceRootArg() {
  return process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
}

function main() {
  const workspaceRoot = workspaceRootArg();
  const kitRoot = path.join(workspaceRoot, "vendor", "edf-client-kit");
  if (!fs.existsSync(path.join(kitRoot, "package.json"))) {
    console.error(
      `Expected ${kitRoot} (run quickstart from the Extreme Development Framework repo first).`,
    );
    process.exit(1);
  }

  console.error(`Installing npm dependencies in ${kitRoot} …`);
  execSync("npm install", { cwd: kitRoot, stdio: "inherit" });

  const example = path.join(kitRoot, "templates", "edf.config.example");
  const target = path.join(workspaceRoot, "edf.config");
  if (!fs.existsSync(target) && fs.existsSync(example)) {
    fs.copyFileSync(example, target);
    console.error(`Created ${target} — edit it before provisioning.`);
  }

  const wuExample = path.join(kitRoot, "templates", "workspace-users.json.example");
  const wuTarget = path.join(workspaceRoot, "workspace-users.json");
  if (!fs.existsSync(wuTarget) && fs.existsSync(wuExample)) {
    fs.copyFileSync(wuExample, wuTarget);
    console.error(`Created ${wuTarget} — add emails (gitignored).`);
  }

  console.error(`
Next:
  1. Edit edf.config (Supabase URL/anon key, KNOWLEDGE_REPO_HTTPS, GITHUB_WEBHOOK_SECRET).
  2. Push the two repos to GitHub (workspace + <slug>-knowledge-base).
  3. Create the knowledge-repo webhook: set EDF_GITHUB_DEVELOPER_PAT (or GITHUB_TOKEN), then:
       node vendor/edf-client-kit/scripts/create-knowledge-webhook.mjs
  4. From the EDF framework repo: npm run quickstart:customer -- --client-root "${workspaceRoot}"
`);
}

main();
