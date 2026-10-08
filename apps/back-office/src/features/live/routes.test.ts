import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { LIVE_ROUTES } from "./routes";

// A key prefix that is the root of no declared query re-reads nothing, silently — the screen it was
// meant to keep current simply stops updating. So each prefix here must appear in a slice's queries.
const features = resolve(__dirname, "..");
const SOURCES = ["orders", "dispatch", "drivers", "exceptions", "delivery", "product-review", "customers"].map((slice) =>
  readFileSync(resolve(features, slice, "queries.ts"), "utf8"),
);

describe("LIVE_ROUTES", () => {
  it("every prefix is the root of a query the console declares", () => {
    for (const prefixes of Object.values(LIVE_ROUTES)) {
      for (const prefix of prefixes ?? []) {
        const parts = prefix as string[];
        // The delivery slice builds its keys as `[...ROOT, "slots"]`; the others write the root out.
        const literal = `[${parts.map((p) => `"${p}"`).join(", ")}]`;
        const spread = parts.length === 3 ? `[...ROOT, "${parts[2]}"]` : null;
        const found = SOURCES.some((s) => s.includes(literal) || (spread !== null && s.includes(spread) && s.includes(`["${parts[0]}", "${parts[1]}"]`)));
        expect(found, `${literal} is declared nowhere`).toBe(true);
      }
    }
  });

  it("covers what back-office is told about (FR-029)", () => {
    // 074 — `points`: a customer's balance changed.
    // 076 — `coverage`: where Effy delivers changed.
    // 077 — `pricing`: a fee plan was saved or made active.
    expect(Object.keys(LIVE_ROUTES).sort()).toEqual(["coverage", "dispatch", "orders", "points", "pricing", "review", "slots"]);
  });
});
