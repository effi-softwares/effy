import { describe, expect, it, vi } from "vitest";

vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query: vi.fn(),
}));

import * as repo from "./repository";
import type { ActivityRow } from "./repository";
import { readActivity } from "./service";

function row(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: "fe-1",
    at: new Date("2026-09-14T03:00:00Z"),
    actorName: "Maya",
    actorWasStaff: true,
    kind: "state_changed",
    orderNumber: "EFY-4415",
    productName: null,
    quantity: null,
    amount: null,
    reason: "ready_for_pickup",
    ...over,
  };
}

describe("team activity attribution (FR-014)", () => {
  it("names the staff member who acted", async () => {
    vi.spyOn(repo, "readTeamActivity").mockResolvedValue([row()]);
    const { entries } = await readActivity("shop-1");
    expect(entries[0]!.actor).toEqual({ kind: "staff", name: "Maya" });
  });

  it("⚠ says a former colleague acted, rather than leaving it blank", async () => {
    // 020: a NULL actor means "the person is gone", never "nobody did it". An action with no author
    // is the opposite of what an accountability log is for.
    vi.spyOn(repo, "readTeamActivity").mockResolvedValue([
      row({ actorName: null, actorWasStaff: true }),
    ]);
    const { entries } = await readActivity("shop-1");
    expect(entries[0]!.actor).toEqual({ kind: "former_staff" });
  });

  it("⚠ attributes platform actions to Effy, never to an Effy employee by name", async () => {
    vi.spyOn(repo, "readTeamActivity").mockResolvedValue([
      row({ kind: "stock_changed", actorName: null, actorWasStaff: false, productName: "Milk", quantity: -3, reason: "order_paid" }),
    ]);
    const { entries } = await readActivity("shop-1");
    // The shop learns that Effy did something, not which person at Effy — the same boundary
    // 023 FR-018 draws for customer data, applied to Effy's own people.
    expect(entries[0]!.actor).toEqual({ kind: "effy" });
    expect(JSON.stringify(entries)).not.toContain("staff");
  });

  it("carries each kind's own facts, and nothing else", async () => {
    vi.spyOn(repo, "readTeamActivity").mockResolvedValue([
      row({ kind: "item_unavailable", productName: "Oat milk", quantity: 2 }),
      row({ id: "rf-1", kind: "refund_issued", amount: "5.40" }),
      row({ id: "sm-1", kind: "stock_changed", productName: "Eggs", quantity: 12, reason: "received" }),
    ]);
    const { entries } = await readActivity("shop-1");

    expect(entries[0]!.action).toEqual({
      kind: "item_unavailable",
      orderNumber: "EFY-4415",
      productName: "Oat milk",
      quantity: 2,
    });
    expect(entries[1]!.action).toEqual({
      kind: "refund_issued",
      orderNumber: "EFY-4415",
      amount: "5.40",
    });
    expect(entries[2]!.action).toEqual({
      kind: "stock_changed",
      productName: "Eggs",
      reason: "received",
      delta: 12,
    });
  });

  it("marks problems with a tone the UI renders as a dot, not as text colour", async () => {
    vi.spyOn(repo, "readTeamActivity").mockResolvedValue([
      row({ kind: "item_unavailable" }),
      row({ id: "fe-2", kind: "item_gathered" }),
      row({ id: "fe-3", kind: "note_added" }),
    ]);
    const { entries } = await readActivity("shop-1");
    expect(entries.map((e) => e.tone)).toEqual(["problem", "done", "neutral"]);
  });
});
