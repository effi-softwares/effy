import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { OPERATOR_REASONS, REASON_COURIER_OVERRIDE } from "../payments/refunds/state";

/**
 * A move is written in `override.ts` only and never rewritten; unassigning is one function
 * (`removeAssignment`); a delivery refund cannot be chosen from the refund dialog; the customer's view
 * names no reason, fee or difference.
 */
const here = dirname(fileURLToPath(import.meta.url));
const services = resolve(here, "../../..");
const SKIP = new Set(["node_modules", "build", "dist", ".serverless", "generated"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(name)) out.push(path);
  }
  return out;
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");
const sources = files(services).map((f) => ({ file: relative(services, f), src: strip(readFileSync(f, "utf8")) }));
const naming = (re: RegExp) => sources.filter((s) => re.test(s.src)).map((s) => s.file).sort();

describe("081 - the courier override's one writers", () => {
  it("scans the services", () => expect(sources.length).toBeGreaterThan(300));

  it("delivery_override is written by override.ts only", () => {
    expect(naming(/INSERT INTO\s+public\.delivery_override\b/)).toEqual(["shared/src/delivery/override.ts"]);
  });

  it("and never rewritten, by anything", () => {
    expect(naming(/(UPDATE|DELETE FROM)\s+public\.delivery_override\b/)).toEqual([]);
  });

  it("taking a package off a round is defined once", () => {
    expect(naming(/function removeAssignment\(/)).toEqual(["shared/src/delivery/driver-work.ts"]);
    expect(naming(/DELETE FROM public\.round_package WHERE id = \$1/)).toEqual(["shared/src/delivery/driver-work.ts"]);
  });

  it("a delivery refund is not an operator's reason", () => {
    expect(OPERATOR_REASONS.has(REASON_COURIER_OVERRIDE)).toBe(false);
  });

  it("the customer's order read selects no reason, fee or difference from a move", () => {
    const repo = sources.find((s) => s.file === "commerce/src/orders/repository.ts")!.src;
    const lateral = /FROM public\.delivery_override x[\s\S]*?\) mv ON true/.exec(repo)?.[0] ?? "";
    const select = /SELECT x\.to_type[^\n]*/.exec(repo.slice(repo.indexOf("LEFT JOIN LATERAL")))?.[0] ?? "";
    expect(lateral).not.toBe("");
    expect(select).not.toMatch(/courier_fee|difference|paid_delivery|note|change_id/);
  });
});
