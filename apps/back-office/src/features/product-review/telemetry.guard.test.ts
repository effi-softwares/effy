import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// 067 — the review events must never carry a shop's money, Effy's margin, or free text about a
// shop's product. A type cannot say "no property named price"; reading the declarations can.
const SURFACES = [
  ["back-office", resolve(__dirname, "../../lib/telemetry.ts"), ["product_review_decided", "product_margin_set"]],
  [
    "shop-web",
    resolve(__dirname, "../../../../shop-web/src/lib/telemetry.ts"),
    ["product_submitted_for_review", "product_review_withdrawn"],
  ],
] as const;

/** The `{ … }` of one event's declaration. */
function declarationOf(source: string, name: string): string {
  const at = source.indexOf(`name: "${name}"`);
  if (at < 0) throw new Error(`event ${name} is not declared`);
  const open = source.lastIndexOf("{", at);
  const close = source.indexOf("}", at);
  return source.slice(open, close + 1);
}

describe("product review telemetry (067)", () => {
  for (const [surface, file, events] of SURFACES) {
    const source = readFileSync(file, "utf8");
    for (const event of events) {
      it(`${surface} · ${event} carries no price, margin value, name or reason`, () => {
        const props = declarationOf(source, event)
          .split(/[;\n]/)
          .map((line) => line.trim().split(":")[0]?.replace(/[{\s?]/g, ""))
          .filter((key): key is string => !!key && key !== "name" && key !== "}");
        expect(props.length).toBeGreaterThan(0);
        for (const key of props) {
          // `marginSet` is a boolean — THAT a margin was confirmed, never what it was.
          expect(key === "marginSet" || !/price|amount|margin|reason|productName|shopName|value/i.test(key), key).toBe(true);
        }
      });
    }
  }
});
