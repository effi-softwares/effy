import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

/**
 * "CAN A SHOPPER BUY THIS?" is decided in one place. Fails on any hand-written `status = 'active'` in
 * shopper code unless an `availability-exempt: <table> — <why>` comment sits within eight lines above.
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

  // A guard that scans nothing passes forever.
  expect(scanned).toBeGreaterThan(15);
  expect(
    offences,
    `availability is decided by hand in ${offences.length} place(s). Use variantPurchasableSql / productAvailableSql in SQL or ` +
      `purchasable(...) in code, or mark the line \`${EXEMPT} <table> — <why>\`:\n  ${offences.join("\n  ")}`,
  ).toEqual([]);
});
