import { describe, expect, it } from "vitest";

import type { DomainError } from "@effy/api-client";

import { DELETE_BLOCKED_CONFLICT, promotionMutationError, USED_CODE_CONFLICT } from "./errorText";

function domainError(status: number, kind: DomainError["kind"]): DomainError {
  return { kind, status, title: "x", detail: "raw detail that must never reach the operator" };
}

describe("promotionMutationError", () => {
  it("names the used-code conflict, so the operator edits the window instead of re-trying the value", () => {
    expect(promotionMutationError(domainError(409, "unknown"), USED_CODE_CONFLICT)).toBe(USED_CODE_CONFLICT);
  });

  it("names the delete-blocked conflict, which points at disabling", () => {
    expect(promotionMutationError(domainError(409, "unknown"), DELETE_BLOCKED_CONFLICT)).toBe(
      DELETE_BLOCKED_CONFLICT,
    );
  });

  it("maps forbidden, not-found and unavailable to their own copy", () => {
    expect(promotionMutationError(domainError(403, "forbidden"))).toMatch(/permission/i);
    expect(promotionMutationError(domainError(404, "not-found"))).toMatch(/no longer exists/i);
    expect(promotionMutationError(domainError(503, "unavailable"))).toMatch(/waking up|unreachable/i);
  });

  it("maps a validation refusal to field-checking copy", () => {
    expect(promotionMutationError(domainError(422, "unknown"))).toMatch(/check the fields/i);
  });

  it("never leaks the raw detail", () => {
    for (const status of [403, 404, 409, 422, 503, 500]) {
      expect(promotionMutationError(domainError(status, "unknown"))).not.toMatch(/raw detail/);
    }
  });

  it("falls back for a non-DomainError", () => {
    expect(promotionMutationError(new Error("boom"))).toMatch(/something went wrong/i);
  });
});
