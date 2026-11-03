import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 106: `public.console_tour_state` has ONE reader and writer - `@effy/edge-shared/tours` `store.ts`. Services read and
 * change a person's tour state through `getTourState` / `changeTourState`, never with their own SQL.
 */

const edgeApi = resolve(__dirname, "../../..");
const HOME = "shared/src/tours/store.ts";

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) yield full;
  }
}

const files = [...sources(edgeApi)].map((f) => ({ rel: relative(edgeApi, f), text: readFileSync(f, "utf8") }));

describe("106 - the tour state has one reader and writer", () => {
  it("found the store (the guard must not pass vacuously)", () => {
    expect(files.some((f) => f.rel === HOME && f.text.includes("console_tour_state"))).toBe(true);
  });

  it("no other source names the table", () => {
    expect(files.filter((f) => f.rel !== HOME && f.text.includes("console_tour_state")).map((f) => f.rel)).toEqual([]);
  });
});
