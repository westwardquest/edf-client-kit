# EDF client kit

Portable **ticket MCP**, **Cursor** templates, and **launch** helpers for customer workspaces. This package is developed inside the Extreme Development Framework monorepo at **`packages/edf-client-kit`** and **published as its own Git repository** for `git clone` (see **Publishing** below). Customer workspaces use **`vendor/edf-client-kit`** after **`scripts/setup-edf-kit.mjs`** clones that URL.

## Publishing (maintainers)

The canonical sources live in **`packages/edf-client-kit`** in the [Extreme Development Framework](https://github.com/) monorepo. Push a subtree to the public kit repo (replace org/repo):

```bash
# From monorepo root — see also scripts/setup-edf-kit-remote.md
git subtree push -P packages/edf-client-kit origin edf-client-kit-main
```

Or use **`scripts/setup-edf-kit-remote.md`** at the framework repo root for a one-off `git subtree split` + push.

Consumers set **`EDF_CLIENT_KIT_GIT_URL=https://github.com/<org>/edf-client-kit.git`** in `.env.local` and run **`node scripts/setup-edf-kit.mjs`** from the **workspace** repo (or rely on quickstart auto-clone).

## Contents

- **`mcp/`** — stdio MCP server (`npm run mcp:tickets`). Calls the deployed EDF HTTP API with `EDF_BASE_URL` + `EDF_SUPABASE_ACCESS_TOKEN`.
- **`templates/`** — `edf.config.example`, `workspace-users.json.example`.
- **`scripts/`** — `setup-edf-kit.mjs` (clone kit into `vendor/`), `edf-launch.mjs`, `create-knowledge-webhook.mjs`.
- **`AGENTS.md`** — prompts for Cursor to initialise ticketing + link the **knowledge** repo only.

## Naming (fixed)

- **Workspace slug** = main **workspace repo** folder name (GitHub-safe: `a-z`, `0-9`, hyphens).
- **Knowledge repo** folder name is **`<slug>-knowledge-base`**, usually **nested** under the workspace clone (`quickstarts/<slug>/<slug>-knowledge-base/`). Only that repo gets the GitHub **`push`** webhook to EDF.

## After scaffold

1. **`EDF_CLIENT_KIT_GIT_URL=… node scripts/setup-edf-kit.mjs`** if quickstart did not auto-clone.
2. **`node vendor/edf-client-kit/scripts/edf-launch.mjs`** — `npm install` in the kit.
3. From the **framework** repo: **`npm run quickstart:customer -- --client-root <workspace-repo>`** — bootstrap + **`.cursor/mcp.json`**.

See the framework **`README.md`** and **`examples/cursor-workspace/README.md`**.

## Env (MCP)

| Variable | Purpose |
| -------- | ------- |
| `EDF_BASE_URL` | Same as `DEV_APP_ORIGIN` in `edf.config` (no trailing slash). |
| `EDF_SUPABASE_ACCESS_TOKEN` | Supabase user JWT after sign-in. |

## Updating the kit

`git pull` inside `vendor/edf-client-kit`, or re-run **`setup-edf-kit.mjs`** after removing `vendor/edf-client-kit`.
