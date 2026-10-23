import { describe, expect, it } from "vitest";

import type { AuthedEvent } from "./claims";
import { parseGroups, subject } from "./claims";

// The authorizer stringifies `cognito:groups` differently per gateway; every form parses, and an absent claim means deny.

describe("parseGroups", () => {
  it.each([
    ["HTTP API array-toString", "[admin manager]", ["admin", "manager"]],
    ["REST API comma-join", "admin,manager", ["admin", "manager"]],
    ["single group", "admin", ["admin"]],
    ["single group bracketed", "[csa]", ["csa"]],
    ["mixed separators", "[admin, manager]", ["admin", "manager"]],
    ["empty brackets", "[]", []],
    ["empty string", "", []],
  ])("parses %s: %j → %j", (_name, raw, want) => {
    expect(parseGroups(raw)).toEqual(want);
  });

  it("absent claim yields the empty set", () => {
    expect(parseGroups(undefined)).toEqual([]);
  });
});

function eventWithClaims(claims: Record<string, string>): AuthedEvent {
  return {
    rawPath: "/v1/back-office/ping",
    requestContext: {
      requestId: "req-1",
      authorizer: { jwt: { claims, scopes: [] }, principalId: "", integrationLatency: 0 },
    },
  } as unknown as AuthedEvent;
}

describe("subject", () => {
  it("reads sub from the authorizer claims", () => {
    expect(subject(eventWithClaims({ sub: "user-123" }))).toBe("user-123");
  });

  it("is undefined when absent", () => {
    expect(subject(eventWithClaims({}))).toBeUndefined();
  });
});
