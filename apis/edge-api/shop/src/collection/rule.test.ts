import { describe, expect, it } from "vitest";

import { instantAtLocalTime } from "@effy/edge-shared";
import type { ShopPackageRun } from "@effy/edge-shared/delivery";

import { dayOffset, driverState, nextCollection, runsAhead, type StopFacts } from "./rule";

const at = (h: number, m = 0, day = 27) => instantAtLocalTime(2026, 10, day, h, m);
const pkg = (over: Partial<ShopPackageRun> = {}): ShopPackageRun => ({ id: "p1", status: "picking", runAt: at(12, 30), ...over });
const stop = (over: Partial<StopFacts> = {}): StopFacts => ({ runAt: at(12, 30), stopStatus: "pending", opensAt: at(11, 45), driverOnDuty: false, ...over });

describe("where the run's driver is, for this shop", () => {
  it("none, assigned, on the way, collected", () => {
    expect(driverState(undefined, at(10))).toBe("none");
    expect(driverState(stop(), at(10))).toBe("assigned");
    // On duty but the round has not opened yet.
    expect(driverState(stop({ driverOnDuty: true }), at(11))).toBe("assigned");
    expect(driverState(stop({ driverOnDuty: true }), at(12))).toBe("on_the_way");
    // Open, but the driver is off duty.
    expect(driverState(stop({ driverOnDuty: false }), at(12))).toBe("assigned");
    expect(driverState(stop({ stopStatus: "done", driverOnDuty: true }), at(12))).toBe("collected");
  });
});

describe("today's runs still to come", () => {
  it("counts each run's orders and drops what has passed or been collected", () => {
    const ahead = runsAhead(
      [at(16, 30), at(12, 30), at(8, 30), at(14, 30)],
      [pkg({ id: "a" }), pkg({ id: "b", runAt: at(16, 30) })],
      [stop({ runAt: at(14, 30), stopStatus: "done" })],
      at(10, 0),
    );
    expect(ahead).toEqual([{ runAt: at(12, 30), orders: 1 }, { runAt: at(16, 30), orders: 1 }]);
  });
});

describe("the shop's next collection", () => {
  it("counts this shop's packages due on it, ready and still picking", () => {
    const next = nextCollection(
      [pkg({ id: "a", status: "ready_for_pickup" }), pkg({ id: "b" }), pkg({ id: "c", runAt: at(12, 30, 28) })],
      [stop()],
      at(12, 30),
    );
    expect(next?.runAt).toEqual(at(12, 30));
    expect(next?.due).toEqual({ ready: 1, picking: 1, started: 1 });
    expect(next?.stop?.stopStatus).toBe("pending");
  });

  it("moves on once the run has collected from this shop", () => {
    const next = nextCollection([pkg({ id: "b", runAt: at(16) })], [stop({ stopStatus: "done" })], at(16));
    expect(next?.runAt).toEqual(at(16));
  });

  it("shows the next scheduled run with nothing due when the shop has no packages", () => {
    const next = nextCollection([], [], at(9, 0, 28));
    expect(next?.runAt).toEqual(at(9, 0, 28));
    expect(next?.due).toEqual({ ready: 0, picking: 0, started: 0 });
  });

  it("is null with no run at all", () => {
    expect(nextCollection([], [], null)).toBeNull();
  });
});

describe("dayOffset", () => {
  it("counts local days in the shop's timezone", () => {
    expect(dayOffset(at(23), at(1), "Australia/Melbourne")).toBe(0);
    expect(dayOffset(at(9, 0, 28), at(23), "Australia/Melbourne")).toBe(1);
  });
});
