import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A customer's update is built in three places and nowhere else, each deciding from the order, never
 * from a shop, so updates never reveal how many shops fill an order: `announcePaid`
 * (payments/finalize.ts), `changesForMoves` and `announceOrder` (live/order-moves.ts).
 * `announcePoints` (points/announce.ts) is a fourth for points only: its ledger names no shop.
 */
const here = dirname(fileURLToPath(import.meta.url));
const edgeApi = resolve(here, "../../..");

const ALLOWED = new Set([
  "shared/src/live/announce.ts",
  "shared/src/live/order-moves.ts",
  "shared/src/payments/finalize.ts",
  "shared/src/points/announce.ts",
]);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = resolve(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

describe("071 — who may build a customer's update", () => {
  const files = sources(edgeApi).map((path) => ({ rel: relative(edgeApi, path), source: readFileSync(path, "utf8") }));

  it("only the three shared functions construct one", () => {
    const builders = files.filter((f) => /scope:\s*"customer"/.test(f.source)).map((f) => f.rel);
    expect(builders.filter((f) => !ALLOWED.has(f))).toEqual([]);
    expect(builders).toEqual(expect.arrayContaining(["shared/src/live/order-moves.ts", "shared/src/payments/finalize.ts"]));
  });

  it("the customer variant of a change has no field a shop could be put in", () => {
    const announce = files.find((f) => f.rel === "shared/src/live/announce.ts")!.source;
    const variant = /\{ scope: "customer";([^}]*)\}/.exec(announce)?.[1] ?? "";
    expect(variant.replace(/\s+/g, " ").trim()).toBe('sub: string; kind: "orders" | "points"');
  });

  it("package moves reach the customer only through the stage rule", () => {
    const moves = files.find((f) => f.rel === "shared/src/live/order-moves.ts")!.source;
    const inMoves = moves.slice(moves.indexOf("export function changesForMoves"), moves.indexOf("export async function announceMoves"));
    expect(inMoves).toMatch(/if \(customerViewChanged\(before, after\)\) \{\s*changes\.push\(\{ scope: "customer"/);
    expect(inMoves.match(/scope: "customer"/g)).toHaveLength(1);
  });
});
