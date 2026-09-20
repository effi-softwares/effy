import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RequestScope } from "@effy/edge-shared";

vi.mock("./repository");
vi.mock("../drivers/repository");
vi.mock("../shared/audit");

import * as driverRepo from "../drivers/repository";
import { recordAudit } from "../shared/audit";
import type { FleetError } from "../shared/errors";
import * as repo from "./repository";
import { grantCapability, revokeCapability } from "./service";

const scope = { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } } as unknown as RequestScope;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(recordAudit).mockResolvedValue(undefined);
  vi.mocked(driverRepo.getDriver).mockResolvedValue({ id: "d-1", name: "Sam" } as never);
  vi.mocked(repo.listForDriver).mockResolvedValue([]);
  vi.mocked(repo.grant).mockResolvedValue("c-1");
  vi.mocked(repo.revoke).mockResolvedValue(true);
  vi.mocked(repo.findZone).mockResolvedValue({ id: "z-1", name: "Inner North", status: "active" });
});

describe("grantCapability", () => {
  it("refuses an unknown function or method, naming the allowed values", async () => {
    const err = (await grantCapability(
      "d-1",
      { function: "teleport" as never, method: "standard", zoneId: null },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;
    expect(err.kind).toBe("validation");
    expect(err.fields?.[0]?.field).toBe("function");
  });

  /**
   * ⚠ A KEY ABSENT AND A KEY PRESENT-WITH-NULL MEAN DIFFERENT THINGS.
   *
   * `zoneId: null` is a deliberate "every zone". An ABSENT key is an operator who did not choose —
   * and conflating them would silently grant the broadest clearance the platform has.
   */
  it("⚠ refuses an ABSENT zoneId, while accepting an explicit null", async () => {
    const err = (await grantCapability(
      "d-1",
      { function: "delivery", method: "standard" } as never,
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;
    expect(err.kind).toBe("validation");
    expect(err.fields?.[0]?.field).toBe("zoneId");

    // The explicit null is fine, and reaches the repository AS null.
    await grantCapability("d-1", { function: "delivery", method: "standard", zoneId: null }, "a", scope);
    expect(repo.grant).toHaveBeenCalledWith("d-1", "delivery", "standard", null, "a");
  });

  it("refuses a zone that does not exist", async () => {
    vi.mocked(repo.findZone).mockResolvedValue(null);
    const err = (await grantCapability(
      "d-1",
      { function: "delivery", method: "standard", zoneId: "z-gone" },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;
    expect(err.fields?.[0]?.field).toBe("zoneId");
  });

  /** ⚠ A disabled zone is refused at GRANT time and NAMED — clearing somebody for an area the
   *  platform has stopped serving is almost always a mistake, and "invalid zone" would not say why. */
  it("⚠ refuses a DISABLED zone, and names it", async () => {
    vi.mocked(repo.findZone).mockResolvedValue({ id: "z-1", name: "Ballarat", status: "disabled" });
    const err = (await grantCapability(
      "d-1",
      { function: "delivery", method: "standard", zoneId: "z-1" },
      "actor-1",
      scope,
    ).catch((e) => e)) as FleetError;
    expect(err.fields?.[0]?.message).toContain("Ballarat");
  });

  /** ⚠ FR-005 — an operator repeating themselves is not an error, and two doing it at once both win. */
  it("⚠ granting a clearance already held SUCCEEDS rather than conflicting", async () => {
    await expect(
      grantCapability("d-1", { function: "delivery", method: "standard", zoneId: null }, "a", scope),
    ).resolves.toBeDefined();
    await expect(
      grantCapability("d-1", { function: "delivery", method: "standard", zoneId: null }, "a", scope),
    ).resolves.toBeDefined();
  });

  it("records an audit row naming the work and the place", async () => {
    await grantCapability("d-1", { function: "collection", method: "same_day", zoneId: null }, "a", scope);
    const call = vi.mocked(recordAudit).mock.calls[0]![0];
    expect(call.action).toBe("driver.capability_granted");
    expect(call.detail).toMatchObject({ function: "collection", zoneId: "every_zone" });
  });
});

describe("revokeCapability", () => {
  /** ⚠ FR-006 — the operator's intent is already true; erroring would make two people tidying the
   *  same record fight each other. */
  it("⚠ revoking a clearance the driver does not hold SUCCEEDS rather than 404ing", async () => {
    vi.mocked(repo.revoke).mockResolvedValue(false);
    await expect(revokeCapability("d-1", "c-missing", "a", scope)).resolves.toEqual([]);
    // ⚠ And nothing is audited — nothing happened.
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("audits a revoke that actually removed something", async () => {
    await revokeCapability("d-1", "c-1", "a", scope);
    expect(vi.mocked(recordAudit).mock.calls[0]![0].action).toBe("driver.capability_revoked");
  });
});
