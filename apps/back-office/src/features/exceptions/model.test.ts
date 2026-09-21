import { describe, expect, it } from "vitest";

import type { DeliveryExceptionDTO } from "@effy/shared-types";

import { canResolveExceptions } from "./access";
import { locationLabel, reasonLabel, sortForTriage } from "./model";

const row = (over: Partial<DeliveryExceptionDTO> = {}): DeliveryExceptionDTO => ({
  exceptionId: "e1",
  stopId: "s1",
  orderNumber: "EFY-1",
  reason: "nobody_home",
  note: null,
  driverId: "d1",
  driverName: "Driver",
  destinationSuburb: "Richmond",
  failedAt: "2026-09-21T10:00:00.000Z",
  resolvedAt: null,
  packageLocation: "with_driver",
  ...over,
});

describe("reason labels", () => {
  it("renders words a person can act on, not enum values", () => {
    expect(reasonLabel("customer_refused")).toBe("Customer refused");
    expect(reasonLabel("access_blocked")).toBe("Access blocked");
  });

  it("falls back to the raw value rather than rendering nothing", () => {
    // ⚠ A widened enum must degrade to something legible, not to a blank cell. 053, 056, 057 and 059
    // each shipped a defect through an enum widening; an empty label is how this screen would.
    expect(reasonLabel("delivered_to_neighbour" as never)).toBe("delivered_to_neighbour");
  });
});

describe("⚠ FR-020 — where the package actually is", () => {
  it("distinguishes a van from the hub", () => {
    expect(locationLabel(row({ packageLocation: "with_driver" }))).toBe("With driver");
    expect(locationLabel(row({ packageLocation: "at_hub" }))).toBe("At hub");
  });
});

describe("triage order", () => {
  it("puts open exceptions above resolved ones, whatever their dates", () => {
    const sorted = sortForTriage([
      row({ exceptionId: "old-open", failedAt: "2026-09-01T00:00:00.000Z" }),
      row({ exceptionId: "new-done", failedAt: "2026-09-20T00:00:00.000Z", resolvedAt: "2026-09-20T01:00:00.000Z" }),
    ]);
    expect(sorted[0]!.exceptionId).toBe("old-open");
  });

  it("orders open ones most recent first", () => {
    const sorted = sortForTriage([
      row({ exceptionId: "a", failedAt: "2026-09-01T00:00:00.000Z" }),
      row({ exceptionId: "b", failedAt: "2026-09-20T00:00:00.000Z" }),
    ]);
    expect(sorted.map((e) => e.exceptionId)).toEqual(["b", "a"]);
  });

  it("does not mutate its input", () => {
    const input = [row({ exceptionId: "a" }), row({ exceptionId: "b", resolvedAt: "x" })];
    sortForTriage(input);
    expect(input[0]!.exceptionId).toBe("a");
  });
});

/**
 * ⚠ BOTH DIRECTIONS. A gate tested only for who it lets through is half a gate — 056 found
 * `requireDriver` reading `=== "disabled"`, so widening the enum let a SUSPENDED driver satisfy its
 * negation and keep a working session, with nothing failing.
 */
describe("who may close an exception (FR-021)", () => {
  it("admin and manager may", () => {
    expect(canResolveExceptions(["admin"])).toBe(true);
    expect(canResolveExceptions(["manager"])).toBe(true);
  });

  it("⚠ csa may NOT — while still reading every row", () => {
    expect(canResolveExceptions(["csa"])).toBe(false);
  });

  it("no role at all may not", () => {
    expect(canResolveExceptions([])).toBe(false);
  });

  it("a csa who is also a manager may", () => {
    expect(canResolveExceptions(["csa", "manager"])).toBe(true);
  });
});
