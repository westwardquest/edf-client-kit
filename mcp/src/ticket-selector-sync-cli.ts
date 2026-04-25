/**
 * stdin: JSON body from GET /api/w/.../tickets (list or queue list; must include ok + tickets).
 * argv: workspaceRoot slug
 */
import * as fs from "node:fs";

import {
  incomingTicketsFromApiListBody,
  syncCanonicalTicketSelector,
} from "./ticket-selector-file";

async function main() {
  const workspaceRoot = process.argv[2];
  const slug = process.argv[3];
  if (!workspaceRoot || !slug) {
    console.error("usage: ticket-selector-sync-cli <workspaceRoot> <slug> <stdin JSON>");
    process.exit(2);
  }
  const raw = fs.readFileSync(0, "utf8");
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch (e) {
    console.error(
      e instanceof Error ? e.message : "invalid JSON on stdin",
    );
    process.exit(1);
  }
  const incoming = incomingTicketsFromApiListBody(body);
  if (incoming.length === 0) {
    process.exit(0);
  }
  const r = await syncCanonicalTicketSelector({
    workspaceRoot,
    slug,
    incoming,
  });
  if (!r.ok) {
    console.error(r.reason);
    process.exit(1);
  }
}

void main();
