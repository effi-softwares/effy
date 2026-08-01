import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
}));

import {
  addZonePostcodes,
  createOffering,
  createZone,
  listOfferings,
  listZones,
  removeZonePostcode,
  setShopLocation,
  unconfiguredAreas,
} from "./repository";
import { isDeliveryError } from "./types";

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isDeliveryError(e) ? e.kind : "other";
  }
}

// A fake pg client whose query() returns queued results in order; records every call for assertions.
function fakeClient(results: unknown[]) {
  const calls: { text: string; params: unknown[] }[] = [];
  const q = vi.fn((text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    return Promise.resolve(results.shift() ?? { rows: [] });
  });
  return { client: { query: q }, calls };
}
const auditCall = (calls: { text: string; params: unknown[] }[]) =>
  calls.find((c) => c.text.includes("admin.audit_log"));

describe("delivery repository reads", () => {
  beforeEach(() => {
    query.mockReset();
    withTransaction.mockReset();
  });

  it("listZones maps rows, counts postcodes, reads the window total", async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: "z1",
          code: "MEL-METRO",
          name: "Melbourne Metro",
          status: "active",
          postcode_count: "5",
          created_at: new Date("2026-07-21T00:00:00Z"),
          updated_at: new Date("2026-07-21T00:00:00Z"),
          total: "1",
        },
      ],
    });
    const page = await listZones({ page: 1, pageSize: 20, status: null, q: null });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      id: "z1",
      code: "MEL-METRO",
      name: "Melbourne Metro",
      status: "active",
      postcodeCount: 5,
    });
    // GROUP BY the zone so the LEFT JOIN count is per-zone.
    expect((query.mock.calls[0]![0] as string)).toContain("GROUP BY z.id");
  });

  it("listOfferings joins both zones for names and normalises the cutoff time to HH:mm", async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: "o1",
          origin_zone_id: "z1",
          origin_zone_name: "Melbourne Metro",
          destination_zone_id: "z2",
          destination_zone_name: "Geelong",
          method: "same_day",
          price_amount: "7.00",
          lead_days_min: 0,
          lead_days_max: 0,
          same_day_cutoff: "14:00:00",
          status: "active",
          created_at: new Date("2026-07-21T00:00:00Z"),
          updated_at: new Date("2026-07-21T00:00:00Z"),
          total: "1",
        },
      ],
    });
    const page = await listOfferings({ page: 1, pageSize: 50, originZoneId: null, destinationZoneId: null });
    expect(page.items[0]).toMatchObject({
      originZoneName: "Melbourne Metro",
      destinationZoneName: "Geelong",
      priceAmount: "7.00",
      sameDayCutoff: "14:00",
    });
  });
});

describe("delivery repository writes audit inside the transaction", () => {
  beforeEach(() => {
    query.mockReset();
    withTransaction.mockReset();
  });

  it("createZone inserts + audits delivery_zone.create, then re-reads", async () => {
    const { client, calls } = fakeClient([{ rows: [{ id: "z1" }] }, { rows: [] }]);
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(client));
    query.mockResolvedValue({
      rows: [
        {
          id: "z1",
          code: "MEL-METRO",
          name: "Melbourne Metro",
          status: "active",
          postcode_count: "0",
          created_at: new Date(),
          updated_at: new Date(),
          total: "0",
        },
      ],
    });
    const zone = await createZone({ code: "MEL-METRO", name: "Melbourne Metro" }, "actor-1");
    expect(zone.id).toBe("z1");
    const audit = auditCall(calls);
    expect(audit).toBeDefined();
    expect(audit!.params).toEqual([
      "actor-1",
      "delivery_zone.create",
      "delivery_zone",
      "z1",
      expect.stringContaining("MEL-METRO"),
    ]);
  });

  it("createZone maps a 23505 unique_violation to a conflict", async () => {
    const client = { query: vi.fn().mockRejectedValue({ code: "23505" }) };
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(client));
    expect(await kindOf(createZone({ code: "DUP", name: "Dup" }, "actor"))).toBe("conflict");
  });

  it("addZonePostcodes maps a 23505 (postcode already zoned) to a conflict", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "z1" }] }) // zone exists
        .mockRejectedValueOnce({ code: "23505" }), // postcode insert clashes
    };
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(client));
    expect(await kindOf(addZonePostcodes("z1", ["3000"], "actor"))).toBe("conflict");
  });

  it("addZonePostcodes audits postcode_add with the postcode set", async () => {
    const { client, calls } = fakeClient([
      { rows: [{ id: "z1" }] }, // zone exists
      { rows: [{ id: "p1", postcode: "3000" }] }, // insert
      { rows: [] }, // audit
    ]);
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(client));
    const added = await addZonePostcodes("z1", ["3000"], "actor-1");
    expect(added).toEqual([{ id: "p1", postcode: "3000" }]);
    const audit = auditCall(calls);
    expect(audit!.params[1]).toBe("delivery_zone.postcode_add");
    expect(audit!.params[2]).toBe("delivery_zone");
  });

  it("removeZonePostcode 404s when the postcode is not in the zone", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(client));
    expect(await kindOf(removeZonePostcode("z1", "9999", "actor"))).toBe("not_found");
  });

  it("createOffering maps a 23503 FK violation to not_found (zone missing)", async () => {
    const client = { query: vi.fn().mockRejectedValue({ code: "23503" }) };
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(client));
    expect(
      await kindOf(
        createOffering(
          { originZoneId: "z1", destinationZoneId: "zX", method: "standard", priceAmount: "5.00", leadDaysMin: 2, leadDaysMax: 3, sameDayCutoff: null },
          "actor",
        ),
      ),
    ).toBe("not_found");
  });

  it("createOffering maps a 23505 (duplicate leg-method) to a conflict", async () => {
    const client = { query: vi.fn().mockRejectedValue({ code: "23505" }) };
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(client));
    expect(
      await kindOf(
        createOffering(
          { originZoneId: "z1", destinationZoneId: "z2", method: "standard", priceAmount: "5.00", leadDaysMin: 2, leadDaysMax: 3, sameDayCutoff: null },
          "actor",
        ),
      ),
    ).toBe("conflict");
  });

  it("setShopLocation updates the shop postcode + audits shop.location_set", async () => {
    const { client, calls } = fakeClient([
      { rows: [{ id: "s1", code: "CMB-01", name: "Colombo 01", postcode: "3000" }] }, // update returning
      { rows: [] }, // audit
    ]);
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(client));
    const loc = await setShopLocation("s1", "3000", "actor-1");
    expect(loc).toEqual({ shopId: "s1", shopCode: "CMB-01", shopName: "Colombo 01", postcode: "3000" });
    const audit = auditCall(calls);
    expect(audit!.params).toEqual([
      "actor-1",
      "shop.location_set",
      "shop",
      "s1",
      expect.stringContaining("3000"),
    ]);
  });

  it("setShopLocation 404s an unknown shop", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    withTransaction.mockImplementation((fn: (c: unknown) => Promise<unknown>) => fn(client));
    expect(await kindOf(setShopLocation("nope", "3000", "actor"))).toBe("not_found");
  });
});

/* ── ⚠ SC-014: no area may be serviceable to the storefront yet unquotable at checkout ─────────── */

describe("unconfiguredAreas — the SC-014 query", () => {
  /**
   * ⚠ READ THIS BEFORE TRUSTING THIS TEST.
   *
   * This asserts the SHAPE of the query, not its behaviour against real rows — because the admin
   * service has no database in its test run. It mocks `query` at the `@effy/edge-shared` boundary and
   * has no testcontainers, unlike `core-api`.
   *
   * That is a genuine limitation of where this assertion ended up. It was moved here from
   * `core-api`'s testcontainers suite because the FR-028 guard requires `apis/core-api` to have an
   * EMPTY diff — the two could not both be satisfied. The move was right; it simply lands in a service
   * that cannot execute SQL in tests.
   *
   * ⚠ SO THE REAL ASSERTION IS THE OPERATOR WALK. `/delivery-health` must return **3350 and 3550**
   * against live data (T055), and must return empty once REGIONAL is configured (T064). That runs
   * against actual rows, which is stronger than any fixture — but it is a WALK, not a gate, and it
   * will not stop a regression in CI.
   *
   * What this test does catch: someone silently rewriting the predicate so it stops looking for the
   * thing it exists to find.
   */
  it("looks for areas with NO decision and NO active offering", async () => {
    query.mockResolvedValue({ rows: [] });
    await unconfiguredAreas();

    const sql = query.mock.calls[0]![0] as string;

    // The decision record must be LEFT JOINed and required absent — an area someone decided about is
    // not unconfigured, whichever way they decided.
    expect(sql).toMatch(/LEFT JOIN\s+public\.delivery_area_decision/i);
    expect(sql).toMatch(/d\.id IS NULL/i);

    // ⚠ And nothing may be actively offered TO it. This is the REGIONAL half: a zone with postcodes
    // and no inbound offering is exactly the state where the storefront says yes and checkout cannot.
    expect(sql).toMatch(/NOT EXISTS/i);
    expect(sql).toMatch(/destination_zone_id/i);
    expect(sql).toMatch(/status = 'active'/i);
  });

  /** It must start from the ZONE's postcodes — the areas a shopper can actually be in. */
  it("starts from the postcodes assigned to zones", async () => {
    query.mockResolvedValue({ rows: [] });
    await unconfiguredAreas();

    expect(query.mock.calls[0]![0]).toMatch(/FROM\s+public\.delivery_zone_postcode/i);
  });

  it("returns the zone and postcode so an admin can act on it", async () => {
    query.mockResolvedValue({
      rows: [
        { zone_code: "REGIONAL", postcode: "3350" },
        { zone_code: "REGIONAL", postcode: "3550" },
      ],
    });

    expect(await unconfiguredAreas()).toEqual([
      { zoneCode: "REGIONAL", postcode: "3350" },
      { zoneCode: "REGIONAL", postcode: "3550" },
    ]);
  });
});
