import { describe, expect, it } from "vitest";

import { parseTourPatch } from "./validate";

describe("parseTourPatch - one change per write (106)", () => {
  it.each([
    [{ tour: "orders-queue", version: 1, outcome: "finished" }],
    [{ tour: "welcome", version: 1000, outcome: "declined" }],
    [{ tour: "a", version: 3, outcome: "closed" }],
    [{ offerTours: false }],
    [{ offerTours: true }],
    [{ reset: true }],
  ])("accepts %j", (body) => {
    expect(parseTourPatch(body)).toEqual({ value: body });
  });

  it.each([
    ["not an object", null, "JSON object"],
    ["an array", [], "JSON object"],
    ["nothing", {}, "exactly one change"],
    ["two changes", { offerTours: true, reset: true }, "exactly one change"],
    ["a tour and the switch", { tour: "x", version: 1, outcome: "finished", offerTours: true }, "exactly one change"],
    ["a capital in the key", { tour: "Orders", version: 1, outcome: "finished" }, "tour must be"],
    ["a key that starts with a hyphen", { tour: "-x", version: 1, outcome: "finished" }, "tour must be"],
    ["a key of 41 characters", { tour: "a".repeat(41), version: 1, outcome: "finished" }, "tour must be"],
    ["a missing key", { version: 1, outcome: "finished" }, "tour must be"],
    ["version 0", { tour: "x", version: 0, outcome: "finished" }, "version must be"],
    ["version 1001", { tour: "x", version: 1001, outcome: "finished" }, "version must be"],
    ["a fractional version", { tour: "x", version: 1.5, outcome: "finished" }, "version must be"],
    ["a string version", { tour: "x", version: "1", outcome: "finished" }, "version must be"],
    ["an unknown outcome", { tour: "x", version: 1, outcome: "started" }, "outcome must be"],
    ["offerTours as a string", { offerTours: "false" }, "offerTours must be"],
    ["reset false", { reset: false }, "reset must be true"],
  ])("refuses %s", (_name, body, message) => {
    const result = parseTourPatch(body);
    expect("error" in result && result.error).toContain(message);
  });
});
