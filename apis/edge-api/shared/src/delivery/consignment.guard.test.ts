import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 080 P13 — courier fulfilment's single writers, which every behavioural test would go on passing
 * without:
 *
 *   1. A consignment, its events, a courier order's collection mode and its history are written in
 *      `consignment.ts` only. A second writer is a second idea of where a parcel is.
 *   2. "Handed over" (`carrier_handoff`) is written by `consignment.ts` only — the orders and shop
 *      services both hand parcels over, through it.
 *   3. Whether a package reaches its courier from the supplier is `courier_parcel_collection` — asked
 *      through the one SQL fragment, so the planner and the hub list cannot disagree about a parcel.
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
const writing = (table: string) =>
  sources.filter((s) => new RegExp(`(INSERT INTO|UPDATE|DELETE FROM)\\s+public\\.("order"\\s+SET\\s+courier_collection|${table}\\b)`).test(s.src)).map((s) => s.file).sort();

describe("080 — courier fulfilment's one writers", () => {
  it("scans the services", () => expect(sources.length).toBeGreaterThan(300));

  it.each(["courier_consignment", "courier_consignment_event", "order_courier_collection_change", "carrier_handoff"])(
    "%s is written by consignment.ts only",
    (table) => expect(writing(table)).toEqual(["shared/src/delivery/consignment.ts"]),
  );

  it("a courier order's collection mode is changed by consignment.ts only (checkout sets it on the pending order)", () => {
    const where = sources.filter((s) => /courier_collection\s*=\s*\$/.test(s.src)).map((s) => s.file).sort();
    expect(where).toEqual(["commerce/src/checkout/store.ts", "shared/src/delivery/consignment.ts"]);
  });

  it("courier_parcel_collection( is reached through the one fragment", () => {
    expect(sources.filter((s) => s.src.includes("courier_parcel_collection(")).map((s) => s.file)).toEqual(["shared/src/delivery/consignment.ts"]);
  });
});
