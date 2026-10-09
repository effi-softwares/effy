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

/**
 * 079 P15 — a courier order keeps the same nine words, and its journey never borrows an Effy one.
 *
 * ⚠ NOTHING IN `packageStatus` KNOWS WHO DELIVERS, and nothing needs to: the words follow what
 * HAPPENED. A courier package is collected and checked in like any other, is handed to a carrier
 * (which is what makes it "With carrier"), and is never put on a delivery round (which is the only
 * thing that makes a package "Out for delivery"). These rows hold that as a fact about the function,
 * so a later "tidy-up" that derives a word from the delivery type has something to fail.
 */
describe("packageStatus — a courier order's journey (079)", () => {
  const journey: [string, Partial<PackageFacts>, string][] = [
    ["being prepared", { shopStatus: "picking" }, "preparing"],
    ["ready at the shop", { shopStatus: "ready_for_pickup" }, "ready"],
    ["collected by an Effy driver", { shopStatus: "collected", collectionState: "picked_up", collectionDriver: "Ada" }, "with_driver"],
    ["checked in at the hub", { shopStatus: "collected", collectionState: "picked_up", checkedInAtHub: true }, "at_hub"],
    ["handed to the courier", { shopStatus: "collected", collectionState: "picked_up", checkedInAtHub: true, handedToCarrier: true }, "with_carrier"],
    ["arrived", { shopStatus: "collected", checkedInAtHub: true, handedToCarrier: true, arrived: true }, "delivered"],
  ];

  it.each(journey)("%s → %s", (_what, facts, status) => {
    expect(at(facts).status).toBe(status);
  });

  it("never reads Out for delivery at any step: it is never on a delivery round", () => {
    expect(journey.map(([, facts]) => at(facts).status)).not.toContain("out_for_delivery");
  });

  it("With carrier names no driver", () => {
    expect(at({ shopStatus: "collected", collectionState: "picked_up", collectionDriver: "Ada", checkedInAtHub: true, handedToCarrier: true }))
      .toEqual({ status: "with_carrier", word: "With carrier", detail: null, driverName: null });
  });

  it("an Effy later-day package — never handed to a carrier — never reads With carrier", () => {
    const steps: Partial<PackageFacts>[] = [
      { shopStatus: "collected", collectionState: "picked_up" },
      { shopStatus: "collected", collectionState: "picked_up", checkedInAtHub: true },
      { shopStatus: "collected", checkedInAtHub: true, deliveryState: "assigned", deliveryStopStatus: "pending" },
      { shopStatus: "collected", checkedInAtHub: true, deliveryState: "assigned", deliveryStopStatus: "en_route", deliveryDriver: "Bo" },
      { shopStatus: "delivered", arrived: true },
    ];
    expect(steps.map((f) => at(f).status)).toEqual(["with_driver", "at_hub", "at_hub", "out_for_delivery", "delivered"]);
  });
});

/** 080 — a courier's problem is a Problem until someone resolves it; the furthest fact still wins. */
describe("packageStatus — a courier problem (080)", () => {
  const handed = { shopStatus: "collected", checkedInAtHub: true, handedToCarrier: true } as const;

  it.each([
    ["lost", "With the courier — lost"],
    ["damaged", "With the courier — damaged"],
    ["failed", "With the courier — delivery failed"],
    ["returned", "With the courier — returned to sender"],
  ])("an open %s → Problem, saying so", (problem, detail) => {
    expect(at({ ...handed, courierProblem: problem })).toEqual({ status: "problem", word: "Problem", detail, driverName: null });
  });

  it("no open problem → With carrier, as before", () => {
    expect(at({ ...handed, courierProblem: null }).status).toBe("with_carrier");
  });

  it("delivered after all wins over a problem", () => {
    expect(at({ ...handed, courierProblem: "lost", arrived: true }).status).toBe("delivered");
  });
});
