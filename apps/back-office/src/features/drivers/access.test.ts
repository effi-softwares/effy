import { describe, expect, it } from "vitest";

import { canManageDrivers } from "./access";

/**
 * The console's capability check (FR-022, FR-023).
 *
 * ⚠ THIS IS A COURTESY, NOT THE GATE. The backend decides from the `admin.staff` record
 * independently (Principle IV: "a valid claim never overrides it"). What this function decides is
 * which controls the UI reveals, so an operator is never shown a button that will refuse them.
 * Asserting it here keeps the two halves saying the same thing.
 */
describe("canManageDrivers — the console's mirror of the backend gate", () => {
  it("permits an administrator and a manager", () => {
    expect(canManageDrivers(["admin"])).toBe(true);
    expect(canManageDrivers(["manager"])).toBe(true);
    expect(canManageDrivers(["manager", "csa"])).toBe(true);
  });

  it("⚠ refuses a csa — who READS everything and CHANGES nothing", () => {
    // The split is deliberate and matches the platform's standing rule: a CSA is exactly who fields
    // "why did my delivery fail", so they see every screen — but a driver record is a credential,
    // and standing someone down is not support work.
    expect(canManageDrivers(["csa"])).toBe(false);
  });

  it("refuses a role-less account, and refuses an empty list", () => {
    expect(canManageDrivers([])).toBe(false);
  });
});
