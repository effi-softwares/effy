import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

/**
 * ⚠ "CAN A SHOPPER BUY THIS?" IS DECIDED IN ONE PLACE (054 FR-012, SC-012).
 *
 * Before 054 the rule was the literal `p.status = 'active'`, written by hand in fourteen places.
 * Adding stock meant changing the answer in every one of them, and a missed one would have left a
 * surface quietly selling something the shop does not have — no error, no log line, no failing
 * test. A second copy of a rule does not conflict with the first; it disagrees with it in silence.
 *
 * So this fails on any hand-written `status = 'active'` in shopper-facing code. If the line is
 * about some OTHER table (a category's lifecycle, a delivery zone's, a promotion's) or is a
 * deliberate LISTING filter, say so with an `availability-exempt: <table> — <why>` comment within
 * the eight lines above it. The marker is the record that someone decided.
 *
 * Ported from the retired Go backend's `platform/availability/guard_test.go` (070).
 */

const here = dirname(fileURLToPath(import.meta.url));
const edgeRoot = resolve(here, "..", "..");

/** Shopper-facing code: both shopper services and the shared rules they compose. */
const ROOTS = [
  "storefront/src",
  "commerce/src",
  "shared/src/delivery",
  "shared/src/cart-policy",
  "shared/src/payments",
];

/** The rule's own home is the one place allowed to state it. */
const RULE_HOME = /shared\/src\/lib\/availability(\.test)?\.ts$/;

const HAND_WRITTEN = /\b([a-z_]+\.)?status\s*(=|==|!=|<>)\s*['"]active['"]/;
const EXEMPT = "availability-exempt:";

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

it("no shopper-facing code decides product availability by hand", () => {
  const offences: string[] = [];
  let scanned = 0;

  for (const root of ROOTS) {
    for (const file of sourceFiles(resolve(edgeRoot, root))) {
      if (RULE_HOME.test(file)) continue;
      scanned += 1;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!HAND_WRITTEN.test(line)) return;
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("--") || t.startsWith("*")) return;
        if (lines.slice(Math.max(0, i - 8), i + 1).join("\n").includes(EXEMPT)) return;
        offences.push(`${relative(edgeRoot, file)}:${i + 1}  ${t}`);
      });
    }
  }

  // A guard that scans nothing passes forever. The storefront alone is well past this.
  expect(scanned).toBeGreaterThan(15);
  expect(
    offences,
    `availability is decided by hand in ${offences.length} place(s). Use availabilityPredicate(alias) in SQL or ` +
      `purchasable(...) in code, or mark the line \`${EXEMPT} <table> — <why>\`:\n  ${offences.join("\n  ")}`,
  ).toEqual([]);
});
