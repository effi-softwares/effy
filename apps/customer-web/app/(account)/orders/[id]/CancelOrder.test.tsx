import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const refresh = vi.hoisted(() => vi.fn())
const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }))

const { CancelOrder } = await import("./CancelOrder")

function respond(status: number, body: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  respond(200)
})

describe("confirmation", () => {
  it("does not cancel on the first tap - it asks, and says what will happen", async () => {
    render(<CancelOrder orderId="o1" />)
    await userEvent.click(screen.getByRole("button", { name: /cancel this order/i }))

    expect(fetch).not.toHaveBeenCalled()
    // Names the consequence rather than asking "are you sure?".
    expect(screen.getByText(/refund everything you paid, including delivery/i)).toBeInTheDocument()
  })

  it("cancels nothing when the shopper backs out", async () => {
    render(<CancelOrder orderId="o1" />)
    await userEvent.click(screen.getByRole("button", { name: /cancel this order/i }))
    await userEvent.click(screen.getByRole("button", { name: /keep my order/i }))

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /cancel this order/i })).toBeInTheDocument()
  })
})

describe("cancelling", () => {
  it("posts to the order's own cancel route, with no body", async () => {
    render(<CancelOrder orderId="o1" />)
    await userEvent.click(screen.getByRole("button", { name: /cancel this order/i }))
    await userEvent.click(screen.getByRole("button", { name: /yes, cancel it/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/orders/o1/cancel", { method: "POST" }))
    // No body: the order is in the path, the shopper comes from the session, the amount is the platform's.
    expect((fetch as never as ReturnType<typeof vi.fn>).mock.calls[0]![1]).not.toHaveProperty("body")
  })

  // Status, stage and refund all changed, so it re-reads from the server.
  it("re-reads the order from the server rather than patching state", async () => {
    render(<CancelOrder orderId="o1" />)
    await userEvent.click(screen.getByRole("button", { name: /cancel this order/i }))
    await userEvent.click(screen.getByRole("button", { name: /yes, cancel it/i }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})

describe("when the platform refuses", () => {
  // A shop may have started picking since; the server re-decides under a row lock.
  it("shows the server's own sentence, which keeps the door open", async () => {
    respond(422, {
      error: "someone has already started preparing this order. Contact us and we'll see what we can do.",
    })
    render(<CancelOrder orderId="o1" />)
    await userEvent.click(screen.getByRole("button", { name: /cancel this order/i }))
    await userEvent.click(screen.getByRole("button", { name: /yes, cancel it/i }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/already started preparing/i)
    // Never implies the order can never be cancelled: staff still can until it leaves the shop.
    expect(alert).toHaveTextContent(/contact us/i)
  })

  it("does not invent a message when the server sends none", async () => {
    respond(502, {})
    render(<CancelOrder orderId="o1" />)
    await userEvent.click(screen.getByRole("button", { name: /cancel this order/i }))
    await userEvent.click(screen.getByRole("button", { name: /yes, cancel it/i }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/contact us/i)
    expect(alert.textContent ?? "").not.toMatch(/never|cannot be cancelled/i)
  })

  it("sends an expired session to sign in, returning here afterwards", async () => {
    respond(401, {})
    render(<CancelOrder orderId="o1" />)
    await userEvent.click(screen.getByRole("button", { name: /cancel this order/i }))
    await userEvent.click(screen.getByRole("button", { name: /yes, cancel it/i }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/sign-in?next=/orders/o1"))
  })
})
