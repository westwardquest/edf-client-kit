# EDF client workspace — agent instructions

## Agent sessions (most Cursor chats — read this first)

**Coding agents and many Cursor chats do not expose MCP tools** (`list_tickets`, etc.). You will not see `edf-tickets` in your tool list. **That is normal.**

To list or fetch tickets you **must** use the **Shell** tool from the **workspace repo root**:

```bash
npm run edf:tickets
```

Same HTTP API as MCP: `GET /api/w/{slug}/tickets`. Reads **`WORKSPACE_SLUG`** and **`DEV_APP_ORIGIN`** from **`edf.config`**, and **`EDF_PERSONAL_ACCESS_TOKEN`** from the environment or **`.cursor/mcp.json`** (`mcpServers.edf-tickets.env`).

Other commands:

```bash
npm run edf:ticket -- <ticket-uuid>
npm run edf:tickets:lookup -- "search text"
```

Or run **`node vendor/edf-client-kit/mcp/tickets-cli.mjs list`** directly.

**Do not** tell the user you “cannot” pull live tickets because MCP is unavailable — **run the commands above** and report the output. If the command errors (401, missing token), tell them to create a **personal access token** in the app (**Settings → Personal access tokens** on the same deployment as **`EDF_BASE_URL`**) and set **`EDF_PERSONAL_ACCESS_TOKEN`** in **`.cursor/mcp.json`**. The MCP and CLI do **not** use `EDF_SUPABASE_ACCESS_TOKEN`.

**Do not** paste contents of **`.cursor/mcp.json`** into chat (it contains a bearer token).

---

## When MCP tools *are* available (rare in agent mode)

If **`list_tickets`** / **`get_ticket`** appear in your tool list, you may use those instead of the CLI. **Do not** call `list_mcp_resources` or similar unless your environment documents it — prefer the CLI when unsure.

If ticket calls return **401**, the PAT may be wrong, revoked, or created on a different deployment than **`EDF_BASE_URL`**. There is no `refresh_supabase_session` tool — issue a new PAT in the app if needed.

---

## MCP in Cursor (when you want `edf-tickets` in the IDE)

1. **Open the client workspace folder as the Cursor project root** (the folder that contains `.cursor/mcp.json` and `vendor/edf-client-kit`). Opening only a subfolder breaks `${workspaceFolder}` in the MCP config.
2. **Enable the server in Cursor (required once per machine/workspace):** **Settings → Features → Model Context Protocol** → find **edf-tickets** → **toggle on**. Quickstart and repo files **cannot** enable this for you; Cursor stores the toggle in the IDE, not in `mcp.json`. If ticket tools never appear, this is the first thing to check.
3. **Config shape:** stdio servers must include **`"type": "stdio"`**. **`args`** must use **`${workspaceFolder}/vendor/edf-client-kit/...`** full paths for **`tsx`** and **`mcp/src/index.ts`** — Cursor resolves bare `node_modules/...` from the workspace root and will fail to find `tsx`. Re-run **`npm run quickstart:customer -- --client-root <path-to-this-workspace>`** from the framework repo if your `.cursor/mcp.json` predates that fix.
4. **Auth:** **`EDF_PERSONAL_ACCESS_TOKEN`** (full `edf_pat_…`) and **`EDF_BASE_URL`** are **required** in `mcp.json` `env`. After updating the token, restart Cursor or reload MCP.

### For agents

If the user expects MCP ticket tools but they are missing, **tell them explicitly** to enable **edf-tickets** in **Cursor Settings → Features → Model Context Protocol** (step 2 above). Do not assume quickstart already turned it on.

---

## Preconditions

- **`edf.config`** exists at the workspace repo root. **`WORKSPACE_SLUG`** equals the **main workspace repo folder name** (not the knowledge repo).
- **`.cursor/mcp.json`** exists and points MCP at `vendor/edf-client-kit` (written by quickstart; gitignored). It must include a non-empty **`EDF_PERSONAL_ACCESS_TOKEN`** for MCP/CLI to work.
- The **knowledge** repository is the folder named **`<WORKSPACE_SLUG>-knowledge-base`** (often **nested** under the workspace repo). The `workspace` row’s **`git_repo_url`** must point to that repo’s **HTTPS** URL (not the app source repo).

## Steps

1. Read **`edf.config`** for `WORKSPACE_NAME`, `WORKSPACE_SLUG`, and `KNOWLEDGE_REPO_HTTPS` (or build `https://github.com/<GITHUB_OWNER>/<WORKSPACE_SLUG>-knowledge-base`).
2. Use MCP tool **`bootstrap_workspace`** only if that tool is available; otherwise direct the user to the app or quickstart for bootstrap.
3. For ticket lists, **`npm run edf:tickets`** (see above) unless MCP ticket tools are in your tool list.
4. If the user asks to add/remove members and you have no membership API, direct them to the framework app; do not fake this via local files.

## Do not

- Point **`git_repo_url`** at the application repo when it is separate from the knowledge repo (GitHub `push` webhooks would reindex on every code push).
- Create or edit local membership JSON as if it updates Supabase.
