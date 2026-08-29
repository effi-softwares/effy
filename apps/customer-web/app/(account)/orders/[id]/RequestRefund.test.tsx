import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const refresh = vi.hoisted(() => vi.fn())
const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }))

const { RequestRefund } = await import("./RequestRefund")

const ITEMS = [
  { orderItemId: "oi1", productName: "Milk", quantity: 2 },
  { orderItemId: "oi2", productName: "Bread", quantity: 1 },
]

function respond(status: number, body: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }),
  )
}

const open = async () =>
  userEvent.click(await screen.findByRole("button", { name: /something wrong with this order/i }))

beforeEach(() => {
  vi.clearAllMocks()
  respond(201, { requestId: "rq1" })
})

describe("what the form asks for", () => {
  it("cannot be sent without saying what went wrong", async () => {
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled()
    expect(fetch).not.toHaveBeenCalled()
  })

  // ⚠ A shopper who cannot point at one line — "the whole thing arrived warm" — must still be able
  // to ask, or they are pushed back to the generic inbox this replaces.
  it("sends with no items named", async () => {
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    await userEvent.type(screen.getByLabelText(/what went wrong/i), "Everything arrived warm")
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const body = JSON.parse((fetch as never as ReturnType<typeof vi.fn>).mock.calls[0]![1].body)
    expect(body.message).toBe("Everything arrived warm")
    expect(body.items).toEqual([])
  })

  // ⚠ THE LINE's id, never the product's. `order_item` has no uniqueness on (order, product), so two
  // lines of the same product cannot be told apart by product id — and passing one for the other does
  // not error: the server's join matches nothing and every named item is SILENTLY DROPPED.
  it("names items by their LINE id", async () => {
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    await userEvent.type(screen.getByLabelText(/what went wrong/i), "The milk was warm")
    await userEvent.click(screen.getByLabelText(/milk/i))
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const body = JSON.parse((fetch as never as ReturnType<typeof vi.fn>).mock.calls[0]![1].body)
    expect(body.items).toEqual([{ orderItemId: "oi1", quantity: 2 }])
  })
})

describe("what the shopper is told", () => {
  // ⚠ IT MUST NOT READ AS A DECISION (FR-005r). A person decides; promising a refund here would be a
  // commitment nobody has made, on the screen where a shopper is most likely to hold us to it.
  it("confirms the ask was received and promises no refund", async () => {
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    await userEvent.type(screen.getByLabelText(/what went wrong/i), "Two cartons missing")
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent(/we’ve got it/i)
    expect(status.textContent ?? "").not.toMatch(/refund(ed|ing)?\b|money back|you.ll get/i)
  })

  // ⚠ The 409's own sentence: their ask is already with us. A generic "request failed" would send
  // them to raise it again through the generic inbox.
  it("says a duplicate is already with us, in the server's words", async () => {
    respond(409, { error: "you've already told us about this order — we're looking into it" })
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    await userEvent.type(screen.getByLabelText(/what went wrong/i), "Again")
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/already told us/i)
  })

  it("sends an expired session to sign in, returning here afterwards", async () => {
    respond(401, {})
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    await userEvent.type(screen.getByLabelText(/what went wrong/i), "Two cartons missing")
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in?next=/orders/o1"))
  })
})
