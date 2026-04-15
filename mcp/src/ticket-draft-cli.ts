/**
 * CLI for ticket drafts (invoked via tsx from tickets-cli.mjs).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  applyTicketUpdateDraft,
  findWorkspaceRoot,
  rejectTicketUpdateDraft,
  writeTicketDraft,
} from "./ticket-draft";
import { loadWorkspaceConfig } from "./workspace-config";

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === "-h" || cmd === "--help") {
    printUsage();
    process.exit(cmd ? 0 : 1);
  }

  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    throw new Error(
      "edf.config not found — run from the workspace repo root (or a subfolder under it).",
    );
  }

  if (cmd === "draft") {
    if (!argv[1]) {
      console.error("draft requires <ticketUuid>");
      printUsage();
      process.exit(1);
    }
    const ticketId = argv[1];
    const { slug } = loadWorkspaceConfig(workspaceRoot);
    let initial: Parameters<typeof writeTicketDraft>[0]["initial"];
    if (argv[2]) {
      const p = path.resolve(workspaceRoot, argv[2]);
      const raw = fs.readFileSync(p, "utf8");
      initial = JSON.parse(raw) as typeof initial;
    }
    const r = writeTicketDraft({
      workspaceRoot,
      slug,
      ticketId,
      initial,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          draft_path: r.draftRelativePath,
          confirm_token: r.confirm_token,
          absolutePath: r.absolutePath,
        },
        null,
        2,
      ),
    );
    console.error(
      "\nEdit the file if needed, then:\n" +
        `  apply-draft ${r.draftRelativePath} ${r.confirm_token}\n` +
        "Or discard:\n" +
        `  reject-draft ${r.draftRelativePath}\n`,
    );
    return;
  }

  if (cmd === "apply-draft" && argv[1] && argv[2]) {
    const draftPath = argv[1];
    const confirmToken = argv[2];
    const r = await applyTicketUpdateDraft({
      workspaceRoot,
      draftPath,
      confirmToken,
    });
    console.log(r.summary);
    if (!r.ok) {
      process.exit(1);
    }
    return;
  }

  if (cmd === "reject-draft" && argv[1]) {
    const draftPath = argv[1];
    const r = rejectTicketUpdateDraft({ workspaceRoot, draftPath });
    console.log(r.summary);
    if (!r.ok) {
      process.exit(1);
    }
    return;
  }

  printUsage();
  process.exit(1);
}

function printUsage() {
  console.error(`Usage:
  npx tsx mcp/src/ticket-draft-cli.ts draft <ticketUuid> [initial.json]
  npx tsx mcp/src/ticket-draft-cli.ts apply-draft <draft-relative-path> <confirm_token>
  npx tsx mcp/src/ticket-draft-cli.ts reject-draft <draft-relative-path>
`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
