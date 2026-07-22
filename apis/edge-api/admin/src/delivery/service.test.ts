import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listZones: vi.fn(),
  readZone: vi.fn(),
  listZonePostcodes: vi.fn(),
  listZoneHistory: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  addZonePostcodes: vi.fn(),
  removeZonePostcode: vi.fn(),
  listOfferings: vi.fn(),
  offeringFields: vi.fn(),
  createOffering: vi.fn(),
  updateOffering: vi.fn(),
  setShopLocation: vi.fn(),
}));
vi.mock("./repository", () => repo);

import {
  addZonePostcodes,
  createOffering,
  createZone,
  setShopLocation,
  updateOffering,
  updateZone,
} from "./service";
import { isDeliveryError } from "./types";

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isDeliveryError(e) ? e.kind : "other";
  }
}

beforeEach(() => vi.clearAllMocks());

describe("createZone validation", () => {
  it("rejects empty code/name with a validation error and no write", async () => {
    expect(await kindOf(createZone({ code: "", name: "" }, "actor"))).toBe("validation");
    expect(repo.createZone).not.toHaveBeenCalled();
  });

  it("trims and forwards a valid zone", async () => {
    repo.createZone.mockResolvedValue({ id: "z1" });
    await createZone({ code: "  MEL  ", name: "  Metro  " }, "actor");
    expect(repo.createZone).toHaveBeenCalledWith({ code: "MEL", name: "Metro" }, "actor");
  });
});

describe("updateZone validation", () => {
  beforeEach(() => repo.readZone.mockResolvedValue({ id: "z1", name: "Old", status: "active" }));

  it("404s an unknown zone", async () => {
    repo.readZone.mockResolvedValue(null);
    expect(await kindOf(updateZone("z1", { name: "New" }, "actor"))).toBe("not_found");
  });

  it("rejects an empty patch (nothing to update)", async () => {
    expect(await kindOf(updateZone("z1", {}, "actor"))).toBe("validation");
  });

  it("rejects an invalid status value", async () => {
    expect(await kindOf(updateZone("z1", { status: "banished" }, "actor"))).toBe("validation");
  });

  it("applies a partial status change while preserving name", async () => {
    repo.updateZone.mockResolvedValue({ id: "z1" });
    await updateZone("z1", { status: "disabled" }, "actor");
    expect(repo.updateZone).toHaveBeenCalledWith("z1", { name: "Old", status: "disabled" }, "actor");
  });
});

describe("addZonePostcodes validation", () => {
  it("rejects a non-array / empty postcodes", async () => {
    expect(await kindOf(addZonePostcodes("z1", { postcodes: [] }, "actor"))).toBe("validation");
    expect(await kindOf(addZonePostcodes("z1", {}, "actor"))).toBe("validation");
  });

  it("rejects a non-4-digit postcode", async () => {
    expect(await kindOf(addZonePostcodes("z1", { postcodes: ["30"] }, "actor"))).toBe("validation");
  });

  it("dedupes and forwards valid postcodes", async () => {
    repo.addZonePostcodes.mockResolvedValue([]);
    await addZonePostcodes("z1", { postcodes: ["3000", "3000", "3001"] }, "actor");
    expect(repo.addZonePostcodes).toHaveBeenCalledWith("z1", ["3000", "3001"], "actor");
  });
});

describe("createOffering validation", () => {
  const valid = {
    originZoneId: "z1",
    destinationZoneId: "z2",
    method: "standard",
    priceAmount: "5.00",
    leadDaysMin: 2,
    leadDaysMax: 3,
  };

  it("rejects a bad method", async () => {
    expect(await kindOf(createOffering({ ...valid, method: "teleport" }, "actor"))).toBe("validation");
  });

  it("rejects a non-money price", async () => {
    expect(await kindOf(createOffering({ ...valid, priceAmount: "5.999" }, "actor"))).toBe("validation");
  });

  it("rejects leadDaysMax < leadDaysMin", async () => {
    expect(await kindOf(createOffering({ ...valid, leadDaysMin: 3, leadDaysMax: 1 }, "actor"))).toBe(
      "validation",
    );
  });

  it("drops a same-day cutoff for a non-same_day method (data-model §3)", async () => {
    repo.createOffering.mockResolvedValue({ id: "o1" });
    await createOffering({ ...valid, method: "standard", sameDayCutoff: "14:00" }, "actor");
    expect(repo.createOffering).toHaveBeenCalledWith(
      expect.objectContaining({ method: "standard", sameDayCutoff: null }),
      "actor",
    );
  });

  it("keeps a valid cutoff for same_day", async () => {
    repo.createOffering.mockResolvedValue({ id: "o1" });
    await createOffering(
      { originZoneId: "z1", destinationZoneId: "z2", method: "same_day", priceAmount: "7.00", leadDaysMin: 0, leadDaysMax: 0, sameDayCutoff: "14:00" },
      "actor",
    );
    expect(repo.createOffering).toHaveBeenCalledWith(
      expect.objectContaining({ method: "same_day", sameDayCutoff: "14:00" }),
      "actor",
    );
  });
});

describe("updateOffering validation", () => {
  beforeEach(() =>
    repo.offeringFields.mockResolvedValue({
      priceAmount: "5.00",
      leadDaysMin: 2,
      leadDaysMax: 3,
      sameDayCutoff: null,
      status: "active",
    }),
  );

  it("404s an unknown offering", async () => {
    repo.offeringFields.mockResolvedValue(null);
    expect(await kindOf(updateOffering("o1", { priceAmount: "6.00" }, "actor"))).toBe("not_found");
  });

  it("merges a partial price change over current values", async () => {
    repo.updateOffering.mockResolvedValue({ id: "o1" });
    await updateOffering("o1", { priceAmount: "6.50" }, "actor");
    expect(repo.updateOffering).toHaveBeenCalledWith(
      "o1",
      expect.objectContaining({ priceAmount: "6.50", leadDaysMin: 2, leadDaysMax: 3, status: "active" }),
      "actor",
    );
  });
});

describe("setShopLocation validation", () => {
  it("rejects a missing postcode key", async () => {
    expect(await kindOf(setShopLocation("s1", {}, "actor"))).toBe("validation");
  });

  it("rejects a non-4-digit postcode", async () => {
    expect(await kindOf(setShopLocation("s1", { postcode: "30" }, "actor"))).toBe("validation");
  });

  it("accepts null to clear the location", async () => {
    repo.setShopLocation.mockResolvedValue({ shopId: "s1" });
    await setShopLocation("s1", { postcode: null }, "actor");
    expect(repo.setShopLocation).toHaveBeenCalledWith("s1", null, "actor");
  });

  it("accepts a valid postcode", async () => {
    repo.setShopLocation.mockResolvedValue({ shopId: "s1" });
    await setShopLocation("s1", { postcode: "3000" }, "actor");
    expect(repo.setShopLocation).toHaveBeenCalledWith("s1", "3000", "actor");
  });
});
