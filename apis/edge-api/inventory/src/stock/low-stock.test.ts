import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
// Partial mock: the low-stock SQL fragments are shared with Today, so the real constants are kept.
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query,
  withTransaction: vi.fn(),
}));

const { readLowStock } = await import("./repository");

const sql = () => String(query.mock.calls.at(-1)?.[0] ?? "").replace(/\s+/g, " ");

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
});

// The effective threshold: the variant's own if set, else the shop's default.
describe("the restock list (054 US5, FR-029)", () => {
  it("resolves the threshold as product-then-shop-default", async () => {
    await readLowStock("shop-1");
    // COALESCE in SQL, not a TypeScript branch, so untracked rows are never read.
    expect(sql()).toContain("COALESCE(v.low_stock_threshold, s.default_low_stock_threshold)");
  });

  it("reports a product at zero even with NO threshold anywhere (FR-005a)", async () => {
    await readLowStock("shop-1");
    // No threshold means no opinion about running low; an empty shelf is still reported.
    expect(sql()).toContain("v.stock_on_hand <= 0 OR (COALESCE");
  });

  it("excludes zero from 'low' so out and low are mutually exclusive", async () => {
    await readLowStock("shop-1");
    // Out and low are different actions, so a row is never both.
    expect(sql()).toContain("CASE WHEN v.stock_on_hand <= 0 THEN 'out' ELSE 'low' END");
  });

  it("sorts out-of-stock above low", async () => {
    await readLowStock("shop-1");
    expect(sql()).toContain("ORDER BY (v.stock_on_hand <= 0) DESC");
  });

  it("never shows an untracked product (FR-024)", async () => {
    await readLowStock("shop-1");
    expect(sql()).toContain("WHERE v.shop_id = $1 AND v.stock_tracked");
  });

  it("098 — never shows a removed variant: it is history, not a shelf", async () => {
    await readLowStock("shop-1");
    expect(sql()).toContain("v.state <> 'removed'");
  });

  it("never shows an archived product — there is nothing to restock", async () => {
    await readLowStock("shop-1");
    expect(sql()).toContain("p.status <> 'archived'");
  });

  it("is scoped to one shop, from the caller's own resolved id", async () => {
    await readLowStock("shop-1");
    expect(sql()).toContain("WHERE v.shop_id = $1");
    expect(query.mock.calls.at(-1)?.[1]).toEqual(["shop-1"]);
  });

  it("maps rows to the DTO the console renders", async () => {
    query.mockResolvedValue({
      rows: [
        { product_id: "p1", variant_id: "v1", name: "Milk", variant_label: null, sku: "MLK", on_hand: 0, effective_threshold: 5, severity: "out" },
        { product_id: "p2", variant_id: "v2", name: "Bread", variant_label: "Large", sku: null, on_hand: 3, effective_threshold: 5, severity: "low" },
      ],
    });
    const rows = await readLowStock("shop-1");

    expect(rows).toEqual([
      { productId: "p1", variantId: "v1", name: "Milk", variantLabel: null, sku: "MLK", onHand: 0, effectiveThreshold: 5, severity: "out" },
      { productId: "p2", variantId: "v2", name: "Bread", variantLabel: "Large", sku: null, onHand: 3, effectiveThreshold: 5, severity: "low" },
    ]);
  });
});
