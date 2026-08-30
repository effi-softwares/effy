import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestScope } from "@effy/edge-shared";

import { FleetError } from "../shared/errors";

vi.mock("./repository");
vi.mock("./cognito");
vi.mock("../shared/audit");

import * as cognito from "./cognito";
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
  zoneId: null,
  zone: null,
  hub: "Effy Hub",
  vehicle: { type: null, plate: null },
  credentials: {
    licenceReference: null,
    licenceExpiresOn: null,
    vehicleRegistrationExpiresOn: null,
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
  vi.mocked(cognito.lookupDriverUser).mockResolvedValue({ sub: "sub-1", enabled: true });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("createDriver — FR-014, a work email already in use is REFUSED", () => {
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

  it("⚠ NEVER touches the existing driver — no identity call, no insert, no audit row", async () => {
    // This is the whole defect. The predecessor's `ensureDriverUser` swallowed the exists exception,
    // RE-ENABLED a disabled account, and the repository's `ON CONFLICT DO UPDATE` then overwrote the
    // existing driver's name, zone and vehicle — reporting success. Asserting the refusal is not
    // enough; the point is that nothing about that person moved.
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
    // The likeliest real case: someone left, and their address is being reused for a new hire. The
    // refusal must say "offboarded" so the operator picks a re-hire or a different address on
    // purpose, rather than silently resurrecting a stood-down sign-in.
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

    // Lower-cased — Cognito treats email as a case-insensitive alias and the column is citext, so
    // the two must agree or a "duplicate" can be created by changing the case.
    expect(cognito.createDriverUser).toHaveBeenCalledWith("sam@effyshopping.com", "Sam Rivers");
    expect(repo.insertDriver).toHaveBeenCalledWith(
      expect.objectContaining({ sub: "sub-new", workEmail: "sam@effyshopping.com" }),
    );
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "driver.created" }));
  });

  it("logs the metric-filter string when the record write fails after the identity exists", async () => {
    // ⚠ The one state an operator cannot repair from the console. The alarm's metric filter selects
    // this exact string, so a rename here silently disarms the alarm.
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("updateDriver — FR-010/FR-012", () => {
  it("⚠ passes a null through to the repository so a field can be CLEARED", async () => {
    // The defect FR-010 exists for: `COALESCE($n, col)` cannot distinguish "absent" from "null", so
    // a zone once assigned could never be un-assigned by any request the API accepted.
    vi.mocked(repo.updateDriver).mockResolvedValue("updated");

    await updateDriver(
      "d-1",
      { zoneId: null, updatedAt: PROFILE.updatedAt },
      "actor-1",
      scope,
    );

    const patch = vi.mocked(repo.updateDriver).mock.calls[0]![1];
    expect("zoneId" in patch).toBe(true);
    expect(patch.zoneId).toBeNull();
  });

  it("⚠ does not send a key the caller omitted, so an untouched field stays untouched", async () => {
    vi.mocked(repo.updateDriver).mockResolvedValue("updated");
    await updateDriver("d-1", { name: "Renamed", updatedAt: PROFILE.updatedAt }, "actor-1", scope);
    const patch = vi.mocked(repo.updateDriver).mock.calls[0]![1];
    expect("zoneId" in patch).toBe(false);
    expect("contactPhone" in patch).toBe(false);
  });

  it("treats an empty string as a clear, so the UI's empty field means what it looks like", async () => {
    vi.mocked(repo.updateDriver).mockResolvedValue("updated");
    await updateDriver(
      "d-1",
      { vehiclePlate: "  ", updatedAt: PROFILE.updatedAt },
      "actor-1",
      scope,
    );
    expect(vi.mocked(repo.updateDriver).mock.calls[0]![1].vehiclePlate).toBeNull();
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("setStatus — FR-015…FR-020", () => {
  it("⚠ REFUSES to stand down a driver holding started work, and itemises it", async () => {
    vi.mocked(repo.heldWorkFor).mockResolvedValue([
      {
        kind: "collection",
        taskId: "ct-1",
        taskStatus: "collected",
        orderId: "o-1",
        orderReference: "EFY-AAA111",
        location: "Shop One",
      },
      {
        kind: "delivery",
        taskId: "dt-1",
        taskStatus: "out_for_delivery",
        orderId: "o-2",
        orderReference: "EFY-BBB222",
        location: "Carlton",
      },
    ]);

    const err = (await setStatus("d-1", "suspended", "on leave", false, "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;

    expect(err.kind).toBe("conflict");
    // The operator must be able to act on this: which orders, and how much.
    expect(err.message).toContain("EFY-AAA111");
    expect(err.message).toContain("EFY-BBB222");
    expect(err.fields).toHaveLength(2);
    // ⚠ And nothing moved.
    expect(repo.setStatus).not.toHaveBeenCalled();
    expect(cognito.disableDriverUser).not.toHaveBeenCalled();
  });

  it("proceeds once the operator acknowledges the held work", async () => {
    vi.mocked(repo.setStatus).mockResolvedValue("sam@effyshopping.com");
    vi.mocked(repo.getDriver).mockResolvedValue({ ...PROFILE, status: "suspended" });

    await setStatus("d-1", "suspended", "on leave", true, "actor-1", scope);

    // The held-work read is skipped entirely once acknowledged — the operator has already seen it.
    expect(repo.heldWorkFor).not.toHaveBeenCalled();
    expect(repo.setStatus).toHaveBeenCalled();
    expect(cognito.disableDriverUser).toHaveBeenCalledWith("sam@effyshopping.com");
  });

  it("does not ask about held work when a driver is being RESTORED", async () => {
    vi.mocked(repo.getDriver).mockResolvedValue({ ...PROFILE, status: "suspended" });
    vi.mocked(repo.setStatus).mockResolvedValue("sam@effyshopping.com");

    await setStatus("d-1", "active", "back from leave", false, "actor-1", scope);

    expect(repo.heldWorkFor).not.toHaveBeenCalled();
    expect(cognito.enableDriverUser).toHaveBeenCalledWith("sam@effyshopping.com");
  });

  it("requires a reason, which is recorded against the driver", async () => {
    const err = (await setStatus("d-1", "suspended", "   ", false, "actor-1", scope).catch(
      (e) => e,
    )) as FleetError;
    expect(err.kind).toBe("validation");
    expect(err.fields?.[0]?.field).toBe("reason");
  });

  it("⚠ keeps the record change when the identity mirror fails, and logs it", async () => {
    // The record is authoritative for the access decision (Principle IV), so a driver whose record
    // says suspended is already refused. Rolling back a correct record change because an external
    // service was briefly unavailable would leave them ABLE TO WORK — the worse of the two outcomes.
    vi.mocked(repo.setStatus).mockResolvedValue("sam@effyshopping.com");
    vi.mocked(cognito.disableDriverUser).mockRejectedValue(new Error("cognito down"));
    vi.mocked(repo.getDriver).mockResolvedValue({ ...PROFILE, status: "suspended" });

    const out = await setStatus("d-1", "suspended", "on leave", true, "actor-1", scope);

    expect(out.profile.status).toBe("suspended");
    expect(scope.log.error).toHaveBeenCalled();
  });

  it("does not put the operator's reason prose into a redacted-field position", async () => {
    vi.mocked(repo.setStatus).mockImplementation(async (_id, _s, _r, write) => {
      await write({ query: vi.fn() } as never, "d-1");
      return "sam@effyshopping.com";
    });
    vi.mocked(repo.getDriver).mockResolvedValue({ ...PROFILE, status: "offboarded" });

    await setStatus("d-1", "offboarded", "resigned", true, "actor-1", scope);

    const call = vi.mocked(recordAudit).mock.calls.find(
      (c) => c[0].action === "driver.status_changed",
    );
    expect(call?.[0].detail).toEqual({
      changed: ["status"],
      values: { status: "offboarded", reason: "resigned" },
    });
  });
});
