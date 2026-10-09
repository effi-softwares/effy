import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OrderDetail } from "../model";
import { DeliveryTypeSection } from "./DeliveryTypeSection";

const when = (iso: string | null) => (iso ? `@${iso.slice(11, 16)}` : "—");
const order = (over: Partial<OrderDetail>): OrderDetail =>
  ({ deliveryType: null, deliveryTypeReason: null, courierEstimate: null, deliveryTypeHistory: [], ...over }) as OrderDetail;

describe("079 — the order's delivery type, for staff", () => {
  it("a courier order: who, why, what the customer was told, and how it was decided", () => {
    render(
      <DeliveryTypeSection
        formatDateTime={when}
        order={order({
          deliveryType: "courier", deliveryTypeReason: "out_of_coverage", courierEstimate: "2–4 business days",
          deliveryTypeHistory: [{ from: null, to: "courier", reason: "out_of_coverage", actor: { kind: "checkout" }, note: null, at: "2026-10-09T03:00:00Z" }],
        })}
      />,
    );
    expect(screen.getByText("Courier delivery", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("The address is outside Effy's delivery area", { selector: "dd" })).toBeInTheDocument();
    // The estimate AS SOLD, in the customer's sentence — an estimate, said as one.
    expect(screen.getByText("Usually arrives in 2–4 business days — an estimate, not a guaranteed date.")).toBeInTheDocument();
    const rows = within(screen.getByRole("table", { name: "Delivery type history" })).getAllByRole("row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("@03:00");
    expect(rows[0]).toHaveTextContent("Decided at checkout");
  });

  it("a later change by staff: from → to, the note, and who", () => {
    render(
      <DeliveryTypeSection
        formatDateTime={when}
        order={order({
          deliveryType: "courier", deliveryTypeReason: "staff_change", courierEstimate: "3–5 business days",
          deliveryTypeHistory: [
            { from: null, to: "effy", reason: "in_coverage", actor: { kind: "checkout" }, note: null, at: "2026-10-09T03:00:00Z" },
            { from: "effy", to: "courier", reason: "staff_change", actor: { kind: "staff", sub: "sub-manager" }, note: "Van off the road", at: "2026-10-09T05:30:00Z" },
          ],
        })}
      />,
    );
    const rows = within(screen.getByRole("table", { name: "Delivery type history" })).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("Delivered by Effy → Courier delivery");
    expect(rows[1]).toHaveTextContent("Changed by staff — Van off the road");
    expect(rows[1]).toHaveTextContent("sub-manager");
  });

  it("an Effy order shows no estimate", () => {
    render(<DeliveryTypeSection formatDateTime={when} order={order({ deliveryType: "effy", deliveryTypeReason: "in_coverage" })} />);
    expect(screen.getByText("Delivered by Effy", { selector: "dd" })).toBeInTheDocument();
    expect(screen.queryByText("Customer was told")).not.toBeInTheDocument();
  });

  it("⚠ an order placed before delivery types says so, and invents nothing", () => {
    render(<DeliveryTypeSection formatDateTime={when} order={order({})} />);
    expect(screen.getByText(/placed before orders had a delivery type/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Delivered by")).not.toBeInTheDocument();
  });
});
