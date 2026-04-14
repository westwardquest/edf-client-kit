# EDF client workspace — agent instructions

When the user asks to **initialise the workspace on the ticketing system** (or similar), use this checklist.

## Preconditions

- **`edf.config`** exists at the workspace repo root (from `templates/edf.config.example`). **`WORKSPACE_SLUG`** equals the **main workspace repo folder name** (not the knowledge repo).
- **`workspace-users.json`** lists `developers` and `clients` by **email** (see `templates/workspace-users.json.example`). Adding memberships for other users requires those emails to exist in Supabase Auth first (see the framework repo `docs/workspace_auth_and_rls.md`).
- The **knowledge** repository is the folder named **`<WORKSPACE_SLUG>-knowledge-base`** (often **nested** under the workspace repo). The `workspace` row’s **`git_repo_url`** must point to that repo’s **HTTPS** URL (not the app source repo).

## Steps

1. Read **`edf.config`** for `WORKSPACE_NAME`, `WORKSPACE_SLUG`, and `KNOWLEDGE_REPO_HTTPS` (or build `https://github.com/<GITHUB_OWNER>/<WORKSPACE_SLUG>-knowledge-base`).
2. If the user has **not** yet run **`npm run quickstart:customer -- --client-root <this-repo>`** from the framework monoreorepo, tell them to do so after sign-in so **`POST /api/workspaces/bootstrap`** runs and **`.cursor/mcp.json`** is written.
3. Use MCP tool **`bootstrap_workspace`** when appropriate: pass `name`, `slug`, and `git_repo_url` set to the **knowledge** repo HTTPS URL only.
4. For ticket work after bootstrap, use **`list_tickets`**, **`get_ticket`**, etc., with `slug` = `WORKSPACE_SLUG`.

## Do not

- Point **`git_repo_url`** at the application repo when it is separate from the knowledge repo (GitHub `push` webhooks would reindex on every code push).
