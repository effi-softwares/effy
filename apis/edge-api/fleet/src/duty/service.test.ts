import { beforeEach, describe, expect, it, vi } from "vitest";

import { FleetError } from "../shared/errors";

vi.mock("./repository");
vi.mock("../shared/audit");

import { recordAudit } from "../shared/audit";
import * as repo from "./repository";
import { endDutySession, readDuty } from "./service";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(recordAudit).mockResolvedValue(undefined);
});

describe("readDuty — FR-034…FR-036", () => {
  it("⚠ reports waiting work even when NOBODY is on duty", async () => {
    // Nobody on duty plus the unassigned counts reads "nobody is working and 12 packages are waiting".
    vi.mocked(repo.listOnDuty).mockResolvedValue([]);
    vi.mocked(repo.unassignedWork).mockResolvedValue({
      readyToCollect: 12,
      readyToDeliver: 3,
      driversOnDuty: 0,
    });

    const out = await readDuty();

    expect(out.onDuty).toEqual([]);
    expect(out.unassigned.readyToCollect).toBe(12);
    expect(out.unassigned.driversOnDuty).toBe(0);
  });
});

describe("endDutySession — FR-037", () => {
  it("404s an unknown session", async () => {
    vi.mocked(repo.endSession).mockResolvedValue("not_found");
    const err = (await endDutySession("nope", "actor-1").catch((e) => e)) as FleetError;
    expect(err.kind).toBe("not_found");
  });

  it("refuses a session that has already ended rather than re-closing it", async () => {
    vi.mocked(repo.endSession).mockResolvedValue("already_ended");
    const err = (await endDutySession("s-1", "actor-1").catch((e) => e)) as FleetError;
    expect(err.kind).toBe("conflict");
  });

  it("audits the end inside the same transaction as the write", async () => {
    // A callback, so the audit row and the session close share one transaction.
    vi.mocked(repo.endSession).mockImplementation(async (_id, write) => {
      await write({ query: vi.fn() } as never, "d-1");
      return "ended";
    });
    await endDutySession("s-1", "actor-1");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "driver.duty_session_ended", driverId: "d-1" }),
      expect.anything(),
    );
  });
});
