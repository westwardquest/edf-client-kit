/**
 * Ticket update drafts: YAML on disk under .edf/ticket-drafts/, apply via PATCH + optional POST comment.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";
import { findWorkspaceRoot } from "../workspace-root.mjs";
import { loadWorkspaceConfig } from "./workspace-config";

export { findWorkspaceRoot };

const DRAFT_SUBDIR = path.join(".edf", "ticket-drafts");

const PATCH_KEYS = [
  "title",
  "description",
  "type",
  "status",
  "customer_score",
  "customer_priority",
  "assignee_user_id",
  "code_link_url",
  "priority_override_reason",
  "deadline",
] as const;

export type PatchKey = (typeof PATCH_KEYS)[number];

export type TicketDraftDoc = {
  schema_version: number;
  workspace_slug: string;
  ticket_id: string;
  confirm_token: string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  customer_score?: number;
  customer_priority?: string;
  assignee_user_id?: string | null;
  code_link_url?: string | null;
  priority_override_reason?: string | null;
  deadline?: string | null;
  comment?: {
    body?: string;
    visibility?: string;
    parent_comment_id?: string;
  };
};

function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

function draftTemplate(
  slug: string,
  ticketId: string,
  token: string,
  initial: Partial<TicketDraftDoc>,
): string {
  const lines: string[] = [
    `# EDF ticket update draft — edit optional fields, then run apply_ticket_update_draft with confirm_token.`,
    `# Delete this file or use reject_ticket_update_draft to discard.`,
    `schema_version: 1`,
    `workspace_slug: ${YAML.stringify(slug).replace(/\n/g, "\n  ")}`,
    `ticket_id: ${ticketId}`,
    `confirm_token: ${token}`,
    ``,
    `# --- PATCH fields (omit a key or leave commented to leave unchanged) ---`,
  ];

  const optionalYaml = (key: string, val: unknown, comment: string) => {
    if (val !== undefined && val !== null && val !== "") {
      lines.push(`${key}: ${YAML.stringify(val).replace(/\n/g, "\n  ")}`);
    } else {
      lines.push(`# ${comment}`);
      lines.push(`# ${key}: ...`);
    }
  };

  optionalYaml("title", initial.title, "string");
  optionalYaml("description", initial.description, "string (markdown)");
  optionalYaml("type", initial.type, "bug | feature | question | chore");
  optionalYaml(
    "status",
    initial.status,
    "draft | open | in_progress | blocked | waiting_on_client | done | closed",
  );
  optionalYaml("customer_score", initial.customer_score, "0–100 (developers)");
  optionalYaml(
    "customer_priority",
    initial.customer_priority,
    "low | normal | high | max (clients)",
  );
  optionalYaml("assignee_user_id", initial.assignee_user_id, "uuid or null");
  optionalYaml("code_link_url", initial.code_link_url, "url or null");
  optionalYaml(
    "priority_override_reason",
    initial.priority_override_reason,
    "string or null",
  );
  optionalYaml("deadline", initial.deadline, "ISO date string or null");

  lines.push(``);
  lines.push(`# --- Optional comment (omit entire comment block to skip) ---`);
  if (initial.comment?.body) {
    lines.push(`comment:`);
    lines.push(`  body: ${YAML.stringify(initial.comment.body).replace(/\n/g, "\n  ")}`);
    if (initial.comment.visibility) {
      lines.push(`  visibility: ${initial.comment.visibility}`);
    }
    if (initial.comment.parent_comment_id) {
      lines.push(`  parent_comment_id: ${initial.comment.parent_comment_id}`);
    }
  } else {
    lines.push(`# comment:`);
    lines.push(`#   body: "..."`);
    lines.push(`#   visibility: public  # or internal`);
  }

  return lines.join("\n") + "\n";
}

export function writeTicketDraft(params: {
  workspaceRoot: string;
  slug: string;
  ticketId: string;
  initial?: Partial<TicketDraftDoc>;
}): { draftRelativePath: string; confirm_token: string; absolutePath: string } {
  const { workspaceRoot, slug, ticketId } = params;
  const token = generateToken();
  const short = crypto.randomBytes(4).toString("hex");
  const name = `${slug}-${ticketId}-${short}.ticket_draft`;
  const dir = path.join(workspaceRoot, DRAFT_SUBDIR);
  fs.mkdirSync(dir, { recursive: true });
  const absolutePath = path.join(dir, name);
  const body = draftTemplate(slug, ticketId, token, params.initial ?? {});
  fs.writeFileSync(absolutePath, body, "utf8");
  const draftRelativePath = path.join(DRAFT_SUBDIR, name);
  return {
    draftRelativePath: draftRelativePath.split(path.sep).join("/"),
    confirm_token: token,
    absolutePath,
  };
}

function parseDraftFile(absPath: string): TicketDraftDoc {
  const raw = fs.readFileSync(absPath, "utf8");
  const doc = YAML.parse(raw) as Record<string, unknown>;
  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid draft: expected YAML object");
  }
  return doc as unknown as TicketDraftDoc;
}

function buildPatchBody(doc: TicketDraftDoc): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const k of PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(doc, k)) {
      body[k] = (doc as Record<string, unknown>)[k];
    }
  }
  return body;
}

async function apiFetch(
  baseUrl: string,
  token: string,
  method: string,
  pathname: string,
  jsonBody?: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
  const url = `${baseUrl}${pathname}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers,
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function applyTicketUpdateDraft(params: {
  workspaceRoot: string;
  draftPath: string;
  confirmToken: string;
}): Promise<{ ok: boolean; summary: string }> {
  const { workspaceRoot, confirmToken } = params;
  const absDraft = path.isAbsolute(params.draftPath)
    ? params.draftPath
    : path.join(workspaceRoot, params.draftPath);

  if (!fs.existsSync(absDraft)) {
    return { ok: false, summary: `Draft file not found: ${absDraft}` };
  }

  const doc = parseDraftFile(absDraft);
  if (doc.schema_version !== 1) {
    return { ok: false, summary: `Unsupported schema_version: ${doc.schema_version}` };
  }
  if (doc.confirm_token !== confirmToken) {
    return { ok: false, summary: "confirm_token does not match this draft file." };
  }

  const { slug, baseUrl, token } = loadWorkspaceConfig(workspaceRoot);
  if (doc.workspace_slug !== slug) {
    return {
      ok: false,
      summary: `Draft workspace_slug (${doc.workspace_slug}) does not match edf.config WORKSPACE_SLUG (${slug}).`,
    };
  }

  const ticketId = doc.ticket_id;
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(ticketId)) {
    return { ok: false, summary: "Invalid ticket_id in draft." };
  }

  const patchBody = buildPatchBody(doc);
  const comment = doc.comment;
  const hasComment =
    comment &&
    typeof comment.body === "string" &&
    comment.body.trim().length > 0;

  if (Object.keys(patchBody).length === 0 && !hasComment) {
    return {
      ok: false,
      summary:
        "Nothing to apply: add at least one PATCH field or a comment.body in the draft.",
    };
  }

  const parts: string[] = [];

  if (Object.keys(patchBody).length > 0) {
    const pathname = `/api/w/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(ticketId)}`;
    const r = await apiFetch(baseUrl, token, "PATCH", pathname, patchBody);
    parts.push(`${r.status} PATCH ${pathname}\n${r.text}`);
    if (!r.ok) {
      return { ok: false, summary: parts.join("\n\n") };
    }
  }

  if (hasComment) {
    const pathname = `/api/w/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(ticketId)}/comments`;
    const commentPayload: Record<string, unknown> = {
      body: String(comment!.body).trim(),
    };
    if (comment!.visibility === "public" || comment!.visibility === "internal") {
      commentPayload.visibility = comment!.visibility;
    }
    if (
      comment!.parent_comment_id &&
      uuidRe.test(comment!.parent_comment_id)
    ) {
      commentPayload.parent_comment_id = comment!.parent_comment_id;
    }
    const r = await apiFetch(baseUrl, token, "POST", pathname, commentPayload);
    parts.push(`${r.status} POST ${pathname}\n${r.text}`);
    if (!r.ok) {
      return { ok: false, summary: parts.join("\n\n") };
    }
  }

  try {
    fs.unlinkSync(absDraft);
  } catch (e) {
    parts.push(
      `Warning: could not delete draft file: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return { ok: true, summary: parts.join("\n\n") };
}

export function rejectTicketUpdateDraft(params: {
  workspaceRoot: string;
  draftPath: string;
}): { ok: boolean; summary: string } {
  const absDraft = path.isAbsolute(params.draftPath)
    ? params.draftPath
    : path.join(params.workspaceRoot, params.draftPath);
  if (!fs.existsSync(absDraft)) {
    return { ok: false, summary: `Draft file not found: ${absDraft}` };
  }
  fs.unlinkSync(absDraft);
  return { ok: true, summary: `Discarded draft: ${absDraft}` };
}
