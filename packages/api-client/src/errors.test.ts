import { describe, expect, it } from "vitest";

import { isDomainError, toDomainError } from "./errors";

/**
 * ⚠ THE PIN FOR A BUG THAT WAS LIVE PLATFORM-WIDE UNTIL 054.
 *
 * `@effy/edge-shared`'s `problem()` serialises field issues under the key **`errors`**. This reader
 * only ever looked at **`fields`**, so `DomainError.fields` was `undefined` on EVERY refusal, on
 * every surface, since the type was introduced. Nothing failed: each console simply fell back to a
 * generic sentence, which looks like a deliberate design choice rather than a defect.
 *
 * 053 found it while writing the order console and recorded it as latent. 054 needs it — a stock
 * refusal that cannot say WHICH field is wrong cannot tell an operator what to fix.
 *
 * ⚠ This package had NO tests before this file ("test": "echo no tests"), which is part of why the
 * defect survived: the one place that converts every server refusal on the platform was unguarded.
 */
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

  it("still accepts `fields`, so a service serialising either shape is understood", () => {
    const err = toDomainError(400, {
      title: "Validation failed",
      status: 400,
      fields: [{ field: "delta", message: "must not be zero" }],
    } as never);
    expect(err.fields).toEqual([{ field: "delta", message: "must not be zero" }]);
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
  it("recognises the PLAIN OBJECT the client throws — not an Error instance", () => {
    // ⚠ 053's console defect in one line: every screen that tested `e instanceof Error` discarded
    // the refusal, because nothing here ever throws an Error.
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
