import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DELIVERY_FEE_LINE_LABEL, DELIVERY_FEE_WORDS } from "./delivery-fee";

// 077 — the mobile app cannot import this package, so its copy of the delivery-fee words lives once,
// in `DeliveryFeeWords.kt`. This is what keeps that copy from drifting: a word changed here and not
// there turns this red. (The 071 LiveKind and 076 CoverageWords pattern.)
const kotlin = resolve(
  __dirname,
  "../../../apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/presentation/DeliveryFeeWords.kt",
);

describe("the Kotlin delivery-fee words", () => {
  it.runIf(existsSync(kotlin))("are exactly the words written here", () => {
    const source = readFileSync(kotlin, "utf8");
    const labels = Object.fromEntries(
      [...source.matchAll(/DeliveryFeeLineKind\.(\w+) -> "([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );
    expect(labels).toEqual({
      Delivery: DELIVERY_FEE_LINE_LABEL.delivery,
      WindowSurcharge: DELIVERY_FEE_LINE_LABEL.window_surcharge,
      SmallOrder: DELIVERY_FEE_LINE_LABEL.small_order,
      FreeDelivery: DELIVERY_FEE_LINE_LABEL.free_delivery,
    });
    const consts = Object.fromEntries([...source.matchAll(/const val (\w+) = "([^"]+)"/g)].map((m) => [m[1], m[2]]));
    expect(consts).toEqual({
      SPEND_MORE: DELIVERY_FEE_WORDS.spendMore,
      FREE_REACHED: DELIVERY_FEE_WORDS.freeReached,
      SMALL_ORDER: DELIVERY_FEE_WORDS.smallOrder,
      FEE_CHANGED: DELIVERY_FEE_WORDS.feeChanged,
    });
  });
});
