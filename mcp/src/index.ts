/**
 * Stdio MCP server: calls the app's HTTP API with a Supabase Bearer token.
 * Run: `npm run mcp:tickets` from this package directory with env set.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

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

function authHeaders(
  contentType?: string,
): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${requireEnv("EDF_SUPABASE_ACCESS_TOKEN")}`,
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
    const res = await fetch(url, {
      method,
      headers:
        body !== undefined
          ? authHeaders("application/json")
          : authHeaders(),
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

mcpServer.registerTool(
  "bootstrap_workspace",
  {
    description:
      "Create workspace + your developer membership (POST /api/workspaces/bootstrap). Use after local scaffold; read edf.config for name/slug and knowledge repo URL.",
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
    const r = await toolJson("POST", "/api/workspaces/bootstrap", {
      name,
      slug,
      ...(git_repo_url ? { git_repo_url } : {}),
    });
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
      q.set("status", status);
    }
    const qs = q.toString();
    const path = `/api/w/${encodeURIComponent(slug)}/tickets${qs ? `?${qs}` : ""}`;
    const r = await toolJson("GET", path);
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
    const r = await toolJson("GET", path);
    return {
      content: [{ type: "text" as const, text: r.text }],
      ...(r.isError ? { isError: true as const } : {}),
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
    const r = await toolJson("GET", path);
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
    const r = await toolJson("POST", path, {
      body,
      ...(visibility ? { visibility } : {}),
      ...(parent_comment_id ? { parent_comment_id } : {}),
    });
    return {
      content: [{ type: "text" as const, text: r.text }],
      ...(r.isError ? { isError: true as const } : {}),
    };
  },
);

async function main() {
  void baseUrl();
  void requireEnv("EDF_SUPABASE_ACCESS_TOKEN");
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((error) => {
  console.error("edf-tickets MCP:", error);
  process.exit(1);
});
