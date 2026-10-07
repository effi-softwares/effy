import { describe, expect, it } from "vitest";

import type { ExclusionReason } from "../lib/driver-eligibility";
import { reasonSeverity, reasonWords } from "./severity";
import { forShop, packageStatus, type PackageFacts } from "./status";

const base: PackageFacts = {
  shopStatus: "ready_for_pickup",
  collectionState: null,
  collectionDriver: null,
  checkedInAtHub: false,
  deliveryState: null,
  deliveryStopStatus: null,
  deliveryDriver: null,
  failedReason: null,
  handedToCarrier: false,
  arrived: false,
};
const at = (p: Partial<PackageFacts>) => packageStatus({ ...base, ...p });

describe("packageStatus — the nine words (073, S1)", () => {
  it.each([
    ["pending", "preparing"],
    ["received", "preparing"],
    ["picking", "preparing"],
    ["ready_for_pickup", "ready"],
  ])("shop status %s → %s", (shopStatus, status) => {
    expect(at({ shopStatus }).status).toBe(status);
  });

  // ⚠ THE DEFECT. This read "At hub" (standard) and "Out for delivery" (same-day) until 073.
  it("collected, not yet checked in → With driver, naming them", () => {
    expect(at({ shopStatus: "collected", collectionState: "picked_up", collectionDriver: "Ada" })).toEqual({
      status: "with_driver",
      word: "With driver",
      detail: null,
      driverName: "Ada",
    });
  });

  it("checked in at the hub → At hub", () => {
    expect(at({ shopStatus: "collected", collectionState: "picked_up", checkedInAtHub: true }).status).toBe("at_hub");
  });

  it("on a delivery round not yet started → still At hub", () => {
    expect(
      at({ shopStatus: "collected", collectionState: "picked_up", checkedInAtHub: true, deliveryState: "assigned", deliveryStopStatus: "pending" }).status,
    ).toBe("at_hub");
  });

  it.each(["out_for_delivery", "en_route", "arrived"])("drop %s → Out for delivery, naming the driver", (stop) => {
    const v = at({ shopStatus: "collected", collectionState: "picked_up", checkedInAtHub: true, deliveryState: "assigned", deliveryStopStatus: stop, deliveryDriver: "Ben" });
    expect(v.status).toBe("out_for_delivery");
    expect(v.driverName).toBe("Ben");
  });

  it("handed to the carrier → With carrier", () => {
    expect(at({ shopStatus: "collected", checkedInAtHub: true, handedToCarrier: true }).status).toBe("with_carrier");
  });

  it("delivered by proof, or an arrival recorded → Delivered", () => {
    expect(at({ shopStatus: "delivered" }).status).toBe("delivered");
    expect(at({ shopStatus: "collected", handedToCarrier: true, arrived: true }).status).toBe("delivered");
  });

  it("a failed attempt → Problem, saying why", () => {
    const v = at({ shopStatus: "collected", checkedInAtHub: true, deliveryState: "assigned", deliveryStopStatus: "skipped", failedReason: "nobody_home" });
    expect(v.status).toBe("problem");
    expect(v.detail).toBe("Delivery attempt failed — nobody home");
  });

  it("not collected at the shop → Problem, not plain Ready", () => {
    expect(at({ collectionState: "not_available" })).toMatchObject({ status: "problem", detail: "Not collected at the shop" });
  });

  it("shop can't supply → Problem; cancelled → Cancelled", () => {
    expect(at({ shopStatus: "unfulfillable" })).toMatchObject({ status: "problem", detail: "Shop can't supply" });
    expect(at({ shopStatus: "withdrawn" }).status).toBe("cancelled");
  });

  // ⚠ The furthest fact wins, so a known later step is never hidden behind a missing earlier one.
  it.each<[Partial<PackageFacts>, string]>([
    [{ shopStatus: "collected", collectionState: "picked_up", checkedInAtHub: true }, "at_hub"],
    [{ shopStatus: "collected", checkedInAtHub: true, handedToCarrier: true }, "with_carrier"],
    [{ shopStatus: "collected", handedToCarrier: true, arrived: true }, "delivered"],
    [{ shopStatus: "collected", arrived: true }, "delivered"],
    [{ shopStatus: "delivered", failedReason: "nobody_home" }, "delivered"],
    [{ shopStatus: "collected", checkedInAtHub: true, failedReason: "nobody_home", handedToCarrier: true }, "problem"],
    [{ shopStatus: "collected", collectionState: "picked_up", deliveryState: "assigned", deliveryStopStatus: "en_route" }, "out_for_delivery"],
  ])("precedence %#", (facts, status) => {
    expect(at(facts).status).toBe(status);
  });

  it("the shop never sees a driver's name", () => {
    expect(forShop(at({ shopStatus: "collected", collectionState: "picked_up", collectionDriver: "Ada" })).driverName).toBeNull();
  });
});

describe("reasonSeverity / reasonWords (073)", () => {
  const all: ExclusionReason[] = [
    "not_on_duty", "not_employable", "licence_expired", "no_vehicle",
    "not_cleared", "no_refrigeration", "over_capacity", "cannot_meet_deadline",
  ];

  it("has plain words for every reason", () => {
    for (const r of all) expect(reasonWords(r)).toMatch(/^[A-Z][a-z ]+/);
  });

  it("lets a person override only the area clearance and the deadline estimate", () => {
    expect(all.filter((r) => reasonSeverity(r) === "concern").sort()).toEqual(["cannot_meet_deadline", "not_cleared"]);
  });
});
