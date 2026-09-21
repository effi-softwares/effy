import { describe, expect, it } from "vitest";

import { orderRoundStops, type OrderableStop } from "./round-ordering";

function stop(p: Partial<OrderableStop> & { id: string }): OrderableStop {
  return { seq: null, status: "pending", dueAt: null, zoneId: null, shopId: null, ...p };
}

const ids = (s: readonly OrderableStop[]) => s.map((x) => x.id);

describe("orderRoundStops — the sort key (FR-018)", () => {
  it("puts what is actionable before what is finished with", () => {
    const out = orderRoundStops([
      stop({ id: "done", status: "done" }),
      stop({ id: "skipped", status: "skipped" }),
      stop({ id: "pending", status: "pending" }),
      stop({ id: "arrived", status: "arrived" }),
    ]);
    expect(ids(out)).toEqual(["pending", "arrived", "done", "skipped"]);
  });

  it("orders by time constraint before zone", () => {
    const out = orderRoundStops([
      stop({ id: "late", dueAt: "2026-09-21T09:00:00Z", zoneId: "a" }),
      stop({ id: "early", dueAt: "2026-09-21T08:00:00Z", zoneId: "z" }),
    ]);
    expect(ids(out)).toEqual(["early", "late"]);
  });

  it("sorts a stop with no deadline after every stop that has one", () => {
    const out = orderRoundStops([
      stop({ id: "none", dueAt: null }),
      stop({ id: "some", dueAt: "2030-01-01T00:00:00Z" }),
    ]);
    expect(ids(out)).toEqual(["some", "none"]);
  });

  it("groups stops in one zone together, and packages from one shop adjacent", () => {
    const out = orderRoundStops([
      stop({ id: "z2s1", zoneId: "zone-2", shopId: "shop-1" }),
      stop({ id: "z1s2", zoneId: "zone-1", shopId: "shop-2" }),
      stop({ id: "z2s2", zoneId: "zone-2", shopId: "shop-2" }),
      stop({ id: "z1s1", zoneId: "zone-1", shopId: "shop-1" }),
    ]);
    expect(ids(out)).toEqual(["z1s1", "z1s2", "z2s1", "z2s2"]);
  });

  // FR-031 — a dispatcher is asserting something the sort key cannot know.
  it("lets a dispatcher's seq beat the derived order among actionable stops", () => {
    const out = orderRoundStops([
      stop({ id: "first-by-zone", zoneId: "zone-1", seq: 2 }),
      stop({ id: "second-by-zone", zoneId: "zone-2", seq: 1 }),
    ]);
    expect(ids(out)).toEqual(["second-by-zone", "first-by-zone"]);
  });

  // ⚠ Otherwise completing a stop could reshuffle the list under the driver's thumb.
  it("does not let seq reorder stops that are already finished with", () => {
    const out = orderRoundStops([
      stop({ id: "done-a", status: "done", seq: 9, zoneId: "zone-1" }),
      stop({ id: "done-b", status: "done", seq: 1, zoneId: "zone-2" }),
    ]);
    expect(ids(out)).toEqual(["done-a", "done-b"]);
  });

  it("falls back to the derived order when only one stop carries a seq", () => {
    const out = orderRoundStops([
      stop({ id: "b", zoneId: "zone-2", seq: 1 }),
      stop({ id: "a", zoneId: "zone-1", seq: null }),
    ]);
    expect(ids(out)).toEqual(["a", "b"]);
  });

  // SC-007 / FR-020 — the whole rule is worthless if it is not reproducible.
  it("is total and deterministic — equal inputs always give equal order", () => {
    const input = [
      stop({ id: "c" }),
      stop({ id: "a" }),
      stop({ id: "b" }),
    ];
    const once = ids(orderRoundStops(input));
    const twice = ids(orderRoundStops([...input].reverse()));
    expect(once).toEqual(twice);
    expect(once).toEqual(["a", "b", "c"]);
  });

  it("does not mutate its input", () => {
    const input = [stop({ id: "b" }), stop({ id: "a" })];
    orderRoundStops(input);
    expect(ids(input)).toEqual(["b", "a"]);
  });
});
