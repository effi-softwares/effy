import { describe, expect, it } from "vitest";

import { instantAtLocalTime } from "@effy/edge-shared";
import type { ShopPackageRun } from "@effy/edge-shared/delivery";

import { dayOffset, driverState, nextCollection, runsAhead, type StopFacts, todayRuns } from "./rule";

const at = (h: number, m = 0, day = 27) => instantAtLocalTime(2026, 10, day, h, m);
const pkg = (over: Partial<ShopPackageRun> = {}): ShopPackageRun => ({ id: "p1", status: "picking", paidAt: at(11, 0), runAt: at(12, 30), ...over });
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

describe("today's runs (Today redesign 2)", () => {
  const NOW = at(13, 40);
  const TZ = "Australia/Melbourne";

  it("lists every run today, with the orders on each by how far they are", () => {
    const runs = todayRuns({
      scheduled: [at(10, 30), at(12, 30), at(14, 30)],
      packages: [
        pkg({ id: "a", status: "ready_for_pickup", paidAt: at(12, 50), runAt: at(14, 30) }),
        pkg({ id: "b", status: "picking", paidAt: at(13, 5), runAt: at(14, 30) }),
        pkg({ id: "c", status: "received", paidAt: at(13, 20), runAt: at(14, 30) }),
      ],
      stops: [{ runAt: at(12, 30), stopStatus: "done", opensAt: null, driverOnDuty: true }],
      taken: [{ runAt: at(12, 30), collected: 7, missed: 2, collectedAt: at(12, 36), firstPaidAt: at(10, 40) }],
      now: NOW,
      timezone: TZ,
    });
    expect(runs.map((r) => r.runAt.toISOString())).toEqual([at(10, 30), at(12, 30), at(14, 30)].map((d) => d.toISOString()));
    expect(runs[0]).toMatchObject({ collected: 0, ready: 0, waiting: 0, firstPaidAt: null, driver: "none" });
    expect(runs[1]).toMatchObject({ collected: 7, missed: 2, driver: "collected", collectedAt: at(12, 36), firstPaidAt: at(10, 40) });
    expect(runs[2]).toMatchObject({ ready: 1, picking: 1, waiting: 1, missed: 0, firstPaidAt: at(12, 50) });
  });

  it("leaves out runs on another day", () => {
    const tomorrow = new Date(at(10, 30).getTime() + 24 * 3_600_000);
    const runs = todayRuns({ scheduled: [at(10, 30)], packages: [pkg({ runAt: tomorrow })], stops: [], taken: [], now: NOW, timezone: TZ });
    expect(runs).toHaveLength(1);
  });
});
