import { describe, expect, it } from "vitest";

import type { AuthedEvent } from "./claims";
import { groups, hasAnyGroup, parseGroups, subject } from "./claims";

// The stringified-groups gotcha (research D3): the raw JWT carries a JSON array, but
// the authorizer context stringifies it — differently per gateway flavor. The parser
// must handle every observed form, and absent claim MUST mean deny.

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

describe("hasAnyGroup", () => {
  const allowed = ["admin", "manager", "csa"];

  it("passes a member (HTTP API stringified form)", () => {
    expect(hasAnyGroup(eventWithClaims({ "cognito:groups": "[manager]" }), allowed)).toBe(true);
  });

  it("denies when the claim is absent (group-less user has NO claim)", () => {
    expect(hasAnyGroup(eventWithClaims({}), allowed)).toBe(false);
  });

  it("denies on case mismatch — Cognito group names are exact-case", () => {
    expect(hasAnyGroup(eventWithClaims({ "cognito:groups": "[Admin]" }), allowed)).toBe(false);
  });

  it("denies a non-member", () => {
    expect(hasAnyGroup(eventWithClaims({ "cognito:groups": "[warehouse]" }), allowed)).toBe(false);
  });
});

describe("subject", () => {
  it("reads sub from the authorizer claims", () => {
    expect(subject(eventWithClaims({ sub: "user-123" }))).toBe("user-123");
  });

  it("is undefined when absent", () => {
    expect(subject(eventWithClaims({}))).toBeUndefined();
  });
});
