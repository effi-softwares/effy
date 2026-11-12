import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

/**
 * "CAN A SHOPPER BUY THIS?" is decided in one place. Fails on any hand-written `status = 'active'` in
 * shopper code unless an `availability-exempt: <table> — <why>` comment sits within eight lines above.
 * 114: also on a hand-written comparison against `stock_on_hand` - a shelf count compared by hand ignores checkout
 * holds (`leftToSell` / `stockHeldSql` are the rule). Same exemption comment.
 */

const here = dirname(fileURLToPath(import.meta.url));
const edgeRoot = resolve(here, "..", "..");

const ROOTS = [
  "storefront/src",
  "commerce/src",
  "shared/src/delivery",
  "shared/src/cart-policy",
  "shared/src/payments",
];

const RULE_HOME = /shared\/src\/lib\/availability(\.test)?\.ts$/;

// A variant's `state = 'active'` is half of the rule too.
const HAND_WRITTEN = /\b([a-z_]+\.)?(status|state)\s*(=|==|!=|<>)\s*['"]active['"]/;
// 114: `stock_on_hand > …`, `… <= v.stock_on_hand`, `row.stock_on_hand < x` - not `=>` and not inside COALESCE(…).
const STOCK_BY_HAND = /\bstock_on_hand(\s*,\s*0\s*\))?\s*(<=|>=|<|>)|(?<![=-])(<=|>=|<|>)\s*([a-z_]+\.)?stock_on_hand\b/;
const EXEMPT = "availability-exempt:";

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

it("the stock pattern catches a hand-written shelf comparison and nothing else", () => {
  expect(STOCK_BY_HAND.test("AND (NOT sv.stock_tracked OR sv.stock_on_hand > 0)")).toBe(true);
  expect(STOCK_BY_HAND.test("if (want > v.stock_on_hand) {")).toBe(true);
  expect(STOCK_BY_HAND.test("row.stock_on_hand < row.quantity")).toBe(true);
  expect(STOCK_BY_HAND.test("WHEN rv.stock_tracked AND coalesce(rv.stock_on_hand, 0) <= 0 THEN")).toBe(true);
  expect(STOCK_BY_HAND.test("LEAST(oi.quantity, oi.quantity - COALESCE(v.stock_on_hand, 0))")).toBe(false);
  expect(STOCK_BY_HAND.test("(r) => r.stock_on_hand")).toBe(false);
  expect(STOCK_BY_HAND.test("v.stock_on_hand AS stock_on_hand")).toBe(false);
});

it("no shopper-facing code decides product availability by hand", () => {
  const offences: string[] = [];
  let scanned = 0;

  for (const root of ROOTS) {
    for (const file of sourceFiles(resolve(edgeRoot, root))) {
      if (RULE_HOME.test(file)) continue;
      scanned += 1;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!HAND_WRITTEN.test(line) && !STOCK_BY_HAND.test(line)) return;
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("--") || t.startsWith("*")) return;
        if (lines.slice(Math.max(0, i - 8), i + 1).join("\n").includes(EXEMPT)) return;
        offences.push(`${relative(edgeRoot, file)}:${i + 1}  ${t}`);
      });
    }
  }

  // A guard that scans nothing passes forever.
  expect(scanned).toBeGreaterThan(15);
  expect(
    offences,
    `availability is decided by hand in ${offences.length} place(s). Use variantPurchasableSql / productAvailableSql in SQL or ` +
      `purchasable(...) in code, or mark the line \`${EXEMPT} <table> — <why>\`:\n  ${offences.join("\n  ")}`,
  ).toEqual([]);
});
