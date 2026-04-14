# EDF client kit

Portable **ticket MCP** and **Cursor** onboarding for customer workspaces: `mcp/`, reference **`templates/`**, **`AGENTS.md`**, and this README. This package is developed inside the Extreme Development Framework monorepo at **`packages/edf-client-kit`** and **published as its own Git repository** for `git clone` (see **Publishing** below). Customer workspaces get **`vendor/edf-client-kit`** via **`npm run quickstart:customer`** (from the framework repo) or by running **`scripts/quickstarts/setup-edf-kit.mjs`** in a framework checkout.

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

## Runtime-only workspace copy

`npm run quickstart:customer` keeps only runtime MCP files under `vendor/edf-client-kit`:

- `package.json`
- `mcp/`
- `.git` (so you can `git pull` / **`npm run refresh:vendor-kit`** in that clone)
- installed dependencies (`node_modules/`)

Templates and monorepo scripts are intentionally omitted from generated customer workspaces to reduce noise and prevent misleading local-only workflows.

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
| `EDF_BASE_URL` | Same as `DEV_APP_ORIGIN` in `edf.config` (no trailing slash). |
| `EDF_SUPABASE_ACCESS_TOKEN` | Supabase user access JWT (short-lived). |
| `EDF_SUPABASE_REFRESH_TOKEN` | Refresh token — used by MCP tool **`refresh_supabase_session`** when the access JWT expires. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (for refresh). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (for refresh). |
| `EDF_MCP_CONFIG_PATH` | Absolute path to `.cursor/mcp.json` — refresh tool writes new tokens here. |

## Updating the kit

- **From a client workspace:** `vendor/edf-client-kit` is **gitignored** in the workspace repo but is still a real **git clone**. Pull new commits and reinstall deps from the **ExtremeDevelopmentFramework** repo:
  - **`npm run refresh:vendor-kit -- <path-to-your-workspace-root>`**
  - or **`node scripts/quickstarts/refresh-vendor-kit.mjs`** (run with cwd = workspace, or pass the workspace path as the first argument).
- **Recreate from scratch:** re-run **`npm run quickstart:customer`** (or clone again via **`scripts/quickstarts/setup-edf-kit.mjs`**) if you prefer a clean tree.

Using a **submodule** for `vendor/edf-client-kit` is possible but not the default: the workspace repo intentionally does not commit vendored kit history; **`git pull`** inside **`vendor/edf-client-kit`** is the simple path.
