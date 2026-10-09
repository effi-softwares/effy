import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminDeliveryMoveDTO } from "@effy/shared-types";

import { compensationSummary, DeliveryHistory } from "./DeliveryHistory";

const toCourier: AdminDeliveryMoveDTO = {
  id: "m1", at: "2026-10-09T03:00:00.000Z", to: "courier", reason: "Van off the road", actor: { sub: "s", name: "Sam Manager" },
  window: { date: "2026-10-09", start: "2026-10-09T05:00:00.000Z", end: "2026-10-09T07:00:00.000Z" },
  courier: { courierName: "Test Courier", serviceName: "Parcel", collection: "hub" },
  paidDeliveryAmount: "9.00", courierFeeAmount: "6.50", differenceAmount: "2.50",
  compensation: "points_difference", amount: "2.50", points: 250, refundStatus: null, compensationNote: null,
};

describe("081 — the order's moves", () => {
  it("one row per move: who, why, the window given up, the money and what the customer got", () => {
    render(<DeliveryHistory moves={[toCourier]} formatDateTime={(iso) => `@${iso.slice(11, 16)}`} />);
    const table = screen.getByRole("table", { name: "Moves by back-office" });
    expect(table).toHaveTextContent("Moved to courier delivery");
    expect(table).toHaveTextContent("Van off the road");
    expect(table).toHaveTextContent("Window given up:");
    expect(table).toHaveTextContent("Paid $9.00 · courier $6.50 · difference $2.50");
    expect(table).toHaveTextContent("Points for the difference: 250 points ($2.50)");
    expect(table).toHaveTextContent("Sam Manager");
  });

  it("a refund says where it stands; nothing given says why; a move back moved no money", () => {
    expect(compensationSummary({ ...toCourier, compensation: "refund_difference", points: null, refundStatus: "submitted" }))
      .toBe("The difference, back to the card: $2.50 · refund submitted");
    expect(compensationSummary({ ...toCourier, compensation: "none", amount: "0.00", points: null, compensationNote: "Asked for it" }))
      .toBe("Nothing given — Asked for it");
    expect(compensationSummary({ ...toCourier, to: "effy", compensation: "none" })).toBe("No money moved");
  });

  it("nothing at all for an order never moved", () => {
    const { container } = render(<DeliveryHistory moves={[]} formatDateTime={(i) => i} />);
    expect(container).toBeEmptyDOMElement();
  });
});
