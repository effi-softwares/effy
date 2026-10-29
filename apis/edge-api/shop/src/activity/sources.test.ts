import { describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), query }));

import { toActivityEntry, type ActivityRow } from "@effy/edge-shared";

import type { Actor } from "../fulfillments/service";
import { orderActivitySource, teamActivitySource } from "./sources";

const SHOP = "33333333-3333-4333-8333-333333333333";

function row(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: "fe-1",
    at: new Date("2026-09-14T03:00:00Z"),
    kind: "orders",
    action: "state_changed",
    actor: "Maya",
    search_text: null,
    facts: { orderNumber: "EFY-4415", reason: "ready_for_pickup", wasStaff: true },
    ...over,
  };
}

const team = teamActivitySource(SHOP);
const entry = (r: ActivityRow) => toActivityEntry(team, r);

describe("team activity (058 FR-014, 104)", () => {
  it("names the staff member who acted, and the order it was on", () => {
    expect(entry(row())).toMatchObject({ title: "Finished picking", subject: "EFY-4415", actor: "Maya", tone: "done" });
  });

  it("⚠ says a former colleague acted, rather than leaving it blank", () => {
    expect(entry(row({ actor: null })).actor).toBe("A former team member");
  });

  it("⚠ attributes platform actions to Effy, never to an Effy employee by name", () => {
    const e = entry(row({ kind: "stock", action: "stock_changed", actor: null, facts: { product: "Milk", quantity: -3, reason: "order_paid", wasStaff: false } }));
    expect(e).toMatchObject({ title: "Sold -3", subject: "Milk", actor: "Effy" });
    // The shop's sources never read back-office staff.
    expect(team.sql).not.toMatch(/admin\.staff/);
  });

  it("says each kind in words, with a problem marked by its tone", () => {
    expect(entry(row({ kind: "picking", action: "item_unavailable", facts: { orderNumber: "EFY-1", product: "Oat milk", quantity: 2, wasStaff: true } })))
      .toMatchObject({ title: "Marked 2 × Oat milk unavailable", subject: "EFY-1", tone: "problem" });
    expect(entry(row({ kind: "refund", action: "refund_issued", facts: { orderNumber: "EFY-2", amount: "5.40", reason: "item_unusable", wasStaff: true } })))
      .toMatchObject({ title: "Issued a refund of $5.40", detail: "Item damaged, spoiled or incorrect", subject: "EFY-2" });
    expect(entry(row({ kind: "stock", action: "stock_changed", facts: { product: "Eggs", quantity: 12, reason: "received", wasStaff: true } })))
      .toMatchObject({ title: "Stock received +12", subject: "Eggs" });
  });

  it("is scoped to the shop on every branch", () => {
    expect(team.args).toEqual([SHOP]);
    expect(team.sql.match(/shop_id = \$1::uuid/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("an order's activity (104)", () => {
  it("refuses a portion that is not this shop's without reading its log", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(orderActivitySource({ shopId: SHOP } as Actor, "f-x")).rejects.toMatchObject({ kind: "not_found" });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]![0])).toContain("shop_id = $2");
  });

  it("reads the portion's log in the order console's own words", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "f-1" }] });
    const source = await orderActivitySource({ shopId: SHOP } as Actor, "f-1");
    expect(source.args).toEqual(["f-1", SHOP]);
    const e = toActivityEntry(source, {
      id: "refund:r-1",
      at: new Date("2026-09-14T03:00:00Z"),
      kind: "refund",
      action: "refund",
      actor: null,
      search_text: null,
      facts: { source: "refund", id: "r-1", amount: "4.50", refund_status: "succeeded", refund_kind: "item", actor_kind: "back_office", actor_name: null },
    });
    expect(e).toMatchObject({ title: "Refund of $4.50 returned", actor: "Effy", tone: "primary" });
  });
});
