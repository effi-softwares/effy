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
