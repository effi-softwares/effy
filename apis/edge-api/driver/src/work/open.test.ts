import { describe, expect, it, vi } from "vitest";

import { RoundNotOpenError, assertRoundOpen, assertStopRoundOpen, roundNotOpenProblem } from "./open";

const db = (row?: { opens_at: Date | null; closed: boolean }) => ({
  query: vi.fn(async (_text: string, _values?: unknown[]) => ({ rows: row ? [row] : [], rowCount: row ? 1 : 0 })),
});

const OPENS = new Date("2026-10-08T05:15:00Z");

describe("assertRoundOpen (072)", () => {
  it("refuses a round whose opening time is still ahead, and says when", async () => {
    await expect(assertRoundOpen(db({ opens_at: OPENS, closed: true }) as never, "r1")).rejects.toMatchObject({
      name: "RoundNotOpenError",
      opensAt: "2026-10-08T05:15:00.000Z",
    });
  });

  it("passes a round that has opened", async () => {
    await expect(assertRoundOpen(db({ opens_at: OPENS, closed: false }) as never, "r1")).resolves.toBeUndefined();
  });

  // A delivery round with no window has no opening time at all.
  it("passes a round with no opening time", async () => {
    await expect(assertRoundOpen(db({ opens_at: null, closed: false }) as never, "r1")).resolves.toBeUndefined();
  });

  // ⚠ Not found is NOT refused here: the caller's own "not found" must be the answer that stands,
  // or "not open yet" becomes a way to learn that somebody else's round exists.
  it("does not refuse a round it cannot find", async () => {
    await expect(assertRoundOpen(db() as never, "nope")).resolves.toBeUndefined();
  });

  // ⚠ The decision is the DATABASE's: this function compares nothing to its own clock.
  it("reads the opening time through the database's one definition, against its clock", async () => {
    const d = db({ opens_at: OPENS, closed: false });
    await assertRoundOpen(d as never, "r1");
    const sql = String(d.query.mock.calls[0]![0]);
    expect(sql).toContain("public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at)");
    expect(sql).toMatch(/>\s*now\(\)/);
  });
});

describe("assertStopRoundOpen (072)", () => {
  it("is scoped to the driver, so another driver's stop matches nothing", async () => {
    const d = db();
    await expect(assertStopRoundOpen(d as never, "stop-1", "driver-1")).resolves.toBeUndefined();
    expect(d.query.mock.calls[0]![1]).toEqual(["stop-1", "driver-1"]);
    expect(String(d.query.mock.calls[0]![0])).toMatch(/dr\.driver_id\s*=\s*\$2/);
  });

  it("refuses the driver's own stop on a round that has not opened", async () => {
    await expect(
      assertStopRoundOpen(db({ opens_at: OPENS, closed: true }) as never, "stop-1", "driver-1"),
    ).rejects.toBeInstanceOf(RoundNotOpenError);
  });
});

describe("roundNotOpenProblem", () => {
  it("answers 409 and carries the opening time, so the app can say when (FR-025)", () => {
    const res = roundNotOpenProblem(new RoundNotOpenError(OPENS.toISOString()), {
      requestId: "req-1",
      instance: "/driver/v1/x",
    } as never);
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(String(res.body));
    expect(body.type).toBe("round_not_open");
    expect(body.errors[0]).toEqual({ field: "opensAt", message: "2026-10-08T05:15:00.000Z" });
    // In words, in Melbourne time — the driver app never formats a time itself.
    expect(body.errors[1].field).toBe("opensLabel");
    expect(body.errors[1].message).toMatch(/4:15 pm$/);
    expect(body.detail).toContain("4:15 pm");
  });
});
