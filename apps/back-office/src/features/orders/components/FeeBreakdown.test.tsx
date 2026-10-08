import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DeliveryFeeBreakdownDTO } from "@effy/shared-types";

import { FeeBreakdown } from "./FeeBreakdown";

const stored: DeliveryFeeBreakdownDTO = {
  v: 1, kind: "effy", plan: { id: "p1", name: "Spring 2026" },
  inputs: { km: 12.4, grams: 6200, basketCents: 1500, slotId: "s1", windowIsToday: true },
  parts: {
    baseCents: 300, distanceCents: 200, distanceBandUpperKm: 20, weightCents: 150, weightBandUpperGrams: 15000,
    premiumCents: 300, rawCents: 950, roundedCents: 950, clamp: null, deliveryCents: 950, freeApplied: false,
    smallOrderCents: 300, totalCents: 1250,
  },
  lines: [
    { kind: "delivery", amount: "6.50" }, { kind: "window_surcharge", amount: "3.00" }, { kind: "small_order", amount: "3.00" },
  ],
};

describe("How the delivery fee was built (077 FR-037)", () => {
  it("names the plan, every step with its band, and the lines the customer was shown", () => {
    render(<FeeBreakdown breakdown={stored} />);
    expect(screen.getByText("Priced by Spring 2026 when the order was placed.")).toBeInTheDocument();
    expect(screen.getByText("12.4 km — the band up to 20 km")).toBeInTheDocument();
    expect(screen.getByText("6.2 kg — the band up to 15 kg")).toBeInTheDocument();
    expect(screen.getByText("a window today")).toBeInTheDocument();
    expect(screen.getByText("the basket was $15.00")).toBeInTheDocument();
    expect(screen.getAllByText("Window surcharge")).toHaveLength(2); // the step, and the customer's line
    expect(screen.getByText("$12.50")).toBeInTheDocument();
  });

  it("says when the free-delivery amount was reached", () => {
    render(<FeeBreakdown breakdown={{ ...stored, parts: { ...stored.parts, freeApplied: true, deliveryCents: 0, smallOrderCents: 0, totalCents: 0 }, lines: [{ kind: "delivery", amount: "6.50" }, { kind: "free_delivery", amount: "-6.50" }] }} />);
    expect(screen.getByText(/reached the free-delivery amount/)).toBeInTheDocument();
    expect(screen.getByText("−$6.50")).toBeInTheDocument();
  });
});
