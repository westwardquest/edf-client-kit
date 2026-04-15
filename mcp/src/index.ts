/**
 * Stdio MCP server: ticket tools call the app's HTTP API with a personal access token.
 * Draft tools (`draft_ticket_update`, etc.) also write YAML under `.edf/ticket-drafts/`.
 * Run: `npm run mcp:tickets` from this package directory with env set.
 *
 * Auth: `EDF_PERSONAL_ACCESS_TOKEN` (edf_pat_…) from app Settings → Personal access tokens.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { loadWorkspaceConfig } from "./workspace-config";
import {
  applyTicketUpdateDraft,
  findWorkspaceRoot,
  rejectTicketUpdateDraft,
  writeTicketDraft,
} from "./ticket-draft";

const PAT_ENV = "EDF_PERSONAL_ACCESS_TOKEN";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

function baseUrl(): string {
  return requireEnv("EDF_BASE_URL").replace(/\/$/, "");
}

function authHeaders(contentType?: string): Record<string, string> {
  const pat = requireEnv(PAT_ENV);
  const h: Record<string, string> = {
    Authorization: `Bearer ${pat}`,
    Accept: "application/json",
  };
  if (contentType) {
    h["Content-Type"] = contentType;
  }
  return h;
}

async function toolJson(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ text: string; isError?: boolean }> {
  const url = `${baseUrl()}${path}`;
  try {
    const headers = authHeaders(
      body !== undefined ? "application/json" : undefined,
    );
    const res = await fetch(url, {
      method,
      headers,
      body:
        body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const summary = `${res.status} ${res.statusText}\n${text}`;
    if (!res.ok) {
      return { text: summary, isError: true };
    }
    return { text: summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      text: `fetch failed: ${msg}`,
      isError: true,
    };
  }
}

const mcpServer = new McpServer({
  name: "edf-tickets",
  version: "0.1.0",
});

/** When set, registers legacy tools `update_ticket` and `add_ticket_comment`. Default is draft-only (`draft_ticket_update` / `apply_ticket_update_draft`). */
const allowDirectTicketUpdates =
  process.env.EDF_MCP_ALLOW_DIRECT_UPDATES === "1" ||
  process.env.EDF_MCP_ALLOW_DIRECT_UPDATES === "true";

mcpServer.registerTool(
  "bootstrap_workspace",
  {
    description:
      "Create workspace + your developer membership (POST /api/workspaces/bootstrap). Use after local scaffold; read edf.config for name/slug and knowledge repo URL. Requires EDF_PERSONAL_ACCESS_TOKEN in MCP env.",
    inputSchema: {
      name: z.string().min(1).describe("Workspace display name"),
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .describe("Workspace slug (must match main repo folder name)"),
      git_repo_url: z
        .string()
        .url()
        .optional()
        .describe(
          "HTTPS URL of the knowledge-only repo (…/<slug>-knowledge-base)",
        ),
    },
  },
  async ({ name, slug, git_repo_url }) => {
    let r: { text: string; isError?: boolean };
    try {
      r = await toolJson("POST", "/api/workspaces/bootstrap", {
        name,
        slug,
        ...(git_repo_url ? { git_repo_url } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r = { text: msg, isError: true };
    }
    return {
      content: [{ type: "text" as const, text: r.text }],
      ...(r.isError ? { isError: true as const } : {}),
    };
  },
);

mcpServer.registerTool(
  "list_tickets",
  {
    description:
      "List tickets in a workspace (same as GET /api/w/{slug}/tickets).",
    inputSchema: {
      slug: z.string().describe("Workspace slug"),
      limit: z.number().int().min(1).max(100).optional(),
      status: z
        .enum([
          "draft",
          "open",
          "in_progress",
          "blocked",
          "waiting_on_client",
          "done",
          "closed",
        ])
        .optional(),
    },
  },
  async ({ slug, limit, status }) => {
    const q = new URLSearchParams();
    if (limit != null) {
      q.set("limit", String(limit));
    }
    if (status) {
      q.set("status", String(status));
    }
    const qs = q.toString();
    const path = `/api/w/${encodeURIComponent(slug)}/tickets${qs ? `?${qs}` : ""}`;
    let r: { text: string; isError?: boolean };
    try {
      r = await toolJson("GET", path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r = { text: msg, isError: true };
    }
    return {
      content: [{ type: "text" as const, text: r.text }],
      ...(r.isError ? { isError: true as const } : {}),
    };
  },
);

mcpServer.registerTool(
  "get_ticket",
  {
    description: "Get one ticket with comments (GET /api/w/{slug}/tickets/{id}).",
    inputSchema: {
      slug: z.string().describe("Workspace slug"),
      ticketId: z.string().uuid().describe("Ticket UUID"),
    },
  },
  async ({ slug, ticketId }) => {
    const path = `/api/w/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(ticketId)}`;
    let r: { text: string; isError?: boolean };
    try {
      r = await toolJson("GET", path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r = { text: msg, isError: true };
    }
    return {
      content: [{ type: "text" as const, text: r.text }],
      ...(r.isError ? { isError: true as const } : {}),
    };
  },
);

mcpServer.registerTool(
  "list_priority_active_tickets",
  {
    description:
      "List highest-priority active work-queue tickets (GET .../tickets?queue=1). Excludes draft, done, closed; ordered by priority_score. Does not replace list_tickets for full history.",
    inputSchema: {
      slug: z.string().describe("Workspace slug"),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ slug, limit }) => {
    const q = new URLSearchParams();
    q.set("queue", "1");
    if (limit != null) {
      q.set("limit", String(limit));
    }
    const path = `/api/w/${encodeURIComponent(slug)}/tickets?${q.toString()}`;
    let r: { text: string; isError?: boolean };
    try {
      r = await toolJson("GET", path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r = { text: msg, isError: true };
    }
    return {
      content: [{ type: "text" as const, text: r.text }],
      ...(r.isError ? { isError: true as const } : {}),
    };
  },
);

const ticketPatchSchema = {
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["bug", "feature", "question", "chore"]).optional(),
  status: z
    .enum([
      "draft",
      "open",
      "in_progress",
      "blocked",
      "waiting_on_client",
      "done",
      "closed",
    ])
    .optional(),
  customer_score: z.number().min(0).max(100).optional(),
  customer_priority: z.enum(["low", "normal", "high", "max"]).optional(),
  assignee_user_id: z.string().uuid().nullable().optional(),
  code_link_url: z.string().nullable().optional(),
  priority_override_reason: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
};

mcpServer.registerTool(
  "draft_ticket_update",
  {
    description:
      "Create a reviewable YAML draft under .edf/ticket-drafts/ (schema .ticket_draft). Edit the file, then call apply_ticket_update_draft with confirm_token. Prefer this over direct updates for agent-driven ticket changes.",
    inputSchema: {
      slug: z.string().describe("Workspace slug (must match edf.config WORKSPACE_SLUG)"),
      ticketId: z.string().uuid().describe("Ticket UUID"),
      ...ticketPatchSchema,
      comment: z
        .object({
          body: z.string().optional(),
          visibility: z.enum(["public", "internal"]).optional(),
          parent_comment_id: z.string().uuid().optional(),
        })
        .optional()
        .describe("Optional comment to post after PATCH"),
    },
  },
  async (args) => {
    const root = findWorkspaceRoot(process.cwd());
    if (!root) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Could not find workspace root (edf.config). Open the client workspace folder in Cursor.",
          },
        ],
        isError: true,
      };
    }
    let cfgSlug: string;
    try {
      ({ slug: cfgSlug } = loadWorkspaceConfig(root));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text" as const, text: msg }],
        isError: true,
      };
    }
    if (cfgSlug !== args.slug) {
      return {
        content: [
          {
            type: "text" as const,
            text: `slug "${args.slug}" does not match edf.config WORKSPACE_SLUG "${cfgSlug}".`,
          },
        ],
        isError: true,
      };
    }
    const {
      slug,
      ticketId,
      comment,
      ...rest
    } = args as Record<string, unknown> & {
      slug: string;
      ticketId: string;
      comment?: {
        body?: string;
        visibility?: "public" | "internal";
        parent_comment_id?: string;
      };
    };
    const initial: Parameters<typeof writeTicketDraft>[0]["initial"] = { ...rest };
    if (comment) {
      initial.comment = comment;
    }
    const r = writeTicketDraft({
      workspaceRoot: root,
      slug,
      ticketId,
      initial,
    });
    const text =
      `Wrote draft file (YAML).\n\n` +
      `draft_path (relative to workspace): ${r.draftRelativePath}\n` +
      `confirm_token: ${r.confirm_token}\n\n` +
      `Edit the file if needed, then run apply_ticket_update_draft with draft_path and confirm_token, or reject_ticket_update_draft to discard.\n` +
      `absolutePath: ${r.absolutePath}`;
    return { content: [{ type: "text" as const, text }] };
  },
);

mcpServer.registerTool(
  "apply_ticket_update_draft",
  {
    description:
      "Apply a ticket draft created by draft_ticket_update: PATCH ticket fields then optional POST comment, then delete the draft file. confirm_token must match the draft file.",
    inputSchema: {
      draft_path: z
        .string()
        .min(1)
        .describe("Path relative to workspace root or absolute path to .ticket_draft file"),
      confirm_token: z.string().min(1).describe("Token from the draft file"),
    },
  },
  async ({ draft_path, confirm_token }) => {
    const root = findWorkspaceRoot(process.cwd());
    if (!root) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Could not find workspace root (edf.config). Open the client workspace folder in Cursor.",
          },
        ],
        isError: true,
      };
    }
    const r = await applyTicketUpdateDraft({
      workspaceRoot: root,
      draftPath: draft_path,
      confirmToken: confirm_token,
    });
    return {
      content: [{ type: "text" as const, text: r.summary }],
      ...(r.ok ? {} : { isError: true as const }),
    };
  },
);

mcpServer.registerTool(
  "reject_ticket_update_draft",
  {
    description: "Delete a ticket draft file without calling the API.",
    inputSchema: {
      draft_path: z
        .string()
        .min(1)
        .describe("Path relative to workspace root or absolute path to .ticket_draft file"),
    },
  },
  async ({ draft_path }) => {
    const root = findWorkspaceRoot(process.cwd());
    if (!root) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Could not find workspace root (edf.config). Open the client workspace folder in Cursor.",
          },
        ],
        isError: true,
      };
    }
    const r = rejectTicketUpdateDraft({ workspaceRoot: root, draftPath: draft_path });
    return {
      content: [{ type: "text" as const, text: r.summary }],
      ...(r.ok ? {} : { isError: true as const }),
    };
  },
);

mcpServer.registerTool(
  "search_tickets",
  {
    description:
      "Search tickets by title, #number, or id prefix (GET .../tickets/lookup?q=).",
    inputSchema: {
      slug: z.string(),
      q: z.string().min(1),
      exclude: z.string().uuid().optional(),
    },
  },
  async ({ slug, q, exclude }) => {
    const params = new URLSearchParams({ q });
    if (exclude) {
      params.set("exclude", exclude);
    }
    const path = `/api/w/${encodeURIComponent(slug)}/tickets/lookup?${params.toString()}`;
    let r: { text: string; isError?: boolean };
    try {
      r = await toolJson("GET", path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r = { text: msg, isError: true };
    }
    return {
      content: [{ type: "text" as const, text: r.text }],
      ...(r.isError ? { isError: true as const } : {}),
    };
  },
);

if (allowDirectTicketUpdates) {
mcpServer.registerTool(
  "update_ticket",
  {
    description:
      "Partial update to a ticket (PATCH .../tickets/{id}). JSON fields optional: title, description, type, status, customer_score (developers) or customer_priority (clients: low|normal|high|max); developers may set assignee_user_id, code_link_url, priority_override_reason, deadline. Attachments are not changed via this tool.",
    inputSchema: {
      slug: z.string(),
      ticketId: z.string().uuid(),
      title: z.string().optional(),
      description: z.string().optional(),
      type: z.enum(["bug", "feature", "question", "chore"]).optional(),
      status: z
        .enum([
          "draft",
          "open",
          "in_progress",
          "blocked",
          "waiting_on_client",
          "done",
          "closed",
        ])
        .optional(),
      customer_score: z.number().min(0).max(100).optional(),
      customer_priority: z
        .enum(["low", "normal", "high", "max"])
        .optional(),
      assignee_user_id: z.string().uuid().nullable().optional(),
      code_link_url: z.string().nullable().optional(),
      priority_override_reason: z.string().nullable().optional(),
      deadline: z.string().nullable().optional(),
    },
  },
  async ({
    slug,
    ticketId,
    title,
    description,
    type,
    status,
    customer_score,
    customer_priority,
    assignee_user_id,
    code_link_url,
    priority_override_reason,
    deadline,
  }) => {
    const body: Record<string, unknown> = {};
    if (title !== undefined) {
      body.title = title;
    }
    if (description !== undefined) {
      body.description = description;
    }
    if (type !== undefined) {
      body.type = type;
    }
    if (status !== undefined) {
      body.status = status;
    }
    if (customer_score !== undefined) {
      body.customer_score = customer_score;
    }
    if (customer_priority !== undefined) {
      body.customer_priority = customer_priority;
    }
    if (assignee_user_id !== undefined) {
      body.assignee_user_id = assignee_user_id;
    }
    if (code_link_url !== undefined) {
      body.code_link_url = code_link_url;
    }
    if (priority_override_reason !== undefined) {
      body.priority_override_reason = priority_override_reason;
    }
    if (deadline !== undefined) {
      body.deadline = deadline;
    }
    const path = `/api/w/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(ticketId)}`;
    let r: { text: string; isError?: boolean };
    try {
      r = await toolJson("PATCH", path, body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r = { text: msg, isError: true };
    }
    return {
      content: [{ type: "text" as const, text: r.text }],
      ...(r.isError ? { isError: true as const } : {}),
    };
  },
);

mcpServer.registerTool(
  "add_ticket_comment",
  {
    description: "Post a comment on a ticket (POST .../tickets/{id}/comments).",
    inputSchema: {
      slug: z.string(),
      ticketId: z.string().uuid(),
      body: z.string().min(1),
      visibility: z.enum(["public", "internal"]).optional(),
      parent_comment_id: z.string().uuid().optional(),
    },
  },
  async ({ slug, ticketId, body, visibility, parent_comment_id }) => {
    const path = `/api/w/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(ticketId)}/comments`;
    let r: { text: string; isError?: boolean };
    try {
      r = await toolJson("POST", path, {
        body,
        ...(visibility ? { visibility } : {}),
        ...(parent_comment_id ? { parent_comment_id } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      r = { text: msg, isError: true };
    }
    return {
      content: [{ type: "text" as const, text: r.text }],
      ...(r.isError ? { isError: true as const } : {}),
    };
  },
);
}

async function main() {
  requireEnv("EDF_BASE_URL");
  requireEnv(PAT_ENV);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((error) => {
  console.error("edf-tickets MCP:", error);
  process.exit(1);
});
