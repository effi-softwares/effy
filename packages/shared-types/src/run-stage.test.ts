import { describe, expect, it } from "vitest";

import { runStage, type RunStageFacts } from "./run-stage";

const collection = (o: Partial<RunStageFacts> = {}): RunStageFacts => ({
  kind: "collection", status: "planned", shopsTotal: 3, shopsSettled: 0, checkedIn: false,
  dropsTotal: 0, dropsPending: 0, dropsFinished: 0, toReturn: 0, ...o,
});
const delivery = (o: Partial<RunStageFacts> = {}): RunStageFacts => ({
  kind: "delivery", status: "planned", shopsTotal: 0, shopsSettled: 0, checkedIn: false,
  dropsTotal: 4, dropsPending: 4, dropsFinished: 0, toReturn: 0, ...o,
});

describe("runStage", () => {
  it("walks a collection run", () => {
    expect(runStage(collection())).toEqual({ stage: "to_collect", label: "To collect" });
    expect(runStage(collection({ shopsSettled: 2 }))).toEqual({ stage: "collecting", label: "Collecting 2 of 3" });
    expect(runStage(collection({ shopsSettled: 3 }))).toEqual({ stage: "to_hub", label: "Heading to the hub" });
    expect(runStage(collection({ shopsSettled: 3, checkedIn: true, status: "completed" })).stage).toBe("checked_in");
  });

  it("walks a delivery run", () => {
    expect(runStage(delivery())).toEqual({ stage: "to_load", label: "To load" });
    expect(runStage(delivery({ dropsPending: 0, dropsFinished: 1 }))).toEqual({ stage: "out", label: "Out 1 of 4" });
    expect(runStage(delivery({ dropsPending: 0, dropsFinished: 4, toReturn: 2 }))).toEqual({ stage: "returning", label: "Returning 2" });
    expect(runStage(delivery({ dropsPending: 0, dropsFinished: 4, status: "completed" }))).toEqual({ stage: "closed", label: "Closed" });
  });

  it("a delivery run with any drop not loaded is still to load", () => {
    expect(runStage(delivery({ dropsPending: 1, dropsFinished: 2 })).stage).toBe("to_load");
  });
});
