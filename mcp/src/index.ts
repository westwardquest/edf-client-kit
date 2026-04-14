/**
 * Stdio MCP server: calls the app's HTTP API with a Supabase Bearer token
 * or EDF personal access token (EDF_PERSONAL_ACCESS_TOKEN).
 * Run: `npm run mcp:tickets` from this package directory with env set.
 */
import * as fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import * as z from "zod/v4";

const PAT_ENV = "EDF_PERSONAL_ACCESS_TOKEN";
/** Seconds before access JWT exp to proactively refresh */
const JWT_REFRESH_BUFFER_SEC = 120;

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

function hasPersonalAccessToken(): boolean {
  return Boolean(process.env[PAT_ENV]?.trim());
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1];
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

function accessTokenNeedsRefresh(accessToken: string | undefined): boolean {
  if (!accessToken?.trim()) return true;
  const payload = decodeJwtPayload(accessToken);
  if (payload?.exp == null) return true;
  const now = Math.floor(Date.now() / 1000);
  return payload.exp - JWT_REFRESH_BUFFER_SEC <= now;
}

function persistTokensToMcpConfig(access: string, refresh: string): string {
  const mcpPath = process.env.EDF_MCP_CONFIG_PATH?.trim();
  if (!mcpPath) return "";
  try {
    const raw = fs.readFileSync(mcpPath, "utf8");
    const j = JSON.parse(raw) as {
      mcpServers?: {
        "edf-tickets"?: { env?: Record<string, string> };
      };
    };
    const server = j.mcpServers?.["edf-tickets"];
    if (server?.env) {
      server.env.EDF_SUPABASE_ACCESS_TOKEN = access;
      server.env.EDF_SUPABASE_REFRESH_TOKEN = refresh;
      fs.writeFileSync(mcpPath, JSON.stringify(j, null, 2) + "\n", "utf8");
      return ` Updated tokens in ${mcpPath}.`;
    }
    return ` (Could not find mcpServers.edf-tickets.env in ${mcpPath})`;
  } catch (e) {
    return ` (Could not update mcp.json: ${e instanceof Error ? e.message : String(e)})`;
  }
}

type EnsureFreshOptions = { force?: boolean };

/**
 * Ensures a valid Supabase access JWT in process.env when using JWT auth (not PAT).
 * No-op when EDF_PERSONAL_ACCESS_TOKEN is set.
 */
async function ensureFreshAccessToken(
  options: EnsureFreshOptions = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (hasPersonalAccessToken()) {
    return { ok: true };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const refreshToken = process.env.EDF_SUPABASE_REFRESH_TOKEN?.trim();
  const access = process.env.EDF_SUPABASE_ACCESS_TOKEN?.trim();

  if (!url || !anon || !refreshToken) {
    return {
      ok: false,
      message:
        "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or EDF_SUPABASE_REFRESH_TOKEN in MCP env. Re-run from the framework repo: npm run quickstart:customer -- --client-root <this-workspace>, or set EDF_PERSONAL_ACCESS_TOKEN.",
    };
  }

  if (
    !options.force &&
    access &&
    !accessTokenNeedsRefresh(access)
  ) {
    return { ok: true };
  }

  const supabase = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error || !data.session) {
    return {
      ok: false,
      message: `Refresh failed: ${error?.message ?? "no session"}. Re-run quickstart --client-root, sign in again in the app, or use a personal access token (EDF_PERSONAL_ACCESS_TOKEN).`,
    };
  }

  const at = data.session.access_token;
  const rt = data.session.refresh_token ?? refreshToken;
  process.env.EDF_SUPABASE_ACCESS_TOKEN = at;
  process.env.EDF_SUPABASE_REFRESH_TOKEN = rt;
  void persistTokensToMcpConfig(at, rt);
  return { ok: true };
}

async function authHeaders(
  contentType?: string,
): Promise<Record<string, string>> {
  if (hasPersonalAccessToken()) {
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

  const fresh = await ensureFreshAccessToken();
  if (!fresh.ok) {
    throw new Error(fresh.message);
  }

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
  options: { isRetry?: boolean } = {},
): Promise<{ text: string; isError?: boolean }> {
  const url = `${baseUrl()}${path}`;
  try {
    const headers = await authHeaders(
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

    if (
      res.status === 401 &&
      !options.isRetry &&
      !hasPersonalAccessToken()
    ) {
      const retryFresh = await ensureFreshAccessToken({ force: true });
      if (retryFresh.ok) {
        return toolJson(method, path, body, { isRetry: true });
      }
    }

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

mcpServer.registerTool(
  "refresh_supabase_session",
  {
    description:
      "Refresh Supabase JWTs using the refresh token (when not using EDF_PERSONAL_ACCESS_TOKEN). Updates this MCP process; if EDF_MCP_CONFIG_PATH is set, also rewrites .cursor/mcp.json. Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and EDF_SUPABASE_REFRESH_TOKEN in MCP env (quickstart writes these).",
    inputSchema: z.object({}),
  },
  async () => {
    if (hasPersonalAccessToken()) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              "Using EDF_PERSONAL_ACCESS_TOKEN — no Supabase session refresh needed.",
          },
        ],
      };
    }

    const refreshed = await ensureFreshAccessToken({ force: true });
    if (!refreshed.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: refreshed.message,
          },
        ],
        isError: true,
      };
    }

    const at = process.env.EDF_SUPABASE_ACCESS_TOKEN?.trim() ?? "";
    const rt = process.env.EDF_SUPABASE_REFRESH_TOKEN?.trim() ?? "";
    const fileNote = persistTokensToMcpConfig(at, rt);

    return {
      content: [
        {
          type: "text" as const,
          text:
            `Session refreshed. Ticket API calls in this MCP process should work now.${fileNote} If tools still see 401, reload the edf-tickets MCP server once.`,
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((error) => {
  console.error("edf-tickets MCP:", error);
  process.exit(1);
});
