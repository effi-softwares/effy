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
  userEvent.click(await screen.findByRole("button", { name: /report a problem/i }))

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

  // A shopper who cannot point at one line ("it all arrived warm") must still be able to ask.
  it("sends with no items named", async () => {
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    await userEvent.type(screen.getByLabelText(/details/i), "Everything arrived warm")
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const body = JSON.parse((fetch as never as ReturnType<typeof vi.fn>).mock.calls[0]![1].body)
    // What went wrong leads the message.
    expect(body.message).toBe("An item was damaged: Everything arrived warm")
    expect(body.items).toEqual([])
  })

  // The line's id, never the product's: two lines of one product cannot be told apart by product id.
  it("names items by their LINE id", async () => {
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    await userEvent.type(screen.getByLabelText(/details/i), "The milk was warm")
    await userEvent.click(screen.getByLabelText(/milk/i))
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const body = JSON.parse((fetch as never as ReturnType<typeof vi.fn>).mock.calls[0]![1].body)
    expect(body.items).toEqual([{ orderItemId: "oi1", quantity: 2 }])
  })
})

describe("what the shopper is told", () => {
  // It must not read as a decision: a person decides.
  it("confirms the ask was received and promises no refund", async () => {
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    await userEvent.type(screen.getByLabelText(/details/i), "Two cartons missing")
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent(/we’ve got it/i)
    expect(status.textContent ?? "").not.toMatch(/refund(ed|ing)?\b|money back|you.ll get/i)
  })

  // The 409's own sentence: their ask is already with us.
  it("says a duplicate is already with us, in the server's words", async () => {
    respond(409, { error: "you've already told us about this order — we're looking into it" })
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    await userEvent.type(screen.getByLabelText(/details/i), "Again")
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/already told us/i)
  })

  it("sends an expired session to sign in, returning here afterwards", async () => {
    respond(401, {})
    render(<RequestRefund orderId="o1" items={ITEMS} />)
    await open()
    await userEvent.type(screen.getByLabelText(/details/i), "Two cartons missing")
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in?next=/orders/o1"))
  })
})
