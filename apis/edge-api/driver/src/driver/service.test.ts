import { describe, expect, it, vi, beforeEach } from "vitest";

import { requireDriver, toMeDTO } from "./service";
import { DriverAccessError, type DriverRecord } from "./types";
import * as repo from "./repository";

const ACTIVE: DriverRecord = {
  id: "d1",
  subject: "sub-1",
  name: "Jomo Ondiek",
  workEmail: "jomo@effyshopping.com",
  zoneId: "z1",
  zoneName: "Inner North",
  vehicleType: "Van",
  vehiclePlate: "1QZ 4KP",
  status: "active",
  dutyStatus: "off_duty",
  onDutySince: null,
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

  // ⚠ 056 — EVERY non-active state, not just the one that existed when this was written.
  //
  // The predecessor of this test asserted only `status: "disabled"`. That was sufficient while the
  // enum had two values and the gate read `=== "disabled"`. When 056 widened the enum to three, the
  // gate's negative test let a SUSPENDED driver straight through — stood down in the console, still
  // able to sign in and be assigned work — and this test would have stayed green throughout, because
  // it never asked about a state that did not exist yet.
  //
  // `it.each` over the states is the point: adding a fourth employment status forces a decision here
  // rather than silently inheriting "permitted".
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
    });
    expect(JSON.stringify(dto)).not.toMatch(/\$|amount|price|fee/i);
  });
});
