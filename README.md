# EDF client kit

Portable **ticket MCP** and **Cursor** onboarding for customer workspaces: `mcp/`, reference **`templates/`**, **`AGENTS.md`**, and this README. This package is developed inside the Extreme Development Framework monorepo at **`packages/edf-client-kit`** and **published as its own Git repository** for `git clone` / **`git submodule add`** (see **Publishing** below). Customer workspaces get **`vendor/edf-client-kit`** via **`npm run quickstart:customer`** (from the framework repo; submodule when the workspace is a git repo) or by running **`scripts/quickstarts/setup-edf-kit.mjs`** in a framework checkout.

Workspace-only automation (webhook helper, quickstart, optional launch helper) lives in the framework repo under **`scripts/quickstarts/`** — see **[`docs/repository_layout.md`](../../docs/repository_layout.md)**.

## Publishing (maintainers)

The canonical sources live in **`packages/edf-client-kit`** in the [Extreme Development Framework](https://github.com/) monorepo. Push a subtree to the public kit repo (replace org/repo):

```bash
# From monorepo root — see also scripts/setup-edf-kit-remote.md
git subtree push -P packages/edf-client-kit origin edf-client-kit-main
```

Or use **`scripts/setup-edf-kit-remote.md`** at the framework repo root for a one-off `git subtree split` + push.

Quickstart defaults **`EDF_CLIENT_KIT_GIT_URL`** to **`https://github.com/westwardquest/edf-client-kit.git`**. Override in **`.env.local`** if you fork.

## Contents

- **`mcp/`** — stdio MCP server (`npm run mcp:tickets`) plus **`mcp/tickets-cli.mjs`** (list/get/lookup via the same HTTP API when MCP is not available in chat). Quickstart adds a workspace **`package.json`** with **`npm run edf:tickets`**.
- **`templates/`** — `edf.config.example`, `workspace-users.json.example`, knowledge-repo template (used by quickstart from monorepo paths, not copied into trimmed `vendor/`).
- **`AGENTS.md`** — prompts for Cursor to initialise ticketing + link the **knowledge** repo only.

## Workspace copy under `vendor/edf-client-kit`

- **With a workspace git root (default):** quickstart adds **`vendor/edf-client-kit`** as a **git submodule** — the full published tree is visible and pullable in Cursor’s Source Control.
- **With `--no-git-init`:** quickstart uses a **shallow clone** and **trims** to runtime MCP files only:

  - `package.json`
  - `mcp/`
  - `.git` (so you can `git pull` / **`npm run refresh:vendor-kit`** in that clone)
  - installed dependencies (`node_modules/`)

  Templates and monorepo scripts are omitted from that trimmed tree to reduce noise.

## Naming (fixed)

- **Workspace slug** = main **workspace repo** folder name (GitHub-safe: `a-z`, `0-9`, hyphens).
- **Knowledge repo** folder name is **`<slug>-knowledge-base`**, usually **nested** under the workspace clone (`quickstarts/<slug>/<slug>-knowledge-base/`). Only that repo gets the GitHub **`push`** webhook to EDF.

## After scaffold

1. In **Cursor:** **Settings → Features → Model Context Protocol** → enable **edf-tickets** (quickstart cannot enable it automatically).
2. Re-run from the **framework** repo only when needed: **`npm run quickstart:customer -- --client-root <workspace-repo>`** — refresh bootstrap/session + **`.cursor/mcp.json`**.
3. Knowledge webhook (if not created by quickstart `--push`): from the framework repo, **`node scripts/quickstarts/create-knowledge-webhook.mjs <workspace-root>`**.

See the framework **`README.md`**, **[`docs/repository_layout.md`](../../docs/repository_layout.md)**, and **`examples/cursor-workspace/README.md`**.

## Env (MCP)

| Variable | Purpose |
| -------- | ------- |
| `EDF_BASE_URL` | Same as `DEV_APP_ORIGIN` in `edf.config` (no trailing slash). Must match the deployment where the PAT was created. |
| `EDF_PERSONAL_ACCESS_TOKEN` | **Required.** Full `edf_pat_…` from the app **Settings → Personal access tokens**. The MCP sends this as `Authorization: Bearer …` on every request (no `EDF_SUPABASE_ACCESS_TOKEN`). |

## Updating the kit

- **From a client workspace (submodule):** `vendor/edf-client-kit` is **tracked** by the workspace repo. Run **`git pull`** inside **`vendor/edf-client-kit`**, or **`git submodule update --remote vendor/edf-client-kit`** from the workspace root, then **`npm install`** there if needed.
- **Monorepo ahead of published kit:** from the **ExtremeDevelopmentFramework** repo:
  - **`npm run refresh:vendor-kit -- <path-to-your-workspace-root> --sync-from-framework <path-to-framework-repo-root>`** — runs `git pull` in the vendor tree, then copies **`packages/edf-client-kit/mcp`** + **`package.json`** from your monorepo.
  - Or set **`EDF_FRAMEWORK_ROOT`** to the framework repo root and run **`npm run refresh:vendor-kit -- <workspace-root>`** (same sync step).
  - Without `--sync-from-framework`: only **`git pull`** + **`npm install`** in **`vendor/edf-client-kit`**.
  - Shorthand: **`node scripts/quickstarts/refresh-vendor-kit.mjs`** with cwd = workspace (or pass workspace as first argument).
- **Recreate from scratch:** re-run **`npm run quickstart:customer`** (or **`scripts/quickstarts/setup-edf-kit.mjs`**) if you prefer a clean tree.

**Shallow clone workspaces (`--no-git-init`):** `vendor/` stays gitignored; **`git pull`** inside **`vendor/edf-client-kit`** is still the simple path.
