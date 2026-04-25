# Cursor hooks: lifecycle + gate

Optional **project** hooks for two responsibilities:
- lifecycle orchestration (`sessionStart` / `stop` / `sessionEnd` + tool heartbeat) to ask WarpDesk Tools to start/stop/touch Cursor sessions
- hard pre-tool gate so substantive edits only proceed with valid clock phase + ticket state from **`.warpdesk/clock-local-state.json`**

## Install

1. Ensure **Node.js** is on your PATH (Cursor inherits the environment from your OS login; restart Cursor after installing Node).
2. Copy **`hooks.warpdesk-dev-clock.example.json`** to **`.cursor/hooks.json`** at the workspace repo root (merge with any existing `hooks` keys — do not delete unrelated hooks).
3. Adjust hook **`command`** paths if your kit is not under **`vendor/warpdesk-client-kit/`**.
   - gate script: **`preToolUse-warpdesk-dev-clock.mjs`**
   - lifecycle script: **`lifecycle-warpdesk-clock.mjs`**

## Behaviour

- Resolves the **client** workspace by trying **`cwd`**, **each** entry in **`workspace_roots`** (not only the first — monorepo parents without `warpdesk.config` no longer force a fail-open), then walking up from the **tool target file** when present, until **`warpdesk.config`** exists.
- If no config is found after that, the hook **allows** (fail open for non–WarpDesk trees).
- **Lifecycle hook (`lifecycle-warpdesk-clock.mjs`)**:
  - On **`sessionStart`** (Agent mode), it calls extension control **`/cursor-session/start`** (dev -> cursor handoff).
  - On **`stop`** / **`sessionEnd`**, it calls **`/cursor-session/stop`**.
  - On **`postToolUse`** / **`postToolUseFailure`**, it calls **`/cursor-session/touch`** to keep cursor session ownership fresh.
  - Non-fatal by design (`failClosed: false`) so orchestration issues do not brick Cursor; hard enforcement remains in `preToolUse`.
- Gates tool names in **`WARPDESK_HOOK_EDIT_TOOLS`** (comma-separated); default includes **`Write`**, **`StrReplace`**, and other common edit aliases — extend if your Cursor version uses different names.
- **`Shell` (optional, on by default):** set **`WARPDESK_HOOK_GATE_SHELL=0`** to disable. When enabled, **read-only** commands (e.g. **`git diff`**, **`git status`**, many **`npm run test` / `npx vitest`** patterns) are allowed without the clock. **Suspicious** commands (redirection to a file, **`git commit`**, **`npm install`**, **`copy`/`move`**, **`npx`** not matching a small allowlist, arbitrary **`npm run`**, **`node`**, etc.) require the same dev-clock phase as file-edit tools. Plain **`node`** / **`node.exe`** stays **ambiguous** by default, but **`node -e` / `--eval` text that embeds obvious **`fs`** writes** (e.g. **`writeFileSync`**) is classified as **write**, not ambiguous, so it cannot bypass the clock. **Ambiguous** commands default to **deny when strict cursor mode is on**, and to **allow** when strict mode is off; set **`WARPDESK_HOOK_SHELL_AMBIGUOUS=deny|allow`** to override explicitly. Heuristics are not a full sandbox; review tool output if needed.
- **Allows** path-targeted edits under **`.warpdesk/`**, **`vendor/`**, and **`knowledge/`** (for **`Write`** / **StrReplace**–style tools) without requiring the clock — **except** **`.warpdesk/clock-local-state.json`**, which is always gated: otherwise the agent could forge **phase** / **ticketId** to bypass the hook on the next tool call. **Shell** is not path-parsed the same way; use exemptions above at your own risk.
- **`WARPDESK_HOOK_REQUIRE_CURSOR_PHASE`**: defaults to **on**. Gated writes require **`phase: "cursor"`** so agent edits only run inside an explicit Cursor session. Set **`WARPDESK_HOOK_REQUIRE_CURSOR_PHASE=0`** to restore the legacy rule where **`dev`** is sufficient.
- **`WARPDESK_HOOK_ALLOW_CURSOR_PHASE=1`**: legacy compatibility switch used when strict cursor requirement is off; it allows **`cursor`** alongside **`dev`**.
- When **`phase`** is **`dev`** or **`cursor`** (and Cursor phase is allowed), edits require a **non-empty `ticketId`** in **`clock-local-state.json`**. If **`ticketId`** is missing, the hook **blocks** with a specific message. Set **`WARPDESK_HOOK_ALLOW_NO_TICKET_ID=1`** only to skip that check (e.g. local emergency).
- **`WARPDESK_HOOK_PERMISSION`**: **`deny`** (default) or **`ask`** for any **blocked** tool use (idle phase, missing **`ticketId`**, or gated **Shell** that needs the clock).
- **`WARPDESK_HOOK_RESUME_DEV_ON_STOP=1`** (lifecycle hook): when stop/sessionEnd fires, ask the extension to stop Cursor and immediately start a new dev segment.
- **`WARPDESK_HOOK_DEBUG=1`**: log JSON lines to **stderr** (Hooks output in Cursor) with **`reason`** codes (`tool_not_in_edit_gate_set`, `no_warpdesk_config_resolved`, `exempt_path`, `edit_needs_dev_clock`, etc.). Tool names are matched **case-insensitively** (`write` vs `Write`).
- Input JSON is parsed after removing a leading UTF-8 BOM (`\uFEFF`). If parsing still fails, the hook returns **`deny`** to avoid fail-open writes.
- The example `hooks.warpdesk-dev-clock.example.json` sets **`failClosed: true`** so timeouts/crashes/error output from this hook do not silently allow edits.

See **`AGENTS.md`** in this kit for workflow context (dev vs Cursor clock, **`request_cursor_session`**).
