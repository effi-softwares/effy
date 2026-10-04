import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 067 — STOCK NEVER WAITS FOR REVIEW (FR-023, FR-026).
 *
 * The client excluded stock from approval by name: a shop that must wait for Effy before it can say
 * "we have run out" is worse off than it was. Stock lives in its own service (`edge-api/inventory`)
 * and its own columns, and today nothing in that service knows review exists.
 *
 * This keeps it that way. The risk is not that someone deletes the exemption — it is that someone
 * "consistently" routes a stock write through the pending-change path, or makes a stock adjustment
 * touch `review_state`, because every other product write now does. Nothing would fail: the count
 * would simply stop moving until an admin looked.
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
    expect(files.length).toBeGreaterThan(5); // a guard that scanned nothing would pass for ever

    const offenders = files
      .filter((f) => {
        const body = readFileSync(f, "utf8");
        return BANNED.some((b) => body.includes(b));
      })
      .map((f) => relative(EDGE_API, f));

    expect(offenders, "stock must apply immediately and never touch review").toEqual([]);
  });
});
