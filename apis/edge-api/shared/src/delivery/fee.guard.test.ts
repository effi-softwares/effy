import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 077 — three things about the fee that are true only while nobody adds a second copy, and that
 * every behavioural test would go on passing without.
 *
 *   P20  a customer contract carries lines and a total — never a distance, band, weight or plan —
 *        and a shop contract carries no delivery money at all (FR-032, FR-038, SC-012);
 *   P21  nothing reads a distance tier or a method multiplier any more (FR-040) — and this is what
 *        gates the migration that drops them;
 *   P22  fee parts are added up in ONE place, the engine (research R3).
 */
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../..");
const rel = (file: string) => relative(repo, file);
const SKIP = new Set(["node_modules", "build", ".next", "dist", ".serverless", "generated", ".gradle", "contract"]);

function files(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) files(path, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(path);
  }
  return out;
}

const isTest = (f: string) => /\.(test|spec)\.tsx?$/.test(f) || f.includes("/commonTest/") || f.includes("__tests__");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The interfaces a file declares, with their bodies. */
function interfaces(src: string): { name: string; body: string }[] {
  return [...stripComments(src).matchAll(/export interface (\w+)[^{]*\{([\s\S]*?)\n\}/g)].map((m) => ({ name: m[1]!, body: m[2]! }));
}
const fieldNames = (body: string) => [...body.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]!);

const types = resolve(repo, "packages/shared-types/src");

describe("P20 — what a customer and a shop are told about delivery", () => {
  /** Customer contracts that may carry a fee — as lines and a total, and nothing more. */
  const CUSTOMER = ["delivery.ts", "delivery-fee.ts", "checkout.ts", "order.ts"];
  const LEAKS = /(^|[a-z])(km|distance|band|grams|weight|plan|breakdown|basketCents|premium|hub)/i;

  it.each(CUSTOMER)("%s", (file) => {
    const found = interfaces(readFileSync(resolve(types, file), "utf8"));
    expect(found.length).toBeGreaterThan(0);
    for (const { name, body } of found) {
      const leaks = fieldNames(body).filter((f) => LEAKS.test(f));
      expect(leaks, `${file} ${name}`).toEqual([]);
    }
  });

  it("no shop contract carries delivery money", () => {
    const shopFiles = readdirSync(types).filter((f) => f.startsWith("shop-"));
    expect(shopFiles.length).toBeGreaterThan(2);
    for (const file of shopFiles) {
      for (const { name, body } of interfaces(readFileSync(resolve(types, file), "utf8"))) {
        expect(fieldNames(body).filter((f) => /delivery_?fee|deliveryFee|shipping/i.test(f)), `${file} ${name}`).toEqual([]);
      }
    }
  });

  it("no shop service query selects a delivery amount", () => {
    for (const file of files(resolve(repo, "apis/edge-api/shop/src"), [".ts"]).filter((f) => !isTest(f))) {
      expect(stripComments(readFileSync(file, "utf8")), rel(file)).not.toMatch(/delivery_fee_(amount|breakdown)/);
    }
  });

  it("a customer route reads only the LINES of what an order stored", () => {
    // The column holds the plan, the distance and the weight. Only `->'lines'` may leave for a customer.
    for (const dir of ["commerce", "storefront", "customer", "notifications"]) {
      for (const file of files(resolve(repo, `apis/edge-api/${dir}/src`), [".ts"]).filter((f) => !isTest(f))) {
        const src = stripComments(readFileSync(file, "utf8"));
        for (const m of src.matchAll(/delivery_fee_breakdown(?!\s*->\s*'lines')(?!\s*=\s*\$)/g)) {
          // Writing it (checkout) is allowed; selecting it whole is not.
          const line = src.slice(src.lastIndexOf("\n", m.index) + 1, src.indexOf("\n", m.index));
          expect(/INSERT|UPDATE|delivery_fee_breakdown\)|delivery_fee_breakdown=/.test(line) || /^\s*(points_used|delivery_fee_breakdown)/.test(line), `${rel(file)}: ${line.trim()}`).toBe(true);
        }
      }
    }
  });
});

describe("P21 — nothing reads a distance tier or a method multiplier", () => {
  const GONE = /\b(delivery_ring|delivery_ring_price|ring_id|ringPrice\w*|coverage_ring_for_km|hub_distance_km|ring_is_overridden|suggested_ring_id|same_day_factor|standard_factor|factorMilli|sameDayFactor|standardFactor)\b/;
  const roots = ["apis", "apps", "packages"].map((d) => resolve(repo, d));
  const sources = roots
    .flatMap((r) => files(r, [".ts", ".tsx", ".kt"]))
    .filter((f) => !isTest(f) && !f.includes("/load-migrations"));

  it("scanned real source", () => {
    expect(sources.length).toBeGreaterThan(500);
  });

  it("no source file mentions one", () => {
    const offenders = sources.filter((f) => GONE.test(stripComments(readFileSync(f, "utf8")))).map(rel);
    expect(offenders).toEqual([]);
  });
});

describe("P22 — fee parts are added up in the engine alone", () => {
  const delivery = resolve(repo, "apis/edge-api/shared/src/delivery");
  const all = ["apis", "apps"].flatMap((d) => files(resolve(repo, d), [".ts", ".tsx"])).filter((f) => !isTest(f));

  it("only the engine adds a base to a band", () => {
    const sums = all.filter((f) => /\b(baseCents|distanceCents|weightCents|premiumCents)\s*\+/.test(stripComments(readFileSync(f, "utf8"))));
    expect(sums.map(rel)).toEqual([rel(resolve(delivery, "engine.ts"))]);
  });

  it("only the engine, and the code that feeds it a plan, picks a band", () => {
    const pickers = all.filter((f) => /\b(distanceBandFor|weightBandFor)\(/.test(stripComments(readFileSync(f, "utf8"))));
    expect(pickers.map(rel)).toEqual([rel(resolve(delivery, "engine.ts"))]);
  });

  it("checkout and the simulator price through the engine's two functions", () => {
    for (const f of [resolve(delivery, "quote.ts"), resolve(repo, "apis/edge-api/admin/src/delivery/pricing.service.ts")]) {
      expect(stripComments(readFileSync(f, "utf8")), rel(f)).toMatch(/\b(effyFee|courierFee|priceEffyOrder)\(/);
    }
  });
});
