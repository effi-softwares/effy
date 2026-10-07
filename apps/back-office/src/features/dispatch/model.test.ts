import { describe, expect, it } from "vitest";

import type { ExclusionReasonDTO } from "@effy/shared-types";

import {
  describeReasons,
  REASON_TEXT,
  roundOpenState,
  waitingFor,
  WINDOW_STATE_LABEL,
  windowNoteFor,
} from "./model";

describe("describeReasons", () => {
  it("has a sentence for every reason the contract can produce", () => {
    // ⚠ EXHAUSTIVE OVER THE CONTRACT, not over a list somebody maintains. 053, 056 and 057 each
    // shipped a defect through an enum widening; a new reason with no wording would render as
    // `undefined` on the one screen that exists to explain things.
    const all: ExclusionReasonDTO[] = [
      "not_on_duty",
      "not_employable",
      "licence_expired",
      "no_vehicle",
      "not_cleared",
      "no_refrigeration",
      "over_capacity",
      "cannot_meet_deadline",
    ];
    for (const r of all) {
      expect(REASON_TEXT[r], `${r} has no wording`).toBeTruthy();
      expect(REASON_TEXT[r]).not.toMatch(/_/); // never the raw enum
    }
    expect(Object.keys(REASON_TEXT).sort()).toEqual([...all].sort());
  });

  it("joins several reasons readably", () => {
    expect(describeReasons(["licence_expired", "no_vehicle"])).toBe(
      "Licence expired · Holding no vehicle",
    );
  });

  it("says something different when there was no candidate at all", () => {
    expect(describeReasons([])).toBe("No driver is cleared for this work at all");
  });
});

describe("069 — a drop's delivery window on the dispatcher's round", () => {
  const deliveryWindow = { startAt: "2026-10-08T17:00:00+11:00", endAt: "2026-10-08T19:00:00+11:00" };
  const at = (iso: string) => new Date(iso);

  it("says the window in Melbourne time and whether it is open, missed or still to come", () => {
    const stop = { status: "pending", deliveryWindow };
    expect(windowNoteFor(stop, at("2026-10-08T16:00:00+11:00"))).toEqual({ text: "5 pm – 7 pm", state: "upcoming" });
    expect(windowNoteFor(stop, at("2026-10-08T18:00:00+11:00"))).toEqual({ text: "5 pm – 7 pm", state: "due" });
    expect(windowNoteFor(stop, at("2026-10-08T19:00:01+11:00"))).toEqual({ text: "5 pm – 7 pm", state: "late" });
  });

  it("⚠ a finished drop is never called late here — that verdict is the order's, against its real arrival", () => {
    for (const status of ["done", "skipped"]) {
      expect(windowNoteFor({ status, deliveryWindow }, at("2026-10-08T22:00:00+11:00"))?.state).toBe("finished");
    }
  });

  it("says nothing for a stop with no window: a pickup, the hub, or an order before 069", () => {
    expect(windowNoteFor({ status: "pending", deliveryWindow: null }, new Date())).toBeNull();
    expect(windowNoteFor({ status: "pending" }, new Date())).toBeNull();
  });

  it("puts a word on the two states that need one", () => {
    expect(WINDOW_STATE_LABEL.due).toBe("Due now");
    expect(WINDOW_STATE_LABEL.late).toBe("Late");
    expect(WINDOW_STATE_LABEL.upcoming).toBe("");
    expect(WINDOW_STATE_LABEL.finished).toBe("");
  });
});

// 2026-10-08, midday Melbourne (AEDT, UTC+11).
const NOON = new Date("2026-10-08T01:00:00Z");

describe("roundOpenState — has a round opened to its driver? (072)", () => {
  const planned = (opensAt: string | null) => ({ opensAt, status: "planned" });

  it("says when a round opens, in Melbourne time", () => {
    expect(roundOpenState(planned("2026-10-08T02:15:00Z"), NOON)).toEqual({ open: false, text: "Opens 1:15 pm" });
  });

  // A round can be for tomorrow's run now — the day has to be said.
  it("names the day when it is not today", () => {
    expect(roundOpenState(planned("2026-10-09T00:15:00Z"), NOON).text).toBe("Opens tomorrow 11:15 am");
    expect(roundOpenState(planned("2026-10-10T00:15:00Z"), NOON).text).toBe("Opens Sat 10 Oct 11:15 am");
  });

  it("is open from the opening instant onward", () => {
    expect(roundOpenState(planned("2026-10-08T01:00:00Z"), NOON)).toEqual({ open: true, text: "Open" });
    expect(roundOpenState(planned("2026-10-08T00:00:00Z"), NOON)).toEqual({ open: true, text: "Open" });
  });

  // A delivery round with no window has no opening time at all.
  it("is open when the round has no opening time", () => {
    expect(roundOpenState(planned(null), NOON)).toEqual({ open: true, text: "Open" });
  });

  it("says nothing for a round that is finished or cancelled", () => {
    expect(roundOpenState({ opensAt: "2026-10-09T00:15:00Z", status: "cancelled" }, NOON).text).toBe("");
    expect(roundOpenState({ opensAt: null, status: "completed" }, NOON).text).toBe("");
  });
});

describe("waitingFor — where an unassigned package is, and what for (072)", () => {
  it("names the collection run a shop-side package belongs to", () => {
    expect(waitingFor({ stage: "collection", targetAt: "2026-10-08T03:00:00Z" }, NOON)).toBe(
      "At the shop · next collection 2 pm",
    );
  });

  it("names tomorrow's run after today's last", () => {
    expect(waitingFor({ stage: "collection", targetAt: "2026-10-09T01:00:00Z" }, NOON)).toBe(
      "At the shop · next collection tomorrow 12 pm",
    );
  });

  it("says when a hub-side package must be delivered by", () => {
    expect(waitingFor({ stage: "delivery", targetAt: "2026-10-08T08:00:00Z" }, NOON)).toBe(
      "At the hub · deliver by 7 pm",
    );
  });

  it("says so when no collection run is scheduled", () => {
    expect(waitingFor({ stage: "collection", targetAt: null }, NOON)).toBe(
      "At the shop · no collection run is scheduled",
    );
  });
});
