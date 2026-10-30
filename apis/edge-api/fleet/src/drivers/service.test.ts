import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestScope } from "@effy/edge-shared";

import { FleetError } from "../shared/errors";

vi.mock("./repository");
vi.mock("./cognito");
vi.mock("../shared/audit");
vi.mock("../holdings/repository");

import * as cognito from "./cognito";
import * as holdings from "../holdings/repository";
import * as repo from "./repository";
import { recordAudit } from "../shared/audit";
import { createDriver, setStatus, updateDriver } from "./service";

const scope = {
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  requestId: "req-1",
  instance: "/fleet/v1/drivers",
} as unknown as RequestScope & { log: { error: ReturnType<typeof vi.fn> } };

const PROFILE = {
  id: "d-1",
  name: "Sam Rivers",
  workEmail: "sam@effyshopping.com",
  contactPhone: null,
  capabilities: [],
  hub: "Effy Hub",
  vehicle: { type: null, plate: null },
  credentials: {
    licenceReference: null,
    licenceExpiresOn: null,
    licenceClass: null,
  },
  emergencyContact: { name: null, phone: null },
  status: "active" as const,
  statusReason: null,
  statusChangedAt: "2026-08-30T00:00:00.000Z",
  startedOn: null,
  notes: null,
  dutyState: "off_duty" as const,
  blockedReasons: [],
  updatedAt: "2026-08-30T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(recordAudit).mockResolvedValue(undefined);
  vi.mocked(repo.getDriver).mockResolvedValue(PROFILE);
  // By default the driver holds nothing.
  vi.mocked(holdings.heldByDriver).mockResolvedValue(null);
  vi.mocked(cognito.lookupDriverUser).mockResolvedValue({ sub: "sub-1", enabled: true });
});

describe("createDriver - FR-014, a work email already in use is REFUSED", () => {
  it("⚠ refuses, and NAMES the existing driver so the operator can choose consciously", async () => {
    vi.mocked(repo.findByWorkEmail).mockResolvedValue({
      id: "d-existing",
      name: "Jo Chen",
      status: "active",
    });

    const err = await createDriver(
      { name: "Sam Rivers", workEmail: "jo@effyshopping.com" },
      "actor-1",
      scope,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(FleetError);
    expect((err as FleetError).kind).toBe("conflict");
    expect((err as FleetError).message).toContain("Jo Chen");
    expect((err as FleetError).message).toContain("active");
  });

  it("⚠ NEVER touches the existing driver - no identity call, no insert, no audit row", async () => {
    // A duplicate is refused and nothing about the existing person moves.
    vi.mocked(repo.findByWorkEmail).mockResolvedValue({
      id: "d-existing",
      name: "Jo Chen",
      status: "offboarded",
    });

    await expect(
      createDriver({ name: "Sam", workEmail: "jo@effyshopping.com" }, "actor-1", scope),
    ).rejects.toBeInstanceOf(FleetError);

    expect(cognito.createDriverUser).not.toHaveBeenCalled();
    expect(cognito.enableDriverUser).not.toHaveBeenCalled();
    expect(repo.insertDriver).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("⚠ refuses an OFFBOARDED driver's address too, naming their status", async () => {
    // A reused address of someone who left: the refusal says "offboarded".
    vi.mocked(repo.findByWorkEmail).mockResolvedValue({
      id: "d-gone",
      name: "Pat Lee",
      status: "offboarded",
    });
    const err = (await createDriver(
      { name: "New Hire", workEmail: "pat@effyshopping.com" },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;
    expect(err.message).toContain("offboarded");
  });

  it("refuses an orphaned sign-in account rather than adopting it", async () => {
    vi.mocked(repo.findByWorkEmail).mockResolvedValue(null);
    vi.mocked(cognito.createDriverUser).mockRejectedValue(
      new cognito.DriverUserExistsError("ghost@effyshopping.com"),
    );
    const err = (await createDriver(
      { name: "Ghost", workEmail: "ghost@effyshopping.com" },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;
    expect(err.kind).toBe("conflict");
    expect(err.message).toContain("no driver record");
    expect(repo.insertDriver).not.toHaveBeenCalled();
  });

  it("creates identity first, then the record, and audits once", async () => {
    vi.mocked(repo.findByWorkEmail).mockResolvedValue(null);
    vi.mocked(cognito.createDriverUser).mockResolvedValue("sub-new");
    vi.mocked(repo.insertDriver).mockResolvedValue("d-1");

    await createDriver({ name: "Sam Rivers", workEmail: "SAM@Effyshopping.com" }, "actor-1", scope);

    // Lower-cased, matching Cognito and the citext column.
    expect(cognito.createDriverUser).toHaveBeenCalledWith("sam@effyshopping.com", "Sam Rivers");
    expect(repo.insertDriver).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "sub-new", workEmail: "sam@effyshopping.com" }),
    );
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "driver.created" }));
  });

  it("logs the metric-filter string when the record write fails after the identity exists", async () => {
    // The alarm's metric filter selects this exact string.
    vi.mocked(repo.findByWorkEmail).mockResolvedValue(null);
    vi.mocked(cognito.createDriverUser).mockResolvedValue("sub-new");
    vi.mocked(repo.insertDriver).mockRejectedValue(new Error("db down"));

    await expect(
      createDriver({ name: "Sam", workEmail: "sam@effyshopping.com" }, "actor-1", scope),
    ).rejects.toThrow();

    expect(scope.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "record" }),
      "fleet.driver_provision_failed",
    );
  });

  it("names the invalid field rather than failing generically", async () => {
    const err = (await createDriver(
      { name: "", workEmail: "not-an-email" },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;
    expect(err.kind).toBe("validation");
    expect(err.fields?.map((f) => f.field).sort()).toEqual(["name", "workEmail"]);
  });
});

describe("updateDriver - FR-010/FR-012", () => {
  it("⚠ passes a null through to the repository so a field can be CLEARED", async () => {
    // A field once set must be clearable.
    vi.mocked(repo.updateDriver).mockResolvedValue("updated");

    await updateDriver(
      "d-1",
      { contactPhone: null, updatedAt: PROFILE.updatedAt },
      "actor-1",
      scope,
    );

    const patch = vi.mocked(repo.updateDriver).mock.calls[0]![1];
    expect("contactPhone" in patch).toBe(true);
    expect(patch.contactPhone).toBeNull();
  });

  it("⚠ does not send a key the caller omitted, so an untouched field stays untouched", async () => {
    vi.mocked(repo.updateDriver).mockResolvedValue("updated");
    await updateDriver("d-1", { name: "Renamed", updatedAt: PROFILE.updatedAt }, "actor-1", scope);
    const patch = vi.mocked(repo.updateDriver).mock.calls[0]![1];
    expect("contactPhone" in patch).toBe(false);
    expect("contactPhone" in patch).toBe(false);
  });

  it("treats an empty string as a clear, so the UI's empty field means what it looks like", async () => {
    vi.mocked(repo.updateDriver).mockResolvedValue("updated");
    await updateDriver(
      "d-1",
      { licenceReference: "  ", updatedAt: PROFILE.updatedAt },
      "actor-1",
      scope,
    );
    expect(vi.mocked(repo.updateDriver).mock.calls[0]![1].licenceReference).toBeNull();
  });

  it("refuses a work-email change rather than ignoring it", async () => {
    const err = (await updateDriver(
      "d-1",
      { workEmail: "new@effyshopping.com", updatedAt: PROFILE.updatedAt } as never,
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;
    expect(err.kind).toBe("validation");
    expect(err.fields?.[0]?.field).toBe("workEmail");
    expect(repo.updateDriver).not.toHaveBeenCalled();
  });

  it("refuses a stale write with a named conflict instead of discarding the other edit", async () => {
    vi.mocked(repo.updateDriver).mockResolvedValue("stale");
    const err = (await updateDriver(
      "d-1",
      { name: "Renamed", updatedAt: "2026-01-01T00:00:00.000Z" },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;
    expect(err.kind).toBe("conflict");
    expect(err.message).toContain("changed by someone else");
  });

  it("requires the concurrency token, so a client cannot opt out of the check", async () => {
    const err = (await updateDriver("d-1", {} as never, "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;
    expect(err.kind).toBe("validation");
    expect(err.fields?.[0]?.field).toBe("updatedAt");
  });

  it("names the offending field for a malformed date", async () => {
    const err = (await updateDriver(
      "d-1",
      { licenceExpiresOn: "31/12/2026", updatedAt: PROFILE.updatedAt },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;
    expect(err.kind).toBe("validation");
    expect(err.fields?.[0]?.field).toBe("licenceExpiresOn");
  });
});

describe("setStatus - FR-015…FR-020", () => {
  /** Standing a driver down while they hold a vehicle is refused: it would vanish from every list. */
  it("⚠ REFUSES to stand down a driver holding a vehicle, and NAMES the vehicle", async () => {
    vi.mocked(holdings.heldByDriver).mockResolvedValue({
      vehicleId: "v-1",
      registrationPlate: "EFY-001",
      make: "Toyota",
      model: "HiAce",
      since: "2026-09-01T00:00:00.000Z",
    });

    const err = (await setStatus("d-1", "suspended", "on leave", "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;

    expect(err.kind).toBe("conflict");
    // Names which vehicle.
    expect(err.message).toContain("EFY-001");
    expect(err.fields?.[0]?.message).toContain("EFY-001");
    // And nothing moved.
    expect(repo.setStatus).not.toHaveBeenCalled();
    expect(cognito.disableDriverUser).not.toHaveBeenCalled();
  });

  it("stands a driver down once they hold nothing", async () => {
    vi.mocked(holdings.heldByDriver).mockResolvedValue(null);
    vi.mocked(repo.setStatus).mockResolvedValue("sam@effyshopping.com");
    vi.mocked(repo.getDriver).mockResolvedValue({ ...PROFILE, status: "suspended" });

    await setStatus("d-1", "suspended", "on leave", "actor-1", scope);
    expect(repo.setStatus).toHaveBeenCalled();
  });

  /** Restoring a driver never asks about vehicles. */
  it("does not check for a held vehicle when a driver is being RESTORED", async () => {
    vi.mocked(repo.getDriver).mockResolvedValue({ ...PROFILE, status: "suspended" });
    vi.mocked(repo.setStatus).mockResolvedValue("sam@effyshopping.com");

    await setStatus("d-1", "active", "back from leave", "actor-1", scope);
    expect(holdings.heldByDriver).not.toHaveBeenCalled();
  });

  it("restores a driver, re-enabling their sign-in", async () => {
    vi.mocked(repo.getDriver).mockResolvedValue({ ...PROFILE, status: "suspended" });
    vi.mocked(repo.setStatus).mockResolvedValue("sam@effyshopping.com");

    await setStatus("d-1", "active", "back from leave", "actor-1", scope);

    expect(cognito.enableDriverUser).toHaveBeenCalledWith("sam@effyshopping.com");
  });

  it("requires a reason, which is recorded against the driver", async () => {
    const err = (await setStatus("d-1", "suspended", "   ", "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;
    expect(err.kind).toBe("validation");
    expect(err.fields?.[0]?.field).toBe("reason");
  });

  it("⚠ keeps the record change when the identity mirror fails, and logs it", async () => {
    // The record already refuses a suspended driver; rolling it back on a Cognito blip would let them work.
    vi.mocked(repo.setStatus).mockResolvedValue("sam@effyshopping.com");
    vi.mocked(cognito.disableDriverUser).mockRejectedValue(new Error("cognito down"));
    vi.mocked(repo.getDriver).mockResolvedValue({ ...PROFILE, status: "suspended" });

    const out = await setStatus("d-1", "suspended", "on leave", "actor-1", scope);

    expect(out.profile.status).toBe("suspended");
    expect(scope.log.error).toHaveBeenCalled();
  });

  it("does not put the operator's reason prose into a redacted-field position", async () => {
    vi.mocked(repo.setStatus).mockImplementation(async (_id, _s, _r, write) => {
      await write({ query: vi.fn() } as never, "d-1");
      return "sam@effyshopping.com";
    });
    vi.mocked(repo.getDriver).mockResolvedValue({ ...PROFILE, status: "offboarded" });

    await setStatus("d-1", "offboarded", "resigned", "actor-1", scope);

    const call = vi.mocked(recordAudit).mock.calls.find(
      (c) => c[0].action === "driver.status_changed",
    );
    expect(call?.[0].detail).toEqual({
      changed: ["status"],
      values: { status: "offboarded", reason: "resigned" },
    });
  });
});
