import { describe, expect, it } from "vitest";

import { edgeSources } from "./edge-sources";

/**
 * 113: an order counts once it was placed - `PLACED_ORDER_SQL` (`placed_at IS NOT NULL`). A reader that lists the
 * statuses to leave out counts every new ending (113's `abandoned`) as an order, so that shape is refused outside the
 * money module, where it is the point.
 */
const ALLOWED = new Set([
  "shared/src/payments/finalize.ts",
  "shared/src/payments/abandon.ts",
  // "Stranded" holds: any order no longer awaiting payment that still holds points - the meaning is the status itself.
  "shared/src/points/reconcile.ts",
]);

describe("placed means placed_at (113)", () => {
  it("no reader excludes unpaid orders by listing statuses", () => {
    const offences = edgeSources().flatMap(({ file, text }) =>
      ALLOWED.has(file)
        ? []
        : text
            .split("\n")
            .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
            .filter(({ line }) => /status\s*(<>|!=)\s*'pending_payment'|NOT IN\s*\(\s*'pending_payment'/i.test(line))
            .map(({ at, line }) => `${at}  ${line.trim()}`),
    );
    expect(offences).toEqual([]);
  });
});
