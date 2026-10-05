import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor, parseSort, type Cursor } from "./cursor";

const raw = (payload: string) => Buffer.from(payload, "utf8").toString("base64url");

describe("cursor", () => {
  it.each<Cursor>([
    { sort: "newest", key: "2026-07-27T10:00:00.123456Z", id: "11111111-1111-1111-1111-111111111111" },
    { sort: "price_asc", key: "12.34", id: "22222222-2222-2222-2222-222222222222" },
    { sort: "price_desc", key: "9999.99", id: "33333333-3333-3333-3333-333333333333" },
    { sort: "relevance", key: "0.4218750", id: "44444444-4444-4444-4444-444444444444" },
  ])("round-trips for $sort", (want) => {
    expect(decodeCursor(encodeCursor(want))).toEqual(want);
  });

  it("carries the sort it was issued under — a newest cursor never reads as a price cursor", () => {
    const got = decodeCursor(encodeCursor({ sort: "newest", key: "2026-07-27T10:00:00Z", id: "11111111-1111-1111-1111-111111111111" }));
    expect(got?.sort).toBe("newest");
  });

  it("is an opaque url-safe token", () => {
    expect(encodeCursor({ sort: "newest", key: "k", id: "i" })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ["not base64", "!!!!"],
    ["empty", ""],
    ["wrong field count", raw("2|newest|key")],
    ["unknown version", raw("1|newest|key|id")],
    ["legacy v1 form", raw("2026-07-27T10:00:00Z|some-id")],
    ["unknown sort", raw("2|cheapest|key|id")],
    ["empty sort", raw("2||key|id")],
    ["empty key", raw("2|newest||id")],
    ["empty id", raw("2|newest|key|")],
  ])("rejects a malformed token: %s", (_name, token) => {
    expect(decodeCursor(token)).toBeNull();
  });
});

describe("parseSort", () => {
  it.each([
    ["", "newest"], // absent means the default, not an error
    ["newest", "newest"],
    ["price_asc", "price_asc"],
    ["price_desc", "price_desc"],
    ["relevance", "relevance"],
    [" newest ", "newest"], // trimmed
  ])("%j → %s", (input, want) => {
    expect(parseSort(input)).toBe(want);
  });

  it("treats a missing parameter as the default", () => {
    expect(parseSort(null)).toBe("newest");
    expect(parseSort(undefined)).toBe("newest");
  });

  it.each(["cheapest", "price", "NEWEST", "rand"])("%s is not a sort", (input) => {
    expect(parseSort(input)).toBeNull();
  });
});
