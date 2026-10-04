import { describe, expect, it } from "vitest";

import type { ExclusionReasonDTO } from "@effy/shared-types";

import { describeReasons, REASON_TEXT, WINDOW_STATE_LABEL, windowNoteFor } from "./model";

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
