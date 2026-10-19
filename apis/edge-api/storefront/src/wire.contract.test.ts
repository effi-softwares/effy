import { kotlinFixture } from "@effy/edge-shared/testing";
import { describe, expect, it } from "vitest";

import { toBanner } from "./promotions/service";

/**
 * ⚠ WHAT THE MOBILE APP DECODES IS WHAT THIS SERVICE SENDS (070 FR-035). The fixture is read out of
 * the mobile app's own contract test and compared with the REAL mapper's output — see the note in
 * `@effy/edge-shared/testing`.
 */
describe("a Home banner", () => {
  it("byte for byte — `position` an integer, the target its own promotion, the terms composed here", async () => {
    // 094 — banners are built from a display group's promotions; the wire is unchanged for installed apps.
    const banner = toBanner(
      {
        id: "3f2a", kind: "cart", headline: "20% off your first order", supportingLine: "Stock up", label: null, code: "FIRST20",
        terms: "On orders over $30.00", endsIn: null, target: { kind: "promotion", promotionId: "3f2a" },
      },
      "carousel",
      2,
    );
    expect(JSON.stringify(banner)).toBe(kotlinFixture("features/catalog/BannerWireContractTest.kt", "BANNER_WIRE_JSON"));
  });
});
