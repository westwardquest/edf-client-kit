/**
 * Clone the published edf-client-kit repo into vendor/edf-client-kit.
 * Run from the workspace repo root: node scripts/setup-edf-kit.mjs
 *
 * Env: EDF_CLIENT_KIT_GIT_URL (required) — https://github.com/<org>/edf-client-kit.git
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const vendor = path.join(root, "vendor", "edf-client-kit");

const url = process.env.EDF_CLIENT_KIT_GIT_URL?.trim();
if (!url) {
  console.error(
    "Set EDF_CLIENT_KIT_GIT_URL to the public kit repo (e.g. in .env.local).",
  );
  process.exit(1);
}

if (fs.existsSync(path.join(vendor, "package.json"))) {
  console.error("vendor/edf-client-kit already exists — delete it to re-clone.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(vendor), { recursive: true });
execFileSync("git", ["clone", "--depth", "1", url, vendor], { stdio: "inherit" });
console.error(`Cloned edf-client-kit → ${vendor}`);
