import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ changes: [] as unknown[] }));
const rows = vi.hoisted(() => ({ value: [] as Array<{ shop_id: string }> }));

vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query: vi.fn(async () => ({ rows: rows.value, rowCount: rows.value.length })),
}));
vi.mock("@effy/edge-shared/live", () => ({
  announce: vi.fn(async (changes: unknown[]) => {
    sent.changes = changes;
  }),
  announceMoves: vi.fn(),
}));

import { announceCheckedIn, announceStop } from "./announce";

beforeEach(() => {
  sent.changes = [];
});

/**
 * 073 (S3) — A HUB CHECK-IN TELLS THE SHOPS. Until 073 it told back-office only, so every shop
 * console whose packages had just reached the hub kept showing them as it last read them.
 */
describe("announceCheckedIn", () => {
  it("tells back-office and every shop whose packages were on the round — and nobody else", async () => {
    rows.value = [{ shop_id: "shop-a" }, { shop_id: "shop-b" }];
    await announceCheckedIn("round-1");
    expect(sent.changes).toEqual([
      { scope: "ops", kind: "dispatch" },
      { scope: "ops", kind: "orders" },
      { scope: "shop", shopId: "shop-a", kind: "orders" },
      { scope: "shop", shopId: "shop-b", kind: "orders" },
    ]);
  });

  // The customer's one-word stage does not change at a check-in.
  it("never tells a customer", async () => {
    rows.value = [{ shop_id: "shop-a" }];
    await announceCheckedIn("round-1");
    expect(sent.changes.some((c) => (c as { scope: string }).scope === "customer")).toBe(false);
  });
});

describe("announceStop", () => {
  it("tells the shops at that stop, and back-office", async () => {
    rows.value = [{ shop_id: "shop-c" }];
    await announceStop("stop-1");
    expect(sent.changes).toContainEqual({ scope: "shop", shopId: "shop-c", kind: "orders" });
    expect(sent.changes).toContainEqual({ scope: "ops", kind: "orders" });
  });
});
