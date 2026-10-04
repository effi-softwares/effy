import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AddressDTO, DeliveryQuoteDTO } from "@effy/shared-types"

import { capture } from "@/lib/telemetry"

import { CheckoutFlow } from "./CheckoutFlow"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve(null),
  paymentElementsOptions: (clientSecret: string) => ({ clientSecret }),
}))
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
// The payment step is stubbed to its one behaviour this file cares about: asking the flow to renew
// the hold. The real step's own hold check is tested in PaymentStep.test.tsx.
vi.mock("./PaymentStep", () => ({
  PaymentStep: ({ renewHold }: { renewHold?: () => Promise<boolean> }) => (
    <div>
      Payment step
      <button type="button" onClick={() => void renewHold?.()}>
        renew hold
      </button>
    </div>
  ),
}))
vi.mock("@effy/design-system/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

const ADDRESS: AddressDTO = {
  id: "a1", label: null, recipientName: "Pat", phone: null, line1: "1 Test St", line2: null,
  city: "Melbourne", region: "VIC", postalCode: "3000", country: "AU", isDefault: true,
}

// Slots far enough ahead that their cutoffs never pass while the suite runs.
const far = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const EVENING = { slotId: "evening", date: day(0), startAt: far(6), endAt: far(8), cutoffAt: far(4) }
const LATE = { slotId: "late", date: day(0), startAt: far(8), endAt: far(10), cutoffAt: far(6) }
const STD = { method: "standard" as const, feeAmount: "6.00", promisedFrom: null, promisedTo: null }
const SD = { method: "same_day" as const, feeAmount: "11.00", promisedFrom: null, promisedTo: null }

function quoteWith(slots: typeof EVENING[], over: Partial<DeliveryQuoteDTO> = {}): DeliveryQuoteDTO {
  return {
    postcode: "3000", serviced: true, sameDayAvailableUntil: null, expiresAt: far(1),
    packages: [{ shopRef: "pkg-1", options: slots.length > 0 ? [STD, SD] : [STD] }],
    sameDaySlots: slots, sameDayUnavailableReason: slots.length > 0 ? null : "slots_closed",
    standardDays: [{ date: day(1) }, { date: day(2) }, { date: day(3) }],
    ...over,
  }
}

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

let quotes: DeliveryQuoteDTO[]
let quoteCalls: number
let intentBodies: Array<Record<string, unknown>>
let intentReplies: Array<() => Response>

const ACCEPTED = () =>
  jsonRes({ orderId: "o1", orderNumber: "E-1", clientSecret: "cs", publishableKey: "pk", grandTotalAmount: "21.00", currency: "AUD", slotHeldUntil: far(0.1) })
const REFUSED = (code: string) => () => jsonRes({ error: "refused", code }, false, 409)

beforeEach(() => {
  quotes = [quoteWith([EVENING, LATE])]
  quoteCalls = 0
  intentBodies = []
  intentReplies = [ACCEPTED]
  window.localStorage.setItem(
    "effy:cart",
    JSON.stringify([{ productId: "p1", name: "Milk", imageUrl: null, unitPriceAmount: "10.00", currency: "AUD", quantity: 1, packageKey: "pkg_a" }]),
  )
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith("/api/checkout/quote")) {
        const q = quotes[Math.min(quoteCalls, quotes.length - 1)]!
        quoteCalls += 1
        return jsonRes(q)
      }
      if (u.endsWith("/api/checkout/intent")) {
        intentBodies.push(JSON.parse(init!.body as string) as Record<string, unknown>)
        return (intentReplies[Math.min(intentBodies.length - 1, intentReplies.length - 1)] ?? ACCEPTED)()
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

async function chooseSameDay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("radio", { name: /same-day delivery/i }))
}

describe("069 — choosing a slot at checkout", () => {
  it("⚠ same-day cannot continue until a slot is chosen, and none is chosen for the shopper", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await chooseSameDay(user)

    expect(payButton()).toBeDisabled()
    for (const slot of within_slots()) expect(slot).not.toBeChecked()
    await user.click(within_slots()[0]!)
    await waitFor(() => expect(payButton()).toBeEnabled())
  })

  it("sends the method and the chosen slot, and no day when everything arrives today", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await chooseSameDay(user)
    const slots = within_slots()
    await user.click(slots[1]!)
    await user.click(payButton())

    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]).toMatchObject({ deliveryMethod: "same_day", sameDaySlotId: "late" })
    expect(intentBodies[0]).not.toHaveProperty("standardDate")
    expect(await screen.findByText("Payment step")).toBeInTheDocument()
  })

  it("standard sends the earliest day by default, and the day the shopper picks instead", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await waitFor(() => expect(payButton()).toBeEnabled())
    await user.click(payButton())
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]).toMatchObject({ standardDate: day(1) })
    expect(intentBodies[0]).not.toHaveProperty("sameDaySlotId")
    expect(intentBodies[0]).not.toHaveProperty("deliveryMethod")
  })

  it("the delivery fee in the summary is the method's, whichever slot is chosen", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await chooseSameDay(user)
    expect(await screen.findByText(/Same-day · \$11\.00/)).toBeInTheDocument()
    await user.click(within_slots()[0]!)
    expect(screen.getByText(/Same-day · \$11\.00/)).toBeInTheDocument()
    await user.click(within_slots()[1]!)
    expect(screen.getByText(/Same-day · \$11\.00/)).toBeInTheDocument()
  })
})

function within_slots(): HTMLElement[] {
  const group = screen.getByRole("group", { name: "Choose a delivery time" })
  return Array.from(group.querySelectorAll<HTMLElement>('input[type="radio"]'))
}

describe("069 — a slot that goes before payment (FR-009, FR-010)", () => {
  it("⚠ tells the shopper, re-offers what is left, selects nothing, and starts no payment", async () => {
    const user = userEvent.setup()
    quotes = [quoteWith([EVENING, LATE]), quoteWith([LATE])]
    intentReplies = [REFUSED("slot_unavailable")]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await chooseSameDay(user)
    await user.click(within_slots()[0]!) // evening
    await user.click(payButton())

    expect(await screen.findByText(/that delivery time is no longer available/i)).toBeInTheDocument()
    expect(screen.queryByText("Payment step")).not.toBeInTheDocument()

    // The options were fetched again, and only the slot still open is offered.
    await waitFor(() => expect(within_slots()).toHaveLength(1))
    expect(quoteCalls).toBe(2)
    // ⚠ NOT moved to the remaining slot: nothing is selected, and the shopper cannot continue.
    expect(within_slots()[0]).not.toBeChecked()
    expect(payButton()).toBeDisabled()
    expect(capture).toHaveBeenCalledWith({ name: "checkout_delivery_choice_refused", props: { reason: "slot_unavailable" } })
  })

  it("falls back to offering standard when no slot is left — and still does not choose it for them to pay", async () => {
    const user = userEvent.setup()
    quotes = [quoteWith([EVENING]), quoteWith([])]
    intentReplies = [REFUSED("slot_unavailable")]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await chooseSameDay(user)
    await user.click(within_slots()[0]!)
    await user.click(payButton())

    expect(await screen.findByText(/that delivery time is no longer available/i)).toBeInTheDocument()
    expect(await screen.findByText(/same-day delivery times are closed or full/i)).toBeInTheDocument()
    // Only ONE intent was sent — the refused one. The flow did not quietly retry as standard.
    expect(intentBodies).toHaveLength(1)
  })

  it("a day that has gone is refused the same way, and the earliest day now on offer is preselected", async () => {
    const user = userEvent.setup()
    quotes = [quoteWith([]), quoteWith([], { standardDays: [{ date: day(2) }, { date: day(3) }] })]
    intentReplies = [REFUSED("date_unavailable")]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await waitFor(() => expect(payButton()).toBeEnabled())
    await user.click(payButton())

    expect(await screen.findByText(/that delivery day is no longer available/i)).toBeInTheDocument()
    await waitFor(() => expect(quoteCalls).toBe(2))
    const days = screen.getByRole("group", { name: "Choose a delivery day" }).querySelectorAll<HTMLInputElement>('input[type="radio"]')
    await waitFor(() => expect(days).toHaveLength(2))
    expect(capture).toHaveBeenCalledWith({ name: "checkout_delivery_choice_refused", props: { reason: "date_unavailable" } })
  })

  it("any other 409 is not dressed up as a delivery refusal", async () => {
    const user = userEvent.setup()
    intentReplies = [() => jsonRes({ error: "Your cart changed." }, false, 409)]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await waitFor(() => expect(payButton()).toBeEnabled())
    await user.click(payButton())

    expect(await screen.findByText("Your cart changed.")).toBeInTheDocument()
    expect(quoteCalls).toBe(1)
  })
})

describe("069 — renewing the hold at the payment step", () => {
  it("re-runs the intent with the same slot when the payment step asks", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await chooseSameDay(user)
    await user.click(within_slots()[1]!)
    await user.click(payButton())
    await screen.findByText("Payment step")

    await user.click(screen.getByRole("button", { name: "renew hold" }))
    await waitFor(() => expect(intentBodies).toHaveLength(2))
    expect(intentBodies[1]).toMatchObject({ deliveryMethod: "same_day", sameDaySlotId: "late" })
    expect(screen.getByText("Payment step")).toBeInTheDocument()
  })

  it("⚠ returns to the options, uncharged, when the place has gone", async () => {
    const user = userEvent.setup()
    quotes = [quoteWith([EVENING, LATE]), quoteWith([EVENING])]
    intentReplies = [ACCEPTED, REFUSED("slot_unavailable")]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await chooseSameDay(user)
    await user.click(within_slots()[1]!)
    await user.click(payButton())
    await screen.findByText("Payment step")

    await user.click(screen.getByRole("button", { name: "renew hold" }))

    expect(await screen.findByText(/that delivery time is no longer available/i)).toBeInTheDocument()
    expect(screen.queryByText("Payment step")).not.toBeInTheDocument()
    expect(payButton()).toBeDisabled()
  })
})
