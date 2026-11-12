import { describe, expect, it } from "vitest";

import { edgeSources } from "../lib/edge-sources";

/**
 * 113: an order becomes `abandoned` only in `finalizeAbandoned`, and that is reached only through `abandonOrder`, which
 * makes sure the payment can no longer be taken first. (`placed-order.guard` covers the readers; this covers writers.)
 */
describe("abandoning an order has one path (113)", () => {
  const files = edgeSources();

  it("only finalize.ts writes status 'abandoned'", () => {
    const writers = files
      .filter(({ text }) => /SET\s+status\s*=\s*'abandoned'/i.test(text))
      .map(({ file }) => file);
    expect(writers).toEqual(["shared/src/payments/finalize.ts"]);
  });

  it("only abandon.ts calls finalizeAbandoned", () => {
    const callers = files
      .filter(({ file, text }) => file !== "shared/src/payments/finalize.ts" && /finalizeAbandoned\(/.test(text))
      .map(({ file }) => file);
    expect(callers).toEqual(["shared/src/payments/abandon.ts"]);
  });
});
