import { describe, expect, it } from "vitest";

import { driverActionError, heldWorkItems } from "./errorText";

/**
 * ⚠ THIS TEST EXISTS BECAUSE THE PLATFORM HAS SHIPPED THIS EXACT DEFECT BEFORE.
 *
 * 053's order console mapped refusals with `e instanceof Error`. `@effy/api-client` throws a
 * `DomainError` — a PLAIN OBJECT, not an `Error` instance — so the check was always false and every
 * refusal collapsed into one generic sentence, after the server had got it right. Every test stayed
 * green, because nothing asserted on the message.
 *
 * So the fixtures below are the REAL throw shape: plain objects, exactly as the client produces
 * them. If someone "tidies" the mapper into an `instanceof Error` check, these go red.
 */

/** The shape `@effy/api-client`'s `toDomainError` actually returns. Not an Error. */
function thrown(over: Record<string, unknown> = {}) {
  return {
    kind: "unknown",
    status: 500,
    title: "Something went wrong",
    ...over,
  };
}

describe("driverActionError — a refusal the operator can act on", () => {
  it("⚠ handles the api-client's PLAIN-OBJECT throw, not an Error instance", () => {
    const err = thrown({ kind: "forbidden", status: 403 });
    expect(err).not.toBeInstanceOf(Error);
    expect(driverActionError(err, "status")).toContain("manager or an administrator");
  });

  it("names the action, so 'you cannot do this' says which this", () => {
    const forbidden = thrown({ kind: "forbidden", status: 403 });
    expect(driverActionError(forbidden, "create")).toContain("Adding a driver");
    expect(driverActionError(forbidden, "release")).toContain("Releasing work");
    expect(driverActionError(forbidden, "end-duty")).toContain("Ending a duty session");
  });

  it("⚠ passes the SERVICE's conflict prose through for create and status", () => {
    // These two are the only refusals the console cannot phrase better than the service can, because
    // only the service knows WHICH driver holds the address (FR-014) or WHAT work is held (FR-020).
    const duplicate = thrown({
      kind: "conflict",
      status: 409,
      detail: "Jo Chen already uses this work email (currently offboarded)",
    });
    expect(driverActionError(duplicate, "create")).toContain("Jo Chen");
    expect(driverActionError(duplicate, "create")).toContain("offboarded");
  });

  it("gives the concurrent-edit conflict the console's own copy, saying what to do", () => {
    const stale = thrown({ kind: "conflict", status: 409, detail: "row moved" });
    const msg = driverActionError(stale, "update");
    // ⚠ NOT the server's prose: "row moved" is internals. The operator needs the action.
    expect(msg).not.toContain("row moved");
    expect(msg).toContain("Reload");
    expect(msg).toContain("undo theirs");
  });

  it("names the offending fields on a validation refusal", () => {
    const invalid = thrown({
      kind: "validation",
      status: 400,
      fields: [{ field: "licenceExpiresOn", message: "must be a date" }],
    });
    // The label the form uses, not the wire key — the message has to point at a visible box.
    expect(driverActionError(invalid, "update")).toContain("the licence expiry");
  });

  it("falls back to a plain sentence when the server named no field", () => {
    expect(driverActionError(thrown({ kind: "validation", status: 400 }), "update")).toContain(
      "Check the form",
    );
  });

  it("says the service is waking up rather than blaming the operator", () => {
    expect(driverActionError(thrown({ kind: "unavailable", status: 503 }), "create")).toContain(
      "waking up",
    );
  });

  it("handles a non-DomainError throw without crashing the screen", () => {
    expect(driverActionError(new Error("boom"), "create")).toBe("Something went wrong. Try again.");
    expect(driverActionError(undefined, "create")).toBe("Something went wrong. Try again.");
  });
});

describe("heldWorkItems — FR-020's itemisation survives to the screen", () => {
  it("⚠ returns one line per held item, so the operator can go and deal with those orders", () => {
    const held = thrown({
      kind: "conflict",
      status: 409,
      detail: "Sam is holding 2 items…",
      fields: [
        { field: "collection:ct-1", message: "collected — order EFY-AAA111 (Shop One)" },
        { field: "delivery:dt-1", message: "out_for_delivery — order EFY-BBB222 (Carlton)" },
      ],
    });
    const items = heldWorkItems(held);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("EFY-AAA111");
    expect(items[1]).toContain("EFY-BBB222");
  });

  it("returns nothing for an error that carries no itemisation", () => {
    expect(heldWorkItems(thrown())).toEqual([]);
    expect(heldWorkItems(new Error("boom"))).toEqual([]);
  });
});
