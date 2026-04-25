#!/usr/bin/env node
/**
 * Cursor lifecycle hook: coordinate WarpDesk dev/cursor clock transitions.
 *
 * Intended hook events:
 * - sessionStart  -> request cursor-session/start from local WarpDesk Tools control server
 * - stop          -> request cursor-session/stop
 * - sessionEnd    -> request cursor-session/stop
 * - postToolUse / postToolUseFailure -> request cursor-session/touch (session heartbeat)
 *
 * Env (optional):
 * - WARPDESK_HOOK_DEBUG=1                log JSON debug lines to stderr
 * - WARPDESK_HOOK_RESUME_DEV_ON_STOP=1   request stop+resume-dev policy at end-of-session
 */
import fs from "node:fs";
import path from "node:path";

function out(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function dbg(event, payload = {}) {
  if (process.env.WARPDESK_HOOK_DEBUG !== "1") return;
  process.stderr.write(
    `${JSON.stringify({
      tag: "warpdesk-hook-lifecycle",
      event,
      ts: new Date().toISOString(),
      ...payload,
    })}\n`,
  );
}

/**
 * @param {string} p Cursor may send "/c:/foo/bar"
 * @returns {string}
 */
function normalizeCursorPath(p) {
  const s = String(p ?? "").trim();
  if (!s) return "";
  const fileUn = s.match(/^file:\/\/\/\/?([a-zA-Z]):\/?(.*)$/i);
  if (fileUn) {
    return path.join(
      `${fileUn[1].toUpperCase()}:`,
      ...fileUn[2].split(/[/\\]+/).filter(Boolean),
    );
  }
  const m = s.match(/^\/([a-zA-Z]):\/?(.*)$/);
  if (m) {
    return path.join(`${m[1].toUpperCase()}:`, ...m[2].split("/").filter(Boolean));
  }
  return s;
}

/**
 * @param {string} start
 * @returns {string | null}
 */
function findWorkspaceRoot(start) {
  if (!start) return null;
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, "warpdesk.config"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string | null}
 */
function resolveWorkspaceRoot(payload) {
  const candidates = [];
  if (typeof payload.cwd === "string" && payload.cwd.trim()) {
    candidates.push(payload.cwd.trim());
  }
  if (Array.isArray(payload.workspace_roots)) {
    for (const r of payload.workspace_roots) {
      if (typeof r === "string" && r.trim()) candidates.push(r.trim());
    }
  }
  for (const c of candidates) {
    const root = findWorkspaceRoot(normalizeCursorPath(c));
    if (root) return root;
  }
  return null;
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function truthy(v) {
  if (typeof v !== "string") return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * @param {string} eventName
 * @param {string} composerMode
 * @returns {"start"|"stop"|"touch"|null}
 */
function desiredAction(eventName, composerMode) {
  if (eventName === "sessionStart") {
    if (composerMode && composerMode !== "agent") return null;
    return "start";
  }
  if (eventName === "stop" || eventName === "sessionEnd") return "stop";
  if (eventName === "postToolUse" || eventName === "postToolUseFailure")
    return "touch";
  return null;
}

/**
 * @param {string} action
 * @param {string} msg
 * @returns {boolean}
 */
function isBenignControlError(action, msg) {
  const s = String(msg || "").toLowerCase();
  if (action === "start") {
    if (s.includes("already") && s.includes("cursor")) return true;
    if (s.includes("cursor clock is already running")) return true;
  }
  if (action === "stop") {
    if (s.includes("cursor clock is not running")) return true;
    if (s.includes("not running")) return true;
  }
  return false;
}

async function main() {
  let inputRaw = "";
  try {
    inputRaw = fs.readFileSync(0, "utf8");
  } catch (e) {
    dbg("allow_no_stdin", { err: String(e) });
    out({});
    return;
  }

  /** @type {Record<string, unknown>} */
  let payload = {};
  try {
    payload = inputRaw.trim() ? JSON.parse(inputRaw.replace(/^\uFEFF/, "")) : {};
  } catch (e) {
    dbg("allow_bad_json", { err: String(e) });
    out({});
    return;
  }

  const eventName =
    typeof payload.hook_event_name === "string" ? payload.hook_event_name : "";
  const composerMode =
    typeof payload.composer_mode === "string" ? payload.composer_mode : "";
  const action = desiredAction(eventName, composerMode);
  if (!action) {
    dbg("noop_event", { eventName, composerMode });
    out({});
    return;
  }

  const workspaceRoot = resolveWorkspaceRoot(payload);
  if (!workspaceRoot) {
    dbg("noop_no_workspace", { eventName, action });
    out({});
    return;
  }

  const ctrlPath = path.join(workspaceRoot, ".warpdesk", "extension-control.json");
  if (!fs.existsSync(ctrlPath)) {
    dbg("noop_no_control_file", { eventName, action, ctrlPath });
    out({});
    return;
  }

  let control;
  try {
    control = JSON.parse(fs.readFileSync(ctrlPath, "utf8"));
  } catch (e) {
    dbg("noop_control_parse_failed", { eventName, action, err: String(e) });
    out({});
    return;
  }
  if (
    !control ||
    typeof control !== "object" ||
    typeof control.port !== "number" ||
    typeof control.authToken !== "string" ||
    !control.authToken
  ) {
    dbg("noop_bad_control_shape", { eventName, action });
    out({});
    return;
  }

  const endpoint =
    action === "start"
      ? "/cursor-session/start"
      : action === "touch"
        ? "/cursor-session/touch"
        : "/cursor-session/stop";
  const url = `http://127.0.0.1:${control.port}${endpoint}`;
  const body = {
    conversation_id:
      typeof payload.conversation_id === "string" ? payload.conversation_id : null,
    generation_id:
      typeof payload.generation_id === "string" ? payload.generation_id : null,
    source_hook_event: eventName,
    resume_dev:
      action === "stop" ? truthy(process.env.WARPDESK_HOOK_RESUME_DEV_ON_STOP) : false,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${control.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      dbg("control_http_error", {
        eventName,
        action,
        status: res.status,
        body: text,
      });
      out({});
      return;
    }
    const ok = Boolean(json && typeof json === "object" && json.ok === true);
    const err =
      json && typeof json === "object" && typeof json.error === "string"
        ? json.error
        : "";
    if (!ok && !isBenignControlError(action, err)) {
      dbg("control_not_ok", { eventName, action, response: json ?? text });
      out({});
      return;
    }
    dbg("control_ok", {
      eventName,
      action,
      benign: !ok,
      response: json ?? text,
    });
    out({});
  } catch (e) {
    dbg("control_fetch_failed", { eventName, action, err: String(e) });
    out({});
  }
}

main();
