import type { DomainError } from "@effy/api-client";
import { describe, expect, it } from "vitest";

import { catalogMutationError } from "./errorText";

// Maps DomainError → safe, non-leaking copy. Never surfaces raw `detail`; conflicts (409) take the
// caller's specific message (e.g. the FR-006 in-use guard), everything else falls to a generic line.
function domainError(over: Partial<DomainError>): DomainError {
  return { kind: "unknown", status: 500, title: "x", ...over };
}

describe("catalogMutationError", () => {
  it("maps forbidden / not-found / unavailable by kind", () => {
    expect(catalogMutationError(domainError({ kind: "forbidden", status: 403 }))).toMatch(
      /permission/i,
    );
    expect(catalogMutationError(domainError({ kind: "not-found", status: 404 }))).toMatch(
      /no longer exists/i,
    );
    expect(catalogMutationError(domainError({ kind: "unavailable", status: 503 }))).toMatch(
      /waking up|unreachable/i,
    );
  });

  it("uses the caller's conflict message for a 409", () => {
    expect(
      catalogMutationError(domainError({ status: 409 }), "That attribute is in use."),
    ).toBe("That attribute is in use.");
  });

  it("falls back to generic conflict copy when no message is given", () => {
    expect(catalogMutationError(domainError({ status: 409 }))).toMatch(/conflicts/i);
  });

  it("maps validation statuses to a check-the-fields message", () => {
    expect(catalogMutationError(domainError({ status: 400 }))).toMatch(/check the fields/i);
    expect(catalogMutationError(domainError({ status: 422 }))).toMatch(/check the fields/i);
  });

  it("never leaks detail and handles non-DomainError values", () => {
    const withDetail = domainError({ status: 400, detail: "SECRET stack trace" });
    expect(catalogMutationError(withDetail)).not.toContain("SECRET");
    expect(catalogMutationError(new Error("boom"))).toMatch(/something went wrong/i);
    expect(catalogMutationError(null)).toMatch(/something went wrong/i);
  });
});
