import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 066 — SHOPS AND EMAILS NEVER SEE A CUSTOMER'S DELIVERY INSTRUCTIONS (FR-025, FR-027).
 *
 * The note is customer-authored free text that may hold a gate code or a phone number. It is shown
 * to the customer, the assigned driver and back-office staff, and to nobody else. That is why it is
 * stored in its own columns rather than inside `order.delivery_address`: the address snapshot is
 * read by the shop console and by the receipt email, and a key inside it would be one mapper
 * refactor away from both.
 *
 * Columns only help if nobody selects them. This reads every source file of the two services that
 * must never touch them and fails NAMING the file — because the day someone adds "the delivery note"
 * to a pick list to be helpful, nothing else will fail: the value is valid, the query runs, the
 * screen renders.
 */

const EDGE_API = fileURLToPath(new URL("../..", import.meta.url));
const FORBIDDEN_FOR = ["shop", "notifications"] as const;
const BANNED = ["delivery_note", "delivery_handover", "deliveryInstructions"];

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

describe("066 — delivery instructions stay out of shop and email code paths", () => {
  for (const service of FORBIDDEN_FOR) {
    it(`edge-api/${service} never references them`, () => {
      const files = sourceFiles(join(EDGE_API, service, "src"));
      // A guard that scanned nothing would pass for ever.
      expect(files.length).toBeGreaterThan(10);

      const offenders = files
        .filter((f) => {
          const body = readFileSync(f, "utf8");
          return BANNED.some((b) => body.includes(b));
        })
        .map((f) => relative(EDGE_API, f));

      expect(offenders, `these files must not read a customer's delivery instructions`).toEqual([]);
    });
  }
});
