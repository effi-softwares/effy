import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", () => ({ query, withTransaction: vi.fn() }));

const { readLowStock } = await import("./repository");

const sql = () => String(query.mock.calls.at(-1)?.[0] ?? "").replace(/\s+/g, " ");

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
});

// ── The effective threshold: the product's own if set, else the shop's default (FR-005) ─────────
describe("the restock list (054 US5, FR-029)", () => {
  it("resolves the threshold as product-then-shop-default", async () => {
    await readLowStock("shop-1");
    // ⚠ COALESCE, not a branch in TypeScript. The rule is evaluated per row against thousands of
    // products; pulling it into the service would mean reading every tracked product to filter most
    // of them out again.
    expect(sql()).toContain("COALESCE(p.low_stock_threshold, s.default_low_stock_threshold)");
  });

  it("reports a product at zero even with NO threshold anywhere (FR-005a)", async () => {
    await readLowStock("shop-1");
    // ⚠ A missing threshold means "I have no opinion about running LOW" — not "never tell me about
    // this product". An empty shelf is reported regardless, or a shop that never set a threshold
    // would silently sell nothing.
    expect(sql()).toContain("p.stock_on_hand <= 0 OR (COALESCE");
  });

  it("excludes zero from 'low' so out and low are mutually exclusive", async () => {
    await readLowStock("shop-1");
    // An empty shelf and a thin one need different actions — restock now versus restock soon — and a
    // row claiming both would sort into two places at once.
    expect(sql()).toContain("CASE WHEN p.stock_on_hand <= 0 THEN 'out' ELSE 'low' END");
  });

  it("sorts out-of-stock above low", async () => {
    await readLowStock("shop-1");
    expect(sql()).toContain("ORDER BY (p.stock_on_hand <= 0) DESC");
  });

  it("never shows an untracked product (FR-024)", async () => {
    await readLowStock("shop-1");
    expect(sql()).toContain("AND p.stock_tracked");
  });

  it("never shows an archived product — there is nothing to restock", async () => {
    await readLowStock("shop-1");
    expect(sql()).toContain("p.status <> 'archived'");
  });

  it("is scoped to one shop, from the caller's own resolved id", async () => {
    await readLowStock("shop-1");
    expect(sql()).toContain("WHERE p.shop_id = $1");
    expect(query.mock.calls.at(-1)?.[1]).toEqual(["shop-1"]);
  });

  it("maps rows to the DTO the console renders", async () => {
    query.mockResolvedValue({
      rows: [
        { product_id: "p1", name: "Milk", sku: "MLK", on_hand: 0, effective_threshold: 5, severity: "out" },
        { product_id: "p2", name: "Bread", sku: null, on_hand: 3, effective_threshold: 5, severity: "low" },
      ],
    });
    const rows = await readLowStock("shop-1");

    expect(rows).toEqual([
      { productId: "p1", name: "Milk", sku: "MLK", onHand: 0, effectiveThreshold: 5, severity: "out" },
      { productId: "p2", name: "Bread", sku: null, onHand: 3, effectiveThreshold: 5, severity: "low" },
    ]);
  });
});
