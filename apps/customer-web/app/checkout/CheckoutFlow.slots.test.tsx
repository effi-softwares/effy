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

// Windows far enough ahead that their cutoffs never pass while the suite runs.
const far = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

/** A serviced address Effy delivers to — the windows are added by `windowsQuote`. */
const BASE: DeliveryQuoteDTO = { postcode: "3000", serviced: true, coverage: "effy", expiresAt: far(1), freeDeliveryRemainingAmount: null }

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
  quotes = [windowsQuote()]
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

/** Choose the later of today's two windows ($5 dearer than a later day) and go to payment. */
async function payForTodaysEvening(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("group", { name: "Same-day delivery" })
  await user.click(windowRadios()[1]!)
  await waitFor(() => expect(payButton()).toBeEnabled())
  await user.click(payButton())
}

describe("the delivery fee at checkout (077)", () => {
  it("a delivery fee that changed before payment is shown, and nothing is paid", async () => {
    const user = userEvent.setup()
    quotes = [windowsQuote(), windowsQuote()]
    intentReplies = [REFUSED("delivery_fee_changed")]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await payForTodaysEvening(user)
    expect(await screen.findByText(DELIVERY_FEE_WORDS.feeChanged)).toBeInTheDocument()
    await waitFor(() => expect(quoteCalls).toBeGreaterThanOrEqual(2))
    expect(intentBodies).toHaveLength(1)
  })

  it("any other 409 is not dressed up as a delivery refusal", async () => {
    const user = userEvent.setup()
    intentReplies = [() => jsonRes({ error: "Your cart changed." }, false, 409)]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await payForTodaysEvening(user)

    expect(await screen.findByText("Your cart changed.")).toBeInTheDocument()
    expect(quoteCalls).toBe(1)
  })
})

describe("renewing the hold at the payment step (069)", () => {
  it("re-runs the intent with the same window when the payment step asks", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await payForTodaysEvening(user)
    await screen.findByText("Payment step")

    await user.click(screen.getByRole("button", { name: "renew hold" }))
    await waitFor(() => expect(intentBodies).toHaveLength(2))
    expect(intentBodies[1]).toMatchObject({ deliveryWindow: { slotId: "evening", date: day(0) }, deliveryType: "effy" })
    expect(screen.getByText("Payment step")).toBeInTheDocument()
  })

  it("⚠ returns to the options, uncharged, when the place has gone", async () => {
    const user = userEvent.setup()
    quotes = [windowsQuote(), windowsQuote({}, [`${day(0)}|evening`])]
    intentReplies = [ACCEPTED, REFUSED("slot_unavailable")]
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await payForTodaysEvening(user)
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
  return { ...BASE, effyWindows: { days, unavailable: null, ...over } }
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
    // There is no separate method choice: the section the window is under IS the method.
    expect(screen.queryByRole("group", { name: "How fast?" })).not.toBeInTheDocument()
    expect(payButton()).toBeDisabled()
    for (const r of windowRadios()) expect(r).not.toBeChecked()
    await user.click(windowRadios()[0]!)
    await waitFor(() => expect(payButton()).toBeEnabled())
  })

  it("a later-day window is sent as ONE deliveryWindow, with the total shown", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[ADDRESS]} />)
    await screen.findByRole("group", { name: "Standard delivery" })
    await user.click(tabs()[1]!) // the second later day
    const standard = screen.getByRole("tabpanel")
    await user.click(standard.querySelectorAll("input[type=radio]")[1]!)
    await user.click(payButton())

    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]).toMatchObject({ deliveryWindow: { slotId: "evening", date: day(2) }, shownDeliveryAmount: "6.00" })
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
