import { describe, expect, it } from "vitest";

import { edgeSources } from "../lib/edge-sources";

/**
 * 114: checkout stock holds have ONE writer (`stock/holds.ts`) and ONE reader of their sum (`lib/availability.ts`,
 * `stockHeldSql`). A second writer could hold without the size lock (two shoppers, one last unit); a second sum could
 * forget `held_until > now()` and keep a lapsed hold counting. Test files and migrations are exempt; `stock_hold_min`
 * (the setting) is a different word.
 */
const WRITE = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.stock_hold\b/i;
const MENTION = /\bstock_hold\b/;

export function writers(files: { file: string; text: string }[]): string[] {
  return files.filter(({ text }) => WRITE.test(text)).map(({ file }) => file).sort();
}

export function readers(files: { file: string; text: string }[]): string[] {
  return files.filter(({ text }) => MENTION.test(text)).map(({ file }) => file).sort();
}

describe("checkout stock holds have one writer and one sum (114)", () => {
  const files = edgeSources();

  it("only stock/holds.ts writes a hold", () => {
    expect(writers(files)).toEqual(["shared/src/stock/holds.ts"]);
  });

  it("only stock/holds.ts and lib/availability.ts name the table", () => {
    expect(readers(files)).toEqual(["shared/src/lib/availability.ts", "shared/src/stock/holds.ts"]);
  });

  it("is proven by breaking it: a second writer and a hand-written sum are both caught", () => {
    const broken = [
      ...files,
      { file: "commerce/src/rogue.ts", text: "await tx.query(`DELETE FROM public.stock_hold WHERE order_id = $1`)" },
      { file: "storefront/src/rogue.ts", text: "SELECT sum(quantity) FROM public.stock_hold WHERE variant_id = v.id" },
    ];
    expect(writers(broken)).toContain("commerce/src/rogue.ts");
    expect(readers(broken)).toContain("storefront/src/rogue.ts");
  });

  it("does not mistake the setting for the table", () => {
    expect(readers([{ file: "x.ts", text: "SELECT stock_hold_min FROM public.housekeeping_settings" }])).toEqual([]);
  });
});
