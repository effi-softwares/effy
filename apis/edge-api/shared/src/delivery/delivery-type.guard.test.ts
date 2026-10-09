import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 079 — three things about "who delivers an order" that are true only while nobody adds a second
 * copy, and that every behavioural test would go on passing without.
 *
 *   1. THE HISTORY HAS ONE WRITER. `order_delivery_type_change` is written by `recordDeliveryType`
 *      and by nothing else; a second writer is a second idea of what "from" was, and an entry that
 *      does not match the order it describes. The same function is the only thing that changes a
 *      PLACED order's type — checkout sets it on the pending order, and only there.
 *   2. WHO TAKES A PACKAGE IS THE DATABASE'S ANSWER (`public.package_delivered_by`). Until 079 "a
 *      standard package with a window is Effy's" was spelled out five times in the orders service;
 *      the reader that forgets the window hands an Effy parcel to a carrier.
 *   3. NOTHING REMEMBERS WHETHER A COURIER ORDER CAN BE PLACED. That was a constant three callers
 *      had to check; it is now part of the coverage answer itself.
 */
const here = dirname(fileURLToPath(import.meta.url));
const services = resolve(here, "../../..");
const rel = (file: string) => relative(services, file);
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
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "").replace(/\s--\s.*$/gm, "");

const sources = files(services).map((f) => ({ file: rel(f), src: stripComments(readFileSync(f, "utf8")) }));
const naming = (needle: string | RegExp) =>
  sources.filter((s) => (typeof needle === "string" ? s.src.includes(needle) : needle.test(s.src))).map((s) => s.file).sort();

describe("079 — the order's delivery type", () => {
  it("scans the services", () => {
    expect(sources.length).toBeGreaterThan(300);
  });

  it("the history table is named by its one writer and its one reader", () => {
    expect(naming("order_delivery_type_change")).toEqual([
      "orders/src/orders/repository.ts", // SELECT only — the back-office order page
      "shared/src/delivery/delivery-type.ts",
    ]);
  });

  it("and only the writer writes it", () => {
    expect(naming(/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.order_delivery_type_change/)).toEqual(["shared/src/delivery/delivery-type.ts"]);
  });

  it("an order's delivery type is SET in two places: the pending order at checkout, and the one writer", () => {
    expect(naming(/\bdelivery_type\s*=\s*\$/)).toEqual([
      "commerce/src/checkout/store.ts", // the pending order, rewritten on every payment attempt
      "orders/src/orders/repository.ts", // a WHERE, in the back-office list's filter
      "shared/src/delivery/delivery-type.ts",
    ]);
  });
});

describe("079 — who takes a package is decided in the database", () => {
  it("nothing in the orders or shop services decides it from the window", () => {
    const where = sources
      .filter((s) => /^(orders|shop)\/src\//.test(s.file))
      .filter((s) => /slot_id\s+IS\s+(NOT\s+)?NULL/i.test(s.src))
      .map((s) => s.file);
    expect(where).toEqual([]);
  });

  it("the function is reached through the one SQL fragment", () => {
    expect(naming("package_delivered_by(")).toEqual(["shared/src/delivery/delivery-type.ts"]);
  });
});

describe("079 — whether a courier order can be placed is part of the coverage answer", () => {
  it("the constant that used to say so is gone", () => {
    expect(naming("COURIER_ORDERING_AVAILABLE")).toEqual([]);
  });

  it("the courier functions are asked from the two places that own the question", () => {
    expect(naming("courier_reaches_postcode(")).toEqual(["shared/src/delivery/coverage.ts"]);
    expect(naming("courier_delivery_state(")).toEqual(["admin/src/delivery/coverage.repository.ts"]);
  });
});
