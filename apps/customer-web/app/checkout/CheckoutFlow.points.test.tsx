import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AddressDTO, DeliveryQuoteDTO } from "@effy/shared-types"

import { capture } from "@/lib/telemetry"

import { CheckoutFlow } from "./CheckoutFlow"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/stripe", () => ({ getStripe: () => Promise.resolve(null), paymentElementsOptions: (s: string) => ({ clientSecret: s }) }))
vi.mock("@stripe/react-stripe-js", () => ({ Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("./PaymentStep", () => ({ PaymentStep: () => <div>Payment step</div> }))
vi.mock("@effy/design-system/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

const ADDRESS: AddressDTO = {
  id: "a1", label: null, recipientName: "Pat", phone: null, line1: "1 Test St", line2: null,
  city: "Melbourne", region: "VIC", postalCode: "3000", country: "AU", isDefault: true,
}
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const QUOTE = (usable: number): DeliveryQuoteDTO => ({
  postcode: "3000", serviced: true, sameDayAvailableUntil: null, expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  packages: [{ shopRef: "pkg-1", options: [{ method: "standard", feeAmount: "6.00", promisedFrom: null, promisedTo: null }] }],
  sameDaySlots: [], sameDayUnavailableReason: "slots_closed", standardDays: [{ date: day(1) }],
  ...(usable > 0 ? { points: { usable, centsPerPoint: 1, cardMinimumAmount: "0.50" } } : {}),
})
const jsonRes = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response

let quote: DeliveryQuoteDTO
let intentBodies: Array<Record<string, unknown>>
let intentReply: () => Response
const assign = vi.fn()

beforeEach(() => {
  quote = QUOTE(1000)
  intentBodies = []
  intentReply = () => jsonRes({ orderId: "o1", orderNumber: "E-1", clientSecret: "cs", publishableKey: "pk", grandTotalAmount: "16.00", currency: "AUD", pointsUsed: 1000, pointsAmount: "10.00", cardAmount: "6.00", paidWithPoints: false })
  window.localStorage.setItem(
    "effy:cart",
    JSON.stringify([{ productId: "p1", name: "Milk", imageUrl: null, unitPriceAmount: "10.00", currency: "AUD", quantity: 1, packageKey: "pkg_a" }]),
  )
  vi.stubGlobal("location", { ...window.location, assign })
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith("/api/checkout/quote")) return jsonRes(quote)
      if (u.endsWith("/api/checkout/intent")) {
        intentBodies.push(JSON.parse(init!.body as string) as Record<string, unknown>)
        return intentReply()
      }
      return jsonRes({}, false, 500)
    }),
  )
})

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const payButton = () => screen.getByRole("button", { name: /continue to payment/i })

describe("074 — points at checkout (web)", () => {
  it("uses the most points by default, shows the split, and sends them", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    expect(await screen.findByRole("checkbox", { name: /use points/i })).toBeChecked()
    expect(await screen.findByText("To pay by card")).toBeInTheDocument()
    await waitFor(() => expect(payButton()).toBeEnabled())
    await user.click(payButton())
    await waitFor(() => expect(intentBodies[0]?.pointsToUse).toBe(1000))
    expect(capture).toHaveBeenCalledWith({ name: "checkout_paid_with_points", props: { share: "part" } })
  })

  it("sends no points when switched off", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await user.click(await screen.findByRole("checkbox", { name: /use points/i }))
    expect(capture).toHaveBeenCalledWith({ name: "checkout_points_toggled", props: { on: false } })
    await waitFor(() => expect(payButton()).toBeEnabled())
    await user.click(payButton())
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]).not.toHaveProperty("pointsToUse")
  })

  it("goes straight to the receipt when points paid for everything", async () => {
    quote = QUOTE(5000)
    intentReply = () => jsonRes({ orderId: "o9", orderNumber: "E-9", clientSecret: "", publishableKey: "pk", grandTotalAmount: "16.00", currency: "AUD", pointsUsed: 1600, pointsAmount: "16.00", cardAmount: "0.00", paidWithPoints: true })
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await waitFor(() => expect(payButton()).toBeEnabled())
    await user.click(payButton())
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/checkout/complete?order=o9"))
    expect(screen.queryByText("Payment step")).not.toBeInTheDocument()
  })

  it("says so plainly when the balance changed, and charges nothing", async () => {
    intentReply = () => jsonRes({ error: "changed", code: "points_balance_changed" }, false, 409)
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await waitFor(() => expect(payButton()).toBeEnabled())
    await user.click(payButton())
    expect(await screen.findByText(/points balance has changed/i)).toBeInTheDocument()
    expect(screen.queryByText("Payment step")).not.toBeInTheDocument()
  })

  it("shows no points control to a customer without points", async () => {
    quote = QUOTE(0)
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await waitFor(() => expect(payButton()).toBeEnabled())
    expect(screen.queryByRole("checkbox", { name: /use points/i })).not.toBeInTheDocument()
  })
})
