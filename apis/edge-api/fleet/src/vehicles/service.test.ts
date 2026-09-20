import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestScope } from "@effy/edge-shared";
import type { VehicleDetail } from "@effy/shared-types";

vi.mock("./repository");
vi.mock("../shared/audit");

import { recordAudit } from "../shared/audit";
import type { FleetError } from "../shared/errors";
import * as repo from "./repository";
import { createVehicle, setVehicleStatus, updateVehicle } from "./service";

const scope = {
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
} as unknown as RequestScope;

const VEHICLE: VehicleDetail = {
  id: "v-1",
  registrationPlate: "EFY-001",
  make: "Toyota",
  model: "HiAce",
  bodyType: "van",
  ownership: "effy_owned",
  canCarryChilled: false,
  canCarryFrozen: false,
  status: "active",
  currentHolderDriverId: null,
  currentHolderName: null,
  complianceIssues: [],
  year: 2023,
  fuelType: "diesel",
  payloadKg: 1200,
  loadVolumeLitres: 6200,
  crateCapacity: 40,
  registrationExpiresOn: "2027-01-01",
  insurancePolicyReference: "POL-1",
  insuranceExpiresOn: "2027-01-01",
  roadworthyExpiresOn: "2027-01-01",
  odometerKm: 48120,
  statusReason: null,
  notes: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000000Z",
  holdings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordAudit).mockResolvedValue(undefined);
  vi.mocked(repo.getVehicle).mockResolvedValue(VEHICLE);
  vi.mocked(repo.plateInUse).mockResolvedValue(null);
  vi.mocked(repo.insertVehicle).mockResolvedValue("v-1");
});

describe("createVehicle — refusals that name the obstacle", () => {
  it("requires the four facts the business cannot do without", async () => {
    const err = (await createVehicle(
      { registrationPlate: "", make: "", model: "", bodyType: "van", ownership: "effy_owned" },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;

    expect(err.kind).toBe("validation");
    expect(err.fields?.map((f) => f.field).sort()).toEqual(["make", "model", "registrationPlate"]);
  });

  /**
   * ⚠ THE REFUSAL NAMES THE PLATE ALREADY IN USE. "That plate is taken" sends an operator hunting;
   * naming it sends them to the record. 053 shipped a console where exactly this information was
   * discarded after the server had composed it.
   */
  it("⚠ refuses a duplicate plate and NAMES the vehicle already using it", async () => {
    vi.mocked(repo.plateInUse).mockResolvedValue("EFY-001");

    const err = (await createVehicle(
      { registrationPlate: "efy-001", make: "Toyota", model: "HiAce", bodyType: "van", ownership: "effy_owned" },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;

    expect(err.kind).toBe("conflict");
    expect(err.message).toContain("EFY-001");
    expect(err.fields?.[0]?.field).toBe("registrationPlate");
    expect(repo.insertVehicle).not.toHaveBeenCalled();
  });

  it("refuses a date that is not YYYY-MM-DD rather than letting the database guess", async () => {
    const err = (await createVehicle(
      {
        registrationPlate: "EFY-002",
        make: "Ford",
        model: "Transit",
        bodyType: "van",
        ownership: "effy_owned",
        registrationExpiresOn: "01/02/2027",
      },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;

    expect(err.kind).toBe("validation");
    expect(err.fields?.[0]?.field).toBe("registrationExpiresOn");
  });

  it("accepts a driver-owned vehicle on exactly the same path as an Effy-owned one", async () => {
    await createVehicle(
      { registrationPlate: "EFY-007", make: "Hyundai", model: "i30", bodyType: "car", ownership: "driver_owned" },
      "actor-1",
      scope,
    );
    expect(repo.insertVehicle).toHaveBeenCalledOnce();
  });
});

describe("updateVehicle — optimistic concurrency", () => {
  it("requires the token the profile was loaded with", async () => {
    const err = (await updateVehicle("v-1", { updatedAt: "" }, "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;
    expect(err.fields?.[0]?.field).toBe("updatedAt");
  });

  it("⚠ refuses a stale write rather than quietly undoing someone else's change", async () => {
    vi.mocked(repo.updateVehicle).mockResolvedValue("stale");
    const err = (await updateVehicle("v-1", { updatedAt: "old" }, "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;
    expect(err.kind).toBe("conflict");
    expect(err.message).toContain("changed by someone else");
  });
});

describe("setVehicleStatus — retiring cannot strand a vehicle", () => {
  /**
   * ⚠ THE VAN IS IN A CARPARK SOMEWHERE. Retiring it while a driver holds it would remove it from
   * the assignable fleet while a person physically has it, and nothing would say so — 056's
   * stranded-work shape, which was in no register because nobody knew.
   */
  it("⚠ REFUSES to retire a vehicle that is still out, and names the holder", async () => {
    vi.mocked(repo.getVehicle).mockResolvedValue({
      ...VEHICLE,
      currentHolderDriverId: "d-9",
      currentHolderName: "Sam Rivers",
    });

    const err = (await setVehicleStatus("v-1", { status: "retired", reason: "sold" }, "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;

    expect(err.kind).toBe("conflict");
    expect(err.message).toContain("Sam Rivers");
    expect(repo.setStatus).not.toHaveBeenCalled();
  });

  it("allows taking a held vehicle OFF THE ROAD — that does not pretend it came back", async () => {
    vi.mocked(repo.getVehicle).mockResolvedValue({
      ...VEHICLE,
      currentHolderDriverId: "d-9",
      currentHolderName: "Sam Rivers",
    });
    vi.mocked(repo.setStatus).mockResolvedValue(true);

    await setVehicleStatus("v-1", { status: "off_road", reason: "clutch" }, "actor-1", scope);
    expect(repo.setStatus).toHaveBeenCalled();
  });

  it("requires a reason, which is recorded against the vehicle", async () => {
    const err = (await setVehicleStatus("v-1", { status: "off_road", reason: "  " }, "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;
    expect(err.fields?.[0]?.field).toBe("reason");
  });
});
