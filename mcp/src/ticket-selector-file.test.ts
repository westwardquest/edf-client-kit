import { describe, expect, it } from "vitest";

import {
  incomingTicketsFromApiListBody,
  incomingTicketsFromLookupBody,
  parseMcpToolJsonBody,
  sortTicketsByPriority,
  type TicketSelectorEntry,
} from "./ticket-selector-file";

describe("ticket-selector-file", () => {
  it("parseMcpToolJsonBody strips HTTP status line", () => {
    const j = parseMcpToolJsonBody(
      '200 OK\n{"ok":true,"tickets":[]}',
    ) as { ok: boolean };
    expect(j?.ok).toBe(true);
  });

  it("sortTicketsByPriority nulls last then ticket_number", () => {
    const tickets: TicketSelectorEntry[] = [
      {
        id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0001",
        ticket_number: 1,
        title: "low",
        priority_score: null,
      },
      {
        id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0002",
        ticket_number: 3,
        title: "top",
        priority_score: 100,
      },
      {
        id: "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeee0003",
        ticket_number: 2,
        title: "mid",
        priority_score: 50,
      },
    ];
    const s = sortTicketsByPriority(tickets);
    expect(s.map((t) => t.ticket_number)).toEqual([3, 2, 1]);
  });

  it("incomingTicketsFromApiListBody requires ok", () => {
    expect(
      incomingTicketsFromApiListBody({
        ok: true,
        tickets: [
          {
            id: "f8a6c6d1-78b8-4f00-b2d0-fcb8d9b713f7",
            ticket_number: 9,
            title: "Hi",
            priority_score: 1,
          },
        ],
      }),
    ).toHaveLength(1);
    expect(incomingTicketsFromApiListBody({ tickets: [] })).toHaveLength(0);
  });

  it("incomingTicketsFromLookupBody accepts body without ok", () => {
    const rows = incomingTicketsFromLookupBody({
      tickets: [
        {
          id: "f8a6c6d1-78b8-4f00-b2d0-fcb8d9b713f7",
          ticket_number: 2,
          title: "Lookup",
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].priority_score).toBeNull();
  });
});
