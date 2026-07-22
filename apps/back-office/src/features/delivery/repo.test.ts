import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the shared api client so the repo is tested in isolation: we assert the HTTP verb + path each
// function builds (the contract's /admin/v1/delivery-* surface), and that it returns the client's
// value unchanged (DTO≡domain identity map here).
const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();
const del = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    patch: (...a: unknown[]) => patch(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}));

import {
  addPostcodes,
  createOffering,
  createZone,
  getZoneHistory,
  getZonePostcodes,
  listOfferings,
  listShopOptions,
  listZones,
  removePostcode,
  setShopLocation,
  updateOffering,
  updateZone,
} from "./repo";

beforeEach(() => {
  get.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
  post.mockReset().mockResolvedValue({ id: "x" });
  patch.mockReset().mockResolvedValue({ id: "x" });
  del.mockReset().mockResolvedValue(undefined);
});

describe("delivery repo — zones", () => {
  it("lists with encoded page/status/q", async () => {
    await listZones({ page: 2, pageSize: 20, status: "active", q: "mel" });
    expect(get).toHaveBeenCalledWith(
      "/admin/v1/delivery-zones?page=2&pageSize=20&status=active&q=mel",
    );
  });

  it("creates / patches a zone", async () => {
    await createZone({ code: "MEL", name: "Metro" });
    expect(post).toHaveBeenCalledWith("/admin/v1/delivery-zones", { code: "MEL", name: "Metro" });

    await updateZone("z1", { status: "disabled" });
    expect(patch).toHaveBeenCalledWith("/admin/v1/delivery-zones/z1", { status: "disabled" });
  });

  it("lists / adds / removes postcodes and reads audit", async () => {
    await getZonePostcodes("z1", 1, 100);
    expect(get).toHaveBeenCalledWith("/admin/v1/delivery-zones/z1/postcodes?page=1&pageSize=100");

    await addPostcodes("z1", { postcodes: ["3000"] });
    expect(post).toHaveBeenCalledWith("/admin/v1/delivery-zones/z1/postcodes", { postcodes: ["3000"] });

    await removePostcode("z1", "3000");
    expect(del).toHaveBeenCalledWith("/admin/v1/delivery-zones/z1/postcodes/3000");

    await getZoneHistory("z1", 1, 10);
    expect(get).toHaveBeenCalledWith("/admin/v1/delivery-zones/z1/audit?page=1&pageSize=10");
  });
});

describe("delivery repo — offerings", () => {
  it("lists with zone filters", async () => {
    await listOfferings({ page: 1, pageSize: 50, originZoneId: "z1", destinationZoneId: "z2" });
    expect(get).toHaveBeenCalledWith(
      "/admin/v1/delivery-offerings?page=1&pageSize=50&originZoneId=z1&destinationZoneId=z2",
    );
  });

  it("creates / patches an offering", async () => {
    const body = { originZoneId: "z1", destinationZoneId: "z2", method: "standard" as const, priceAmount: "5.00", leadDaysMin: 2, leadDaysMax: 3 };
    await createOffering(body);
    expect(post).toHaveBeenCalledWith("/admin/v1/delivery-offerings", body);

    await updateOffering("o1", { priceAmount: "6.00" });
    expect(patch).toHaveBeenCalledWith("/admin/v1/delivery-offerings/o1", { priceAmount: "6.00" });
  });
});

describe("delivery repo — shop location", () => {
  it("patches the shop location endpoint", async () => {
    await setShopLocation("s1", { postcode: "3000" });
    expect(patch).toHaveBeenCalledWith("/admin/v1/shops/s1/location", { postcode: "3000" });
  });

  it("lists shop options off the 009 register", async () => {
    get.mockResolvedValueOnce({ items: [{ id: "s1", code: "CMB-01", name: "Colombo" }], total: 1, page: 1, pageSize: 100 });
    const opts = await listShopOptions();
    expect(get).toHaveBeenCalledWith("/admin/v1/shops?page=1&pageSize=100");
    expect(opts).toEqual([{ id: "s1", code: "CMB-01", name: "Colombo" }]);
  });
});
