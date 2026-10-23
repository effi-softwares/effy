import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Stock never waits for review: a shop must be able to say "we have run out" at once. Nothing in the
 * inventory service may route through the pending-change path or touch `review_state`.
 */

const EDGE_API = fileURLToPath(new URL("../..", import.meta.url));
const BANNED = ["product_change", "review_state", "approved_at", "submitForReview", "saveProposal"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("067 — the inventory service knows nothing about product review", () => {
  it("no stock code path references a pending change or a review state", () => {
    const files = sourceFiles(join(EDGE_API, "inventory", "src"));
    expect(files.length).toBeGreaterThan(5);

    const offenders = files
      .filter((f) => {
        const body = readFileSync(f, "utf8");
        return BANNED.some((b) => body.includes(b));
      })
      .map((f) => relative(EDGE_API, f));

    expect(offenders, "stock must apply immediately and never touch review").toEqual([]);
  });
});
