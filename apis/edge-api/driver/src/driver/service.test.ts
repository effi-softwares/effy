import { describe, expect, it, vi, beforeEach } from "vitest";

import { requireDriver, toMeDTO } from "./service";
import { type DriverRecord } from "./types";
import * as repo from "./repository";

const ACTIVE: DriverRecord = {
  id: "d1",
  subject: "sub-1",
  name: "Jomo Ondiek",
  workEmail: "jomo@effyshopping.com",
  coverageLabel: "Inner North",
  vehicleType: "Van",
  vehiclePlate: "1QZ 4KP",
  status: "active",
  dutyStatus: "off_duty",
  onDutySince: null,
  expectedEndAt: null,
};

describe("requireDriver — the access decision is the record, not the token (Principle IV)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns the record for an active provisioned driver", async () => {
    vi.spyOn(repo, "findBySubject").mockResolvedValue(ACTIVE);
    await expect(requireDriver("sub-1")).resolves.toEqual(ACTIVE);
  });

  it("refuses a token with no provisioned record (no JIT create — research I2)", async () => {
    vi.spyOn(repo, "findBySubject").mockResolvedValue(null);
    await expect(requireDriver("ghost")).rejects.toMatchObject({
      name: "DriverAccessError",
      kind: "not_provisioned",
    });
  });

  // Every non-active state, so a new employment status must be decided here rather than inherit "permitted".
  it.each(["suspended", "offboarded"] as const)(
    "refuses a %s driver even with a valid token",
    async (status) => {
      vi.spyOn(repo, "findBySubject").mockResolvedValue({ ...ACTIVE, status });
      await expect(requireDriver("sub-1")).rejects.toMatchObject({
        name: "DriverAccessError",
        kind: "not_active",
      });
    },
  );
});

describe("toMeDTO — the identity read shows no currency and a hub label", () => {
  it("maps the record and never exposes an internal id path or money", () => {
    const dto = toMeDTO(ACTIVE);
    expect(dto).toEqual({
      id: "d1",
      name: "Jomo Ondiek",
      workEmail: "jomo@effyshopping.com",
      zone: "Inner North",
      hub: "Effy Hub",
      vehicle: { type: "Van", plate: "1QZ 4KP" },
      dutyStatus: "off_duty",
      // No check state on this record: nothing to check.
      vehicleCheck: { state: "none", vehicleLabel: null },
    });
    expect(JSON.stringify(dto)).not.toMatch(/\$|amount|price|fee/i);
  });
});
