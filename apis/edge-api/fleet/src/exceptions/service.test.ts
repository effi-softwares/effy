import { beforeEach, describe, expect, it, vi } from "vitest";

import { FleetError } from "../shared/errors";

vi.mock("./repository");
vi.mock("../shared/audit");

import { recordAudit } from "../shared/audit";
import * as repo from "./repository";
import { listExceptions, resolveException } from "./service";

const FAILURE = {
  kind: "delivery_failure" as const,
  id: "df-1",
  reason: "nobody_home",
  note: "no answer, no safe place",
  driverId: "d-1",
  driverName: "Sam Rivers",
  orderId: "o-1",
  orderReference: "EFY-AAA111",
  location: "Carlton",
  occurredAt: "2026-08-29T06:00:00.000Z",
  resolvedAt: null,
  resolvedBySub: null,
  resolutionNote: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(recordAudit).mockResolvedValue(undefined);
});

describe("listExceptions — the reader these tables never had", () => {
  it("⚠ reports the OUTSTANDING count independently of the filtered page", async () => {
    // FR-032 asks "how many are outstanding", not "how many are on this screen". Deriving the count
    // from the page would make it change every time an operator narrowed a filter — and read as if
    // the backlog had shrunk.
    vi.mocked(repo.listExceptions).mockResolvedValue({ items: [FAILURE], nextCursor: null });
    vi.mocked(repo.outstandingCount).mockResolvedValue(42);

    const out = await listExceptions({ limit: 25, driverId: "d-1" });

    expect(out.items).toHaveLength(1);
    expect(out.outstandingCount).toBe(42);
  });

  it("carries the order reference so the console can link out in one step (FR-030)", async () => {
    vi.mocked(repo.listExceptions).mockResolvedValue({ items: [FAILURE], nextCursor: null });
    vi.mocked(repo.outstandingCount).mockResolvedValue(1);
    const out = await listExceptions({ limit: 25 });
    expect(out.items[0]!.orderId).toBe("o-1");
    expect(out.items[0]!.orderReference).toBe("EFY-AAA111");
  });
});

describe("resolveException — FR-031, one-way and never deleted", () => {
  it("requires a note", async () => {
    // ⚠ "Resolved" with no note records that somebody clicked a button. That is worse than leaving
    // it open: the item leaves the queue and the reason for removing it leaves with it.
    const err = (await resolveException("delivery_failure", "df-1", "  ", "actor-1").catch(
      (e) => e,
    )) as FleetError;
    expect(err.kind).toBe("validation");
    expect(err.fields?.[0]?.field).toBe("note");
    expect(repo.resolveException).not.toHaveBeenCalled();
  });

  it("refuses a second resolve rather than overwriting who resolved it first", async () => {
    vi.mocked(repo.resolveException).mockResolvedValue("already_resolved");
    const err = (await resolveException(
      "delivery_failure",
      "df-1",
      "redelivered next day",
      "actor-2",
    ).catch((e) => e)) as FleetError;
    expect(err.kind).toBe("conflict");
  });

  it("404s an id that does not exist", async () => {
    vi.mocked(repo.resolveException).mockResolvedValue("not_found");
    const err = (await resolveException("collection_issue", "nope", "n/a", "actor-1").catch(
      (e) => e,
    )) as FleetError;
    expect(err.kind).toBe("not_found");
  });

  it("records the resolution against the DRIVER, so the profile shows it", async () => {
    vi.mocked(repo.resolveException).mockResolvedValue("resolved");
    vi.mocked(repo.getException).mockResolvedValue({
      ...FAILURE,
      resolvedAt: "2026-08-30T00:00:00.000Z",
      resolvedBySub: "actor-1",
      resolutionNote: "redelivered next day",
    });

    const out = await resolveException("delivery_failure", "df-1", "redelivered next day", "actor-1");

    expect(out.resolvedAt).not.toBeNull();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "driver.exception_resolved", driverId: "d-1" }),
    );
  });
});
