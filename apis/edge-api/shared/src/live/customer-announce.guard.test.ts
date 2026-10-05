import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 071 FR-024 / FR-025 — A CUSTOMER'S UPDATE IS BUILT IN THREE PLACES AND NOWHERE ELSE.
 *
 * What a customer is told, and when, must not reveal which shop is handling their order, how many
 * shops there are, or what a shop is doing. That holds because every update to a customer comes
 * from one of three functions, each of which decides it from the ORDER, never from a shop:
 *
 *   · `announcePaid`    (payments/finalize.ts) — the order was paid: one update.
 *   · `changesForMoves` (live/order-moves.ts)  — packages moved: only if the customer's stage changed.
 *   · `announceOrder`   (live/order-moves.ts)  — a refund, a cancellation, a request: one update.
 *
 * A service that built its own `{ scope: "customer", … }` would bypass the stage rule — telling the
 * customer each time ANY shop moved, which on a split order reveals the split by count alone. So
 * no other file may construct one.
 */
const here = dirname(fileURLToPath(import.meta.url));
const edgeApi = resolve(here, "../../..");

const ALLOWED = new Set([
  "shared/src/live/announce.ts", // the type's own declaration
  "shared/src/live/order-moves.ts",
  "shared/src/payments/finalize.ts",
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
    expect(variant.replace(/\s+/g, " ").trim()).toBe('sub: string; kind: "orders"');
  });

  it("package moves reach the customer only through the stage rule", () => {
    const moves = files.find((f) => f.rel === "shared/src/live/order-moves.ts")!.source;
    const inMoves = moves.slice(moves.indexOf("export function changesForMoves"), moves.indexOf("export async function announceMoves"));
    expect(inMoves).toMatch(/if \(customerViewChanged\(before, after\)\) \{\s*changes\.push\(\{ scope: "customer"/);
    expect(inMoves.match(/scope: "customer"/g)).toHaveLength(1);
  });
});
