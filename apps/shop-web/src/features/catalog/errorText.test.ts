import { describe, expect, it } from "vitest";

import type { DomainError } from "@effy/api-client";

import { STALE_EDIT_MESSAGE, isConflict, productMutationError } from "./errorText";

// The 409 discriminator is load-bearing for the focused-edit reload UX (FR-023a): a stale edit must be
// distinguished from every other failure so the dialog offers "reload" instead of a doomed retry.

function domainError(over: Partial<DomainError>): DomainError {
  return { kind: "unknown", status: 500, title: "x", ...over };
}

describe("isConflict", () => {
  it("is true only for a 409 DomainError", () => {
    expect(isConflict(domainError({ status: 409 }))).toBe(true);
    expect(isConflict(domainError({ status: 400 }))).toBe(false);
    expect(isConflict(new Error("boom"))).toBe(false);
    expect(isConflict(null)).toBe(false);
  });
});

describe("productMutationError", () => {
  it("uses the supplied conflict copy for a 409", () => {
    expect(productMutationError(domainError({ status: 409 }), "dup name")).toBe("dup name");
  });
  it("maps forbidden / not-found / unavailable without leaking detail", () => {
    expect(productMutationError(domainError({ kind: "forbidden", status: 403 }))).toMatch(
      /permission/i,
    );
    expect(productMutationError(domainError({ kind: "not-found", status: 404 }))).toMatch(
      /no longer exists/i,
    );
  });
  it("has a stable stale-edit message", () => {
    expect(STALE_EDIT_MESSAGE).toMatch(/changed elsewhere/i);
  });
});
