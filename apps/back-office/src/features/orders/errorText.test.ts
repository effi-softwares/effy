import { describe, expect, it } from "vitest";

import { orderActionError } from "./errorText";

/**
 * ⚠ THE TEST THAT WAS MISSING WHEN THE DEFECT SHIPPED.
 *
 * The first draft mapped errors with `e instanceof Error ? e.message : "..."`. `@effy/api-client`
 * throws a `DomainError` — a PLAIN OBJECT — so that branch never ran and every refusal collapsed to
 * one generic sentence, including FR-006's "record the handover first". Nothing failed, because
 * nothing asserted on the message.
 *
 * These build the error the way the client actually throws it: a plain object, never an `Error`.
 */
const domainError = (status: number, kind: string) => ({ kind, status, title: "t", detail: "raw server prose" });

describe("orderActionError", () => {
  it("distinguishes the two 409s by which action was attempted", () => {
    const handoff = orderActionError(domainError(409, "unknown"), "handoff");
    const arrival = orderActionError(domainError(409, "unknown"), "arrival");

    expect(handoff).not.toBe(arrival);
    expect(handoff).toMatch(/collected/i);
    // FR-006: the operator must be told a handover is the missing step, not just that it failed.
    expect(arrival).toMatch(/handover/i);
  });

  it("explains the same-day refusal in the operator's terms", () => {
    expect(orderActionError(domainError(422, "unknown"), "handoff")).toMatch(/driver/i);
  });

  it("names the role a write needs", () => {
    expect(orderActionError(domainError(403, "forbidden"), "arrival")).toMatch(/manager|administrator/i);
  });

  it("says a missing package is missing", () => {
    expect(orderActionError(domainError(404, "not-found"), "arrival")).toMatch(/no longer exists/i);
  });

  it("tells the operator to retry a cold service", () => {
    expect(orderActionError(domainError(503, "unavailable"), "handoff")).toMatch(/try again/i);
  });

  /**
   * ⚠ 005 FR-008 — `detail` is free-form server prose that can leak internals. Every message here is
   * the console's OWN copy; none may echo the server's.
   */
  it("never renders the server's raw detail", () => {
    for (const status of [400, 403, 404, 409, 422, 503]) {
      for (const action of ["handoff", "arrival"] as const) {
        expect(orderActionError(domainError(status, "unknown"), action)).not.toContain(
          "raw server prose",
        );
      }
    }
  });

  it("falls back safely on something that is not a domain error at all", () => {
    expect(orderActionError(new Error("boom"), "arrival")).toBe("Something went wrong. Please try again.");
    expect(orderActionError(null, "handoff")).toBe("Something went wrong. Please try again.");
  });
});
