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
    const banner = await toBanner(
      {
        id: "3f2a", code: "FIRST20", banner_title: "20% off your first order", banner_subtitle: "Stock up", banner_image_key: null,
        banner_position: 2, minimum_subtotal_amount: "30.00", currency: "AUD", banner_placement: "carousel", ends_at: null,
      },
      async () => null,
    );
    expect(JSON.stringify(banner)).toBe(kotlinFixture("features/catalog/BannerWireContractTest.kt", "BANNER_WIRE_JSON"));
  });
});
