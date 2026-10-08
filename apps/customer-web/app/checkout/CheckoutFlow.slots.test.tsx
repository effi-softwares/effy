import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DELIVERY_FEE_WORDS, type AddressDTO, type DeliveryQuoteDTO } from "@effy/shared-types"

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

  // ⚠ 077 REVERSED 069 here: a window may cost more than another, and the summary shows the fee of
  // the window CHOSEN, as lines — and sends that total, so it is the total charged.
  it("077 — the summary shows the chosen window's fee as lines, and the intent carries that total", async () => {
    const user = userEvent.setup()
    const fee = (surcharge: number) => ({
      lines: [{ kind: "delivery" as const, amount: "6.00" }, { kind: "window_surcharge" as const, amount: `${surcharge}.00` }],
      totalAmount: `${6 + surcharge}.00`,
    })
    quotes = [quoteWith([{ ...EVENING, surchargeAmount: "3.00", fee: fee(3) }, { ...LATE, surchargeAmount: "5.00", fee: fee(5) }] as never, {
      standardFee: { lines: [{ kind: "delivery", amount: "6.00" }], totalAmount: "6.00" },
    })]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await chooseSameDay(user)
    expect(await screen.findByText("Choose a delivery time", { selector: "span" })).toBeInTheDocument()
    await user.click(within_slots()[0]!)
    expect(screen.getByText("Window surcharge")).toBeInTheDocument()
    expect(screen.getByText("$3.00")).toBeInTheDocument()
    await user.click(within_slots()[1]!)
    expect(screen.getByText("$5.00")).toBeInTheDocument()
    await user.click(payButton())
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]).toMatchObject({ sameDaySlotId: "late", shownDeliveryAmount: "11.00" })
  })

  it("077 — a delivery fee that changed before payment is shown, and nothing is paid", async () => {
    const user = userEvent.setup()
    quotes = [quoteWith([]), quoteWith([])]
    intentReplies = [REFUSED("delivery_fee_changed")]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await waitFor(() => expect(payButton()).toBeEnabled())
    await user.click(payButton())
    expect(await screen.findByText(DELIVERY_FEE_WORDS.feeChanged)).toBeInTheDocument()
    await waitFor(() => expect(quoteCalls).toBeGreaterThanOrEqual(2))
    expect(intentBodies).toHaveLength(1)
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

// ── 078 — the new delivery model: ONE window for the order ────────────────────────────────────────

const FEE = (surcharge: number) => ({
  lines: [{ kind: "delivery" as const, amount: "6.00" }, ...(surcharge ? [{ kind: "window_surcharge" as const, amount: `${surcharge}.00` }] : [])],
  totalAmount: `${6 + surcharge}.00`,
})
const win = (slotId: string, n: number, hours: number, surcharge: number) => ({
  slotId, date: day(n), startAt: far(n * 24 + hours + 2), endAt: far(n * 24 + hours + 4), cutoffAt: far(n * 24 + hours),
  surchargeAmount: `${surcharge}.00`, fee: FEE(surcharge),
})
/** Today has two windows ($5 dearer); two later days have the same two at the plain fee. */
function windowsQuote(over: Partial<NonNullable<DeliveryQuoteDTO["effyWindows"]>> = {}, drop: string[] = []): DeliveryQuoteDTO {
  const keep = (w: ReturnType<typeof win>) => !drop.includes(`${w.date}|${w.slotId}`)
  const days = [0, 1, 2].map((n) => {
    const windows = [win("afternoon", n, 4, n === 0 ? 5 : 0), win("evening", n, 6, n === 0 ? 5 : 0)].filter(keep)
    return {
      date: day(n), section: n === 0 ? ("same_day" as const) : ("standard" as const), windows,
      closedReason: windows.length > 0 ? null : n === 0 ? ("closed" as const) : ("full" as const),
    }
  })
  return {
    ...quoteWith([], { standardFee: FEE(0), freeDeliveryRemainingAmount: null }),
    effyWindows: { days, unavailable: null, ...over },
  }
}
const windowRadios = () => screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).name.endsWith("-window"))
const tabs = () => screen.getAllByRole("tab")

describe("078 — choosing one window for the order", () => {
  beforeEach(() => {
    quotes = [windowsQuote()]
  })

  it("⚠ cannot continue until a window is chosen, and none is chosen for the shopper", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    expect(await screen.findByRole("group", { name: "Same-day delivery" })).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Standard delivery" })).toBeInTheDocument()
    // The 069 "How fast?" method choice is gone: the section the window is under IS the method.
    expect(screen.queryByRole("group", { name: "How fast?" })).not.toBeInTheDocument()
    expect(payButton()).toBeDisabled()
    for (const r of windowRadios()) expect(r).not.toBeChecked()
    await user.click(windowRadios()[0]!)
    await waitFor(() => expect(payButton()).toBeEnabled())
  })

  it("a later-day window is sent as ONE deliveryWindow, with the total shown — and none of the 069 fields", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await screen.findByRole("group", { name: "Standard delivery" })
    await user.click(tabs()[1]!) // the second later day
    const standard = screen.getByRole("tabpanel")
    await user.click(standard.querySelectorAll("input[type=radio]")[1]!)
    await user.click(payButton())

    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]).toMatchObject({ deliveryWindow: { slotId: "evening", date: day(2) }, shownDeliveryAmount: "6.00" })
    for (const old of ["deliveryMethod", "sameDaySlotId", "standardDate"]) expect(intentBodies[0]).not.toHaveProperty(old)
    expect(await screen.findByText("Payment step")).toBeInTheDocument()
    expect(capture).toHaveBeenCalledWith({ name: "checkout_window_selected", props: { section: "standard", day_offset: 2 } })
  })

  it("today's window costs more, shows what it adds before it is chosen, and that total is what is sent", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    const today = await screen.findByRole("group", { name: "Same-day delivery" })
    expect(today).toHaveTextContent("+$5.00")
    await user.click(windowRadios()[0]!)
    expect(screen.getByText("Window surcharge")).toBeInTheDocument()
    await user.click(payButton())
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]).toMatchObject({ deliveryWindow: { slotId: "afternoon", date: day(0) }, shownDeliveryAmount: "11.00" })
    expect(capture).toHaveBeenCalledWith({ name: "checkout_window_selected", props: { section: "same_day", day_offset: 0 } })
  })

  it("⚠ a window that has gone is not replaced: the shopper is told, re-offered what is left, and nothing is chosen", async () => {
    const user = userEvent.setup()
    quotes = [windowsQuote(), windowsQuote({}, [`${day(1)}|afternoon`])]
    intentReplies = [REFUSED("slot_unavailable")]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await screen.findByRole("group", { name: "Standard delivery" })
    await user.click(screen.getByRole("tabpanel").querySelectorAll("input[type=radio]")[0]!)
    await user.click(payButton())

    expect(await screen.findByText(/that delivery time is no longer available/i)).toBeInTheDocument()
    expect(screen.queryByText("Payment step")).not.toBeInTheDocument()
    await waitFor(() => expect(quoteCalls).toBe(2))
    await waitFor(() => expect(screen.getByRole("tabpanel").querySelectorAll("input[type=radio]")).toHaveLength(1))
    for (const r of windowRadios()) expect(r).not.toBeChecked()
    expect(payButton()).toBeDisabled()
  })

  it("the choice survives a refusal that is not about the window (FR-011)", async () => {
    const user = userEvent.setup()
    quotes = [windowsQuote(), windowsQuote()]
    intentReplies = [REFUSED("delivery_fee_changed"), ACCEPTED]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await screen.findByRole("group", { name: "Standard delivery" })
    await user.click(screen.getByRole("tabpanel").querySelectorAll("input[type=radio]")[1]!)
    await user.click(payButton())

    expect(await screen.findByText(DELIVERY_FEE_WORDS.feeChanged)).toBeInTheDocument()
    await waitFor(() => expect(quoteCalls).toBe(2))
    await waitFor(() => expect(screen.getByRole("tabpanel").querySelectorAll("input[type=radio]")[1]).toBeChecked())
    await user.click(payButton())
    await waitFor(() => expect(intentBodies).toHaveLength(2))
    expect(intentBodies[1]).toMatchObject({ deliveryWindow: { slotId: "evening", date: day(1) } })
  })

  it("with no window on any day it says so, cannot pay, and reports why once", async () => {
    quotes = [windowsQuote({ unavailable: "no_windows" }, [0, 1, 2].flatMap((n) => [`${day(n)}|afternoon`, `${day(n)}|evening`]))]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    expect(await screen.findByText(/no delivery windows available in the next few days/i)).toBeInTheDocument()
    expect(payButton()).toBeDisabled()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
    await waitFor(() => expect(capture).toHaveBeenCalledWith({ name: "checkout_windows_unavailable", props: { reason: "no_windows" } }))
    expect(vi.mocked(capture).mock.calls.filter(([e]) => e.name === "checkout_windows_unavailable")).toHaveLength(1)
  })

  it("⚠ changing the address drops the window: nothing chosen for one address is carried to another", async () => {
    const user = userEvent.setup()
    const OTHER: AddressDTO = { ...ADDRESS, id: "a2", recipientName: "Sam", line1: "2 Other St", isDefault: false }
    quotes = [windowsQuote(), windowsQuote()]
    render(<CheckoutFlow initialAddresses={[ADDRESS, OTHER]} />)
    await screen.findByRole("group", { name: "Standard delivery" })
    await user.click(windowRadios()[0]!)
    await waitFor(() => expect(payButton()).toBeEnabled())

    await user.click(screen.getByRole("button", { name: /change/i }))
    await user.click(screen.getByRole("radio", { name: /Sam/ }))
    await waitFor(() => expect(quoteCalls).toBe(2))
    await screen.findByRole("group", { name: "Same-day delivery" })
    for (const r of windowRadios()) expect(r).not.toBeChecked()
    expect(payButton()).toBeDisabled()
  })
})
