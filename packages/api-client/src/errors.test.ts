import { describe, expect, it } from "vitest";

import { isDomainError, toDomainError } from "./errors";

/** The backend's `problem` puts field issues under `errors`; the reader must find them there. */
describe("toDomainError reads field issues off the wire", () => {
  it("maps the REAL wire key `errors` onto DomainError.fields", () => {
    const err = toDomainError(400, {
      type: "https://effyshopping.com/problems/validation-failed",
      title: "Validation failed",
      status: 400,
      errors: [{ field: "onHand", message: "must be a whole number" }],
    });
    expect(err.fields).toEqual([{ field: "onHand", message: "must be a whole number" }]);
  });

  it("is undefined when the body carries no field issues at all", () => {
    expect(toDomainError(500, { title: "Server error", status: 500 } as never).fields).toBeUndefined();
  });

  it("ignores a non-array under either key rather than trusting it", () => {
    const err = toDomainError(400, { title: "t", status: 400, errors: "nope" } as never);
    expect(err.fields).toBeUndefined();
  });
});

describe("isDomainError", () => {
  it("recognises the PLAIN OBJECT the client throws - not an Error instance", () => {
    // Nothing here throws an Error, so `e instanceof Error` would discard every refusal.
    const thrown: unknown = toDomainError(403, { title: "Not permitted", status: 403 } as never);
    expect(thrown instanceof Error).toBe(false);
    expect(isDomainError(thrown)).toBe(true);
  });

  it("rejects things that are not refusals", () => {
    for (const v of [null, undefined, "boom", 42, new Error("boom"), {}]) {
      expect(isDomainError(v)).toBe(false);
    }
  });
});
