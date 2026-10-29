import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { OrderDetail } from "../model"
import { DeliveryTypeSection } from "./DeliveryTypeSection"

const order = (over: Partial<OrderDetail>): OrderDetail =>
  ({
    deliveryType: null,
    deliveryTypeReason: null,
    courierEstimate: null,
    ...over,
  }) as OrderDetail

describe("079 — the order's delivery type, for staff", () => {
  it("a courier order: who, why, and what the customer was told", () => {
    render(
      <DeliveryTypeSection
        order={order({
          deliveryType: "courier",
          deliveryTypeReason: "out_of_coverage",
          courierEstimate: "2–4 business days",
        })}
      />,
    )
    expect(screen.getByText("Courier delivery", { selector: "dd" })).toBeInTheDocument()
    expect(screen.getByText("The address is outside Effy's delivery area", { selector: "dd" })).toBeInTheDocument()
    // The estimate as sold, in the customer's sentence — an estimate, said as one.
    expect(
      screen.getByText("Usually arrives in 2–4 business days — an estimate, not a guaranteed date."),
    ).toBeInTheDocument()
    // How the type was decided, and every change since, is the order's activity (104).
    expect(screen.queryByRole("table", { name: "Delivery type history" })).toBeNull()
  })

  it("an Effy order shows no estimate", () => {
    render(<DeliveryTypeSection order={order({ deliveryType: "effy", deliveryTypeReason: "in_coverage" })} />)
    expect(screen.getByText("Delivered by Effy", { selector: "dd" })).toBeInTheDocument()
    expect(screen.queryByText("Customer was told")).not.toBeInTheDocument()
  })
})

describe("081 — moves by back-office, on the order", () => {
  it("a customer-service agent is offered no move; the moves are in the order's activity (104)", () => {
    render(
      <DeliveryTypeSection
        order={order({
          id: "o1",
          status: "paid",
          deliveryType: "courier",
          deliveryTypeReason: "staff_change",
        } as Partial<OrderDetail>)}
      />,
    )
    expect(screen.queryByRole("table", { name: "Moves by back-office" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Send by courier|Deliver by Effy/ })).not.toBeInTheDocument()
  })
})
