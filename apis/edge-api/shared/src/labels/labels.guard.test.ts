import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 096 — the bag record's one writers and its append-only tables, which every behavioural test would go
 * on passing without:
 *
 *   1. `package_handover` is written by `labels/handovers.ts` only; `label_read` by `labels/reads.ts`
 *      only; `label_print` by the shop's parcels repository only; `tax_document` by the documents module.
 *   2. Nothing UPDATEs or DELETEs `label_read`, `label_print`, `tax_document` or `package_handover`.
 *   3. Every writer of `shop_fulfillment` gives its packages bag 1 — no trigger does it.
 *   4. Every driver or fleet module that records a hand-over judges completeness through
 *      `expectedParcels` + `accountFor` — the one definition of "what this step still needs".
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
const writers = (table: string) =>
  sources.filter((s) => new RegExp(`INSERT INTO\\s+public\\.${table}\\b`).test(s.src)).map((s) => s.file).sort();
const changers = (table: string) =>
  sources.filter((s) => new RegExp(`(UPDATE\\s+public\\.${table}\\b|DELETE FROM\\s+public\\.${table}\\b)`).test(s.src)).map((s) => s.file);

describe("096 — the bag record's one writers", () => {
  it("scans the services", () => expect(sources.length).toBeGreaterThan(300));

  it("package_handover is written by labels/handovers.ts only", () =>
    expect(writers("package_handover")).toEqual(["shared/src/labels/handovers.ts"]));

  it("label_read is written by labels/reads.ts only", () => expect(writers("label_read")).toEqual(["shared/src/labels/reads.ts"]));

  it("label_print is written by the shop's parcels repository only", () =>
    expect(writers("label_print")).toEqual(["shop/src/parcels/repository.ts"]));

  it("tax_document is written by the documents module only", () =>
    expect(writers("tax_document")).toEqual(["shared/src/documents/tax-invoice.ts"]));

  it("every writer of shop_fulfillment gives its packages bag 1 (createFirstParcels) — no trigger does it", () => {
    const fanOut = sources.filter((s) => /INSERT INTO\s+public\.shop_fulfillment\b/.test(s.src));
    expect(fanOut.length).toBeGreaterThan(0);
    expect(fanOut.filter((s) => !/\bcreateFirstParcels\(/.test(s.src)).map((s) => s.file)).toEqual([]);
  });

  it.each(["label_read", "label_print", "tax_document", "package_handover"])("%s is never updated or deleted", (table) =>
    expect(changers(table)).toEqual([]));

  it("every driver or fleet hand-over judges completeness through expectedParcels + accountFor", () => {
    const recording = sources.filter((s) => /^(driver|fleet)\//.test(s.file) && /\brecordHandovers\(/.test(s.src));
    expect(recording.length).toBeGreaterThan(0);
    const without = recording
      .filter((s) => !(s.file in PER_SCAN))
      .filter((s) => !/\bexpectedParcels\(/.test(s.src) || !/\baccountFor\(/.test(s.src))
      .map((s) => s.file);
    expect(without).toEqual([]);
  });

  /**
   * ⚠ ONE named exception: the hub station checks in ONE scanned bag per read, so there is no "every
   * bag of the step" for `accountFor` to judge. What the run still owes is still the one definition —
   * `bagsToCheckIn`, built on `expectedParcels` — and the run closes only when that is empty.
   */
  const PER_SCAN: Record<string, RegExp> = { "fleet/src/hub/service.ts": /\bbagsToCheckIn\(/ };
  it("the hub station judges each scan against what the run still owes (bagsToCheckIn)", () => {
    for (const [file, needs] of Object.entries(PER_SCAN)) {
      const src = sources.find((s) => s.file === file)?.src;
      expect(src, `${file} is exempted but does not exist — remove it`).toBeDefined();
      expect(needs.test(src!)).toBe(true);
    }
  });

  /**
   * ⚠ FR-064 / 073 — a shop sees its own bags' records and never a driver's name. Any shop source that
   * reads the hand-over or read record must not join the driver table beside it.
   */
  it("no shop route reads a driver's name alongside a read or hand-over", () => {
    const leaking = sources
      .filter((s) => /^shop\//.test(s.file) && /public\.(package_handover|label_read)\b/.test(s.src))
      .filter((s) => /JOIN\s+public\.driver\b/.test(s.src))
      .map((s) => s.file);
    expect(leaking).toEqual([]);
  });
});
