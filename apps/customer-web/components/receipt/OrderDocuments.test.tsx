import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { OrderDocuments } from "./OrderDocuments"

const note = {
  orderNumber: "EFY-ESDPKF",
  placedAt: "2026-10-20T01:00:00Z",
  deliveredAt: "2026-10-21T05:00:00Z",
  contact: "hello@effyshopping.com" as const,
  lines: [
    { name: "Full cream milk 2L", ordered: 3, supplied: 3, status: "supplied" as const },
    { name: "Sourdough loaf", ordered: 3, supplied: 1, status: "part" as const },
    { name: "Free-range eggs", ordered: 1, supplied: 0, status: "unavailable" as const },
  ],
}

describe("Order documents (096 US7)", () => {
  it("shows the delivery note's lines, marks part and unavailable, and offers the PDF", () => {
    render(<OrderDocuments orderId="o-1" note={note} />)
    const table = screen.getByRole("table", { name: "Delivery note" })
    expect(table).toHaveTextContent("Sourdough loaf")
    expect(table).toHaveTextContent("Part supplied")
    expect(table).toHaveTextContent("Unavailable")
    expect(table).not.toHaveTextContent("$")
    expect(screen.getByRole("link", { name: "Download delivery note (PDF)" })).toHaveAttribute("href", "/api/orders/o-1/documents/delivery-note")
    expect(document.getElementById("documents")).not.toBeNull()
  })

  it("says when it will be ready before the order arrives", () => {
    render(<OrderDocuments orderId="o-1" note={null} />)
    expect(screen.getByText("Your delivery note will be here once your order has arrived.")).toBeInTheDocument()
    expect(screen.queryByRole("link")).toBeNull()
  })
})
