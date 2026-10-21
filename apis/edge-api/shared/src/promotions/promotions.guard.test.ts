import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 094 — promotions live once (R2), which no behavioural test would notice being broken:
 *
 *   1. `promotion_use` is written by `uses.ts` only. A second writer is a second idea of how many
 *      uses are left, and the caps and the budget stop holding.
 *   2. A promotion's definition (`promotion`, `promotion_code`, `promotion_target`,
 *      `promotion_customer`, `promotion_group`, `promotion_group_member`) is written by back-office's
 *      admin service only.
 *   3. Those tables are READ only here (`shared/src/promotions`) and by the admin service. The cart, the
 *      intent and both group reads come through `candidates.ts`, so "what applies now" has one answer.
 *   4. No shop service reads a promotion or what an order's promotions were (FR-035).
 *   5. Nothing outside `engine.ts` works out a discount: the 027 evaluator is gone.
 *   7. 095 — skins and pictures (`promotion_skin`, `promotion_image`) are written by the admin service only
 *      and read here and there; a shop never reads them.
 *   6. Nothing names 027's tables or their keys (`promo_code`, `promo_redemption`, `promo_code_id`,
 *      `legacy_promo_code_id`) — stage C drops them. `order.promo_code`, the code's TEXT, stays.
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

const DEFINITION = "promotion|promotion_code|promotion_target|promotion_customer|promotion_group|promotion_group_member";
const ADMIN = /^admin\/src\/(promotions|promotion-groups|promotion-skins)\//;
const SHARED = /^shared\/src\/promotions\//;

describe("094 — promotions live once", () => {
  it("scans the services", () => expect(sources.length).toBeGreaterThan(300));

  it("promotion_use is written by uses.ts only", () => {
    const writers = sources
      .filter((s) => /(INSERT INTO|UPDATE|DELETE FROM)\s+public\.promotion_use\b/.test(s.src))
      .map((s) => s.file);
    expect(writers).toEqual(["shared/src/promotions/uses.ts"]);
  });

  it("a promotion's definition is written by the admin service only", () => {
    const writers = sources
      .filter((s) => new RegExp(`(INSERT INTO|UPDATE|DELETE FROM)\\s+public\\.(${DEFINITION})\\b`).test(s.src))
      .map((s) => s.file)
      .filter((f) => !ADMIN.test(f));
    expect(writers).toEqual([]);
  });

  it("the promotion tables are read here and by the admin service only", () => {
    const readers = sources
      .filter((s) => new RegExp(`(FROM|JOIN)\\s+public\\.(${DEFINITION}|promotion_use)\\b`).test(s.src))
      .map((s) => s.file)
      .filter((f) => !ADMIN.test(f) && !SHARED.test(f));
    expect(readers).toEqual([]);
  });

  it("no shop service reads a promotion or an order's promotions", () => {
    const shop = sources.filter((s) => s.file.startsWith("shop/") && /public\.(promotion\w*|order_promotion)\b/.test(s.src)).map((s) => s.file);
    expect(shop).toEqual([]);
  });

  it("promotion_state( is asked, never re-derived from the columns", () => {
    // A second reading of "is it live" would be dates and a switch checked one way here and another there.
    const reDerived = sources
      .filter((s) => /published_at\s+IS\s+NOT\s+NULL[\s\S]{0,200}archived_at\s+IS\s+NULL[\s\S]{0,200}paused/.test(s.src))
      .map((s) => s.file)
      .filter((f) => f !== "shared/src/promotions/uses.ts");
    expect(reDerived).toEqual([]);
  });

  it("nothing names 027's promotion tables (stage C removes them)", () => {
    const old = sources
      .filter((s) => /\bpublic\.promo_(code|redemption)\b|\bpromo_redemption\b|\b(legacy_)?promo_code_id\b/.test(s.src))
      .map((s) => s.file);
    expect(old).toEqual([]);
  });

  it("095 — skins and pictures are written by the admin service and read here and there only", () => {
    const writers = sources
      .filter((s) => /(INSERT INTO|UPDATE|DELETE FROM)\s+public\.promotion_(skin|image)\b/.test(s.src))
      .map((s) => s.file)
      .filter((f) => !ADMIN.test(f));
    expect(writers).toEqual([]);
    const readers = sources
      .filter((s) => /(FROM|JOIN)\s+public\.promotion_(skin|image)\b/.test(s.src))
      .map((s) => s.file)
      .filter((f) => !ADMIN.test(f) && !SHARED.test(f));
    expect(readers).toEqual([]);
  });
});
