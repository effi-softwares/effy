import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TaxInvoiceBlock } from "./TaxInvoiceBlock"

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => vi.unstubAllGlobals())

describe("Tax invoice on request (096 US8)", () => {
  it("issues on request and lists the invoice and its adjustment notes with downloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, {
      invoice: { kind: "invoice", number: "EFY-INV-000001", issuedAt: "2026-10-22T01:00:00Z" },
      adjustments: [{ kind: "adjustment", number: "EFY-ADJ-000002", issuedAt: "2026-10-23T01:00:00Z" }],
    }))
    vi.stubGlobal("fetch", fetchMock)
    render(<TaxInvoiceBlock orderId="o-1" />)
    expect(fetchMock).not.toHaveBeenCalled() // never on page view
    await userEvent.click(screen.getByRole("button", { name: "Get tax invoice" }))
    const list = await screen.findByRole("list", { name: "Tax documents" })
    expect(list).toHaveTextContent("Tax invoice · EFY-INV-000001")
    expect(list).toHaveTextContent("Adjustment note · EFY-ADJ-000002")
    expect(screen.getAllByRole("link", { name: "Download PDF" })[0]).toHaveAttribute("href", "/api/orders/o-1/documents/tax?doc=EFY-INV-000001")
  })

  it("says it is not available yet in its own words", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(409, { error: "server prose", reason: "invoices_unavailable" })))
    render(<TaxInvoiceBlock orderId="o-1" />)
    await userEvent.click(screen.getByRole("button", { name: "Get tax invoice" }))
    expect(await screen.findByText("Tax invoices aren't available yet. Please try again later.")).toBeInTheDocument()
    expect(screen.queryByText("server prose")).toBeNull()
  })

  it("takes the business details before the invoice is issued", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    render(<TaxInvoiceBlock orderId="o-1" />)
    await userEvent.click(screen.getByRole("button", { name: "Add a business name and ABN (optional)" }))
    await userEvent.type(screen.getByLabelText("Business name"), "Lovelace Analytics")
    await userEvent.type(screen.getByLabelText("ABN"), "51 824 753 556")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/orders/o-1/business-identity")
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ businessName: "Lovelace Analytics", abn: "51824753556" })
    expect(await screen.findByText("Saved. Your business details will be on the invoice.")).toBeInTheDocument()
  })
})
