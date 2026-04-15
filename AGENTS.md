# EDF client workspace — agent instructions

## Canonical copy

This file lives under **`vendor/edf-client-kit/AGENTS.md`**. The workspace root **`AGENTS.md`** is a short pointer so you can override behaviour locally without forking the kit.

---

## Git and deploy

Do **not** run **`git push`** (or equivalent: `gh repo sync`, force-push, etc.) to **any** remote unless the **developer explicitly asks** to deploy, publish, or push. Treat pushing as a deliberate human step. Local commits are fine when the developer asks for local-only work.

---

## Knowledge articles (business vs technical)

Place Markdown under the nested **`…-knowledge-base/knowledge/`** tree:

| Path | Use |
| ---- | --- |
| **`knowledge/business/`** | Customer-facing / “public to clients” documentation (process, SLAs, onboarding). |
| **`knowledge/technical/`** | Internal-only docs (architecture, runbooks); default visibility is developers-only in the app. |

Other paths under **`knowledge/`** default to internal until classified. Prefer **`business/`** vs **`technical/`** for new articles.

---

## Tickets — workflow (developers)

1. **Create and check out** a branch whose name includes the **ticket number**, e.g. **`ticket-42`** or **`feature/ticket-42`** (stay consistent within the team). Do this **before** you commit work for that ticket. A conventional commit prefix on whatever branch you happen to be on (e.g. `feat(ticket#42): …` on **`main`**) is **not** a substitute—ticket work belongs on a **dedicated branch**, not only in the message.
2. After pushing the branch or opening a PR, set the ticket’s **`code_link_url`** in the app (or via **`update_ticket`** MCP / **`PATCH`** API) to the branch or PR URL so work is traceable.
3. Use **`list_priority_active_tickets`** (MCP) or **`npm run edf:tickets:queue`** to see the highest-priority **active** queue without listing every ticket.

---

## Tickets — updates and comments (YAML draft)

For **agent-driven** ticket changes (fields and/or **customer-facing** comments), use the **draft → review → apply** flow—**not** raw **`update_ticket`** / **`add_ticket_comment`** unless the user explicitly asks for a direct API update.

1. **`draft_ticket_update`** — writes **`.edf/ticket-drafts/<slug>-<ticket-id>-<id>.ticket_draft`** (YAML). Optional PATCH fields and an optional **`comment`** block (same shape as the HTTP API).
2. The user (or you) **edits** the file; humans can **Apply** / **Discard** via the optional **`edf-tools`** VS Code extension (**Command Palette → “EDF: Apply ticket draft”** / **“EDF: Discard ticket draft”**) or run **`apply_ticket_update_draft`** / **`reject_ticket_update_draft`** (MCP) / CLI (see below).
3. **`apply_ticket_update_draft`** — requires **`draft_path`** and **`confirm_token`** from the file; runs **PATCH** then optional **POST comment**, then **deletes** the draft.

Ticket comments in the draft should stay **customer-facing**: clear, professional, and **not** overly technical. **Avoid** pasted code, stack traces, and internal file paths unless the customer asked for that detail.

**If the user explicitly wants a direct update** (no file): they must say so; then **`update_ticket`** / **`add_ticket_comment`** are allowed. When **`EDF_MCP_STRICT_UPDATES=1`** is set in the MCP server env, those direct tools are **omitted**—use drafts only.

---

## Before a push (when the developer asked to push)

Summarise **ticket updates** and anything else you intend to do on the remote. Let the developer **accept**, **edit**, **ask you to revise**, or **reject** before you run **`git push`**—do not treat push as automatic after edits.

---

## Tickets — MCP first (read this first)

**Prefer the `edf-tickets` MCP tools** whenever they appear in your tool list (`list_tickets`, `list_priority_active_tickets`, `get_ticket`, `draft_ticket_update`, `apply_ticket_update_draft`, `reject_ticket_update_draft`, `update_ticket`, `add_ticket_comment`, `search_tickets`, `bootstrap_workspace`). They call the same HTTP API as the app and are the default way to work with tickets in Cursor. Prefer **`draft_ticket_update`** for mutations unless the user asked for direct **`update_ticket`** / **`add_ticket_comment`**.

**If MCP tools are not available** (tools not listed, or calls fail after fixing auth), use the **Shell** tool from the **workspace repo root** and run the npm scripts below—the CLI uses the same API and **`edf.config`** / **`.cursor/mcp.json`** token.

```bash
npm run edf:tickets
npm run edf:tickets:queue
npm run edf:ticket -- <ticket-uuid>
npm run edf:tickets:lookup -- "search text"
npm run edf:ticket:patch -- <ticket-uuid> path/to/patch.json
npm run edf:ticket:draft -- <ticket-uuid>   # optional: path/to/initial.json
npm run edf:ticket:apply-draft -- .edf/ticket-drafts/<file>.ticket_draft <confirm_token>
npm run edf:ticket:reject-draft -- .edf/ticket-drafts/<file>.ticket_draft
```

Or run **`node vendor/edf-client-kit/mcp/tickets-cli.mjs`** with subcommands `list` (**`--queue`** for the active priority queue), `get`, `lookup`, **`patch`**, **`draft`**, **`apply-draft`**, **`reject-draft`**.

**Do not** tell the user you “cannot” access tickets—use MCP when present, otherwise run the CLI commands above and report the output. If the command errors (401, missing token), tell them to create a **personal access token** in the app (**Settings → Personal access tokens** on the same deployment as **`EDF_BASE_URL`**) and set **`EDF_PERSONAL_ACCESS_TOKEN`** in **`.cursor/mcp.json`**. The MCP and CLI do **not** use `EDF_SUPABASE_ACCESS_TOKEN`.

**Do not** paste contents of **`.cursor/mcp.json`** into chat (it contains a bearer token).

---

## MCP in Cursor (enable `edf-tickets`)

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
2. Use MCP tool **`bootstrap_workspace`** when that tool is available; otherwise direct the user to the app or quickstart for bootstrap.
3. For ticket lists and updates, **use MCP tools first**; fall back to the **`npm run edf:*`** CLI commands in the previous section when MCP is unavailable.
4. If the user asks to add/remove members and you have no membership API, direct them to the framework app; do not fake this via local files.

## Do not

- Commit ticket work only by changing the **commit message** (e.g. `feat(ticket#N):`) while staying on **`main`** / another shared branch—**use a ticket branch** (see **Tickets — workflow**).
- Apply ticket updates or post comments **without** going through **`draft_ticket_update`** → review → **`apply_ticket_update_draft`** (or explicit user approval to use direct tools).
- Point **`git_repo_url`** at the application repo when it is separate from the knowledge repo (GitHub `push` webhooks would reindex on every code push).
- Create or edit local membership JSON as if it updates Supabase.
