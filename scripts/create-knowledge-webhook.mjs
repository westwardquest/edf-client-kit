/**
 * Create a GitHub repo webhook on the *knowledge* repo only (push → EDF).
 * Usage (from workspace repo root): node vendor/edf-client-kit/scripts/create-knowledge-webhook.mjs
 *
 * Requires: GITHUB_TOKEN (repo + admin:repo_hook), edf.config with
 * DEV_APP_ORIGIN, GITHUB_WEBHOOK_SECRET, KNOWLEDGE_REPO_HTTPS (or GITHUB_OWNER + WORKSPACE_SLUG).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output, stderr } from "node:process";

function parseConfig(raw) {
  const out = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function loadEdfConfig(workspaceRoot) {
  const p = path.join(workspaceRoot, "edf.config");
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p} — copy templates/edf.config.example`);
  }
  return parseConfig(fs.readFileSync(p, "utf8"));
}

function githubOwnerRepoFromHttps(urlStr) {
  const u = new URL(urlStr);
  if (u.hostname !== "github.com" && !u.hostname.endsWith(".github.com")) {
    throw new Error("KNOWLEDGE_REPO_HTTPS must be a github.com HTTPS URL");
  }
  const parts = u.pathname
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Could not parse owner/repo from KNOWLEDGE_REPO_HTTPS");
  }
  return { owner: parts[0], repo: parts[1] };
}

async function main() {
  const workspaceRoot = process.argv[2]
    ? path.resolve(process.argv[2])
    : process.cwd();
  const rl = readline.createInterface({ input, output });

  const cfg = loadEdfConfig(workspaceRoot);
  const devOrigin = (cfg.DEV_APP_ORIGIN || "").replace(/\/$/, "");
  if (!devOrigin) {
    throw new Error("edf.config: DEV_APP_ORIGIN is required");
  }

  let knowledgeUrl = cfg.KNOWLEDGE_REPO_HTTPS?.trim();
  if (!knowledgeUrl && cfg.GITHUB_OWNER && cfg.WORKSPACE_SLUG) {
    knowledgeUrl = `https://github.com/${cfg.GITHUB_OWNER}/${cfg.WORKSPACE_SLUG}-knowledge-base`;
  }
  if (!knowledgeUrl) {
    throw new Error(
      "edf.config: set KNOWLEDGE_REPO_HTTPS or GITHUB_OWNER + WORKSPACE_SLUG",
    );
  }

  let secret = cfg.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) {
    secret = (
      await rl.question(
        "GITHUB_WEBHOOK_SECRET (must match Vercel env, used for X-Hub-Signature-256): ",
      )
    ).trim();
  }
  if (!secret) {
    throw new Error("GITHUB_WEBHOOK_SECRET is required");
  }

  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is required in the environment (PAT or gh auth token with repo + hook admin).",
    );
  }

  const { owner, repo } = githubOwnerRepoFromHttps(knowledgeUrl);
  const payloadUrl = `${devOrigin}/api/webhooks/github`;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/hooks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push"],
        config: {
          url: payloadUrl,
          content_type: "json",
          secret,
          insecure_ssl: "0",
        },
      }),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    stderr.write(`${res.status} ${res.statusText}\n${text}\n`);
    process.exit(1);
  }
  stderr.write(
    `Created webhook on ${owner}/${repo} → ${payloadUrl}\n` +
      "If the repo already had an identical hook, delete duplicates in GitHub Settings → Webhooks.\n",
  );
  await rl.close();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
