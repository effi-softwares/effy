import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { COVERAGE_REFUSAL_SENTENCE, type AddressDTO, type DeliveryQuoteDTO } from "@effy/shared-types"

import { capture } from "@/lib/telemetry"

import { CheckoutFlow, DELIVERY_TYPE_CHANGED_MESSAGE } from "./CheckoutFlow"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve(null),
  paymentElementsOptions: (clientSecret: string) => ({ clientSecret }),
}))
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("./PaymentStep", () => ({ PaymentStep: () => <div>Payment step</div> }))
vi.mock("@effy/design-system/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

/**
 * 079 — who delivers is decided from the address, the checkout shows exactly that, and nothing chosen
 * for one address survives a change to another (P21).
 *
 * The harness answers the quote PER ADDRESS, because that is the whole point: the same page must
 * become a different delivery section the moment the address under it changes.
 */
const address = (id: string, recipientName: string, postalCode: string, isDefault = false): AddressDTO => ({
  id, label: null, recipientName, phone: null, line1: "1 Test St", line2: null, city: "Somewhere", region: "VIC", postalCode, country: "AU", isDefault,
})
const HOME = address("home", "Pat", "3121", true)
const FAR = address("far", "Sam", "7000")
const NOWHERE = address("nowhere", "Lee", "7255")

const far = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const fee = (amount: string) => ({ lines: [{ kind: "delivery" as const, amount }], totalAmount: amount })

const base = { expiresAt: far(1) }
const EFFY: DeliveryQuoteDTO = {
  ...base, postcode: "3121", serviced: true, coverage: "effy",
  effyWindows: {
    unavailable: null,
    days: [
      { date: day(0), section: "same_day", closedReason: "closed", windows: [] },
      {
        date: day(1), section: "standard", closedReason: null,
        windows: [{ slotId: "evening", date: day(1), startAt: far(30), endAt: far(32), cutoffAt: far(28), surchargeAmount: "0.00", fee: fee("6.00") }],
      },
    ],
  },
}
const COURIER: DeliveryQuoteDTO = {
  ...base, postcode: "7000", serviced: true, coverage: "courier",
  courier: { estimate: "2–4 business days", reason: "out_of_coverage", fee: fee("9.00") },
}
const NONE: DeliveryQuoteDTO = { ...base, postcode: "7255", serviced: false, coverage: "none" }

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

let quoteFor: Record<string, DeliveryQuoteDTO>
let quoted: string[]
let intentBodies: Array<Record<string, unknown>>
let intentReplies: Array<() => Response>
const ACCEPTED = () =>
  jsonRes({ orderId: "o1", orderNumber: "E-1", clientSecret: "cs", publishableKey: "pk", grandTotalAmount: "19.00", currency: "AUD", deliveryType: "courier" })

beforeEach(() => {
  quoteFor = { home: EFFY, far: COURIER, nowhere: NONE }
  quoted = []
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
      const body = JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>
      if (u.endsWith("/api/checkout/quote")) {
        quoted.push(body.addressId as string)
        return jsonRes(quoteFor[body.addressId as string])
      }
      if (u.endsWith("/api/checkout/intent")) {
        intentBodies.push(body)
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
const delivery = () => screen.getByRole("region", { name: "Delivery" })
async function switchTo(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole("button", { name: /change/i }))
  await user.click(screen.getByRole("radio", { name }))
}

describe("079 — a courier delivers: the estimate, the fee, and nothing to choose", () => {
  it("shows Courier delivery with the estimate said as an estimate, and no picker of any kind", async () => {
    render(<CheckoutFlow initialAddresses={[{ ...FAR, isDefault: true }]} />)
    const section = await screen.findByTestId("courier-delivery")
    expect(within(section).getByRole("heading", { name: "Courier delivery" })).toBeInTheDocument()
    expect(section).toHaveTextContent("Delivered by a courier partner.")
    expect(section).toHaveTextContent("Usually arrives in 2–4 business days — an estimate, not a guaranteed date.")
    expect(section).toHaveTextContent("$9.00")
    // ⚠ Nothing to choose: no window, no day, no method — and no same-day / standard words at all.
    expect(within(section).queryByRole("radio")).not.toBeInTheDocument()
    expect(within(section).queryByRole("tab")).not.toBeInTheDocument()
    expect(section.textContent).not.toMatch(/same-day|standard|window|today|tomorrow/i)
    // Pay is not waiting on a choice there is none to make.
    await waitFor(() => expect(payButton()).toBeEnabled())
  })

  it("sends the type it showed and the total it showed — and no window, slot, day or method", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[{ ...FAR, isDefault: true }]} />)
    await screen.findByTestId("courier-delivery")
    await user.click(payButton())
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]).toMatchObject({ addressId: "far", deliveryType: "courier", shownDeliveryAmount: "9.00" })
    for (const key of ["deliveryWindow", "sameDaySlotId", "standardDate", "deliveryMethod"]) expect(intentBodies[0]).not.toHaveProperty(key)
    expect(await screen.findByText("Payment step")).toBeInTheDocument()
    expect(capture).toHaveBeenCalledWith({ name: "checkout_delivery_type_shown", props: { type: "courier", reason: "out_of_coverage" } })
  })

  it("an Effy address is headed Delivered by Effy, needs a window, and says so on the intent", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[HOME]} />)
    expect(await within(await screen.findByRole("region", { name: "Delivery" })).findByRole("heading", { name: "Delivered by Effy" })).toBeInTheDocument()
    expect(payButton()).toBeDisabled()
    await user.click(screen.getByRole("radio"))
    await waitFor(() => expect(payButton()).toBeEnabled())
    await user.click(payButton())
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]).toMatchObject({ deliveryType: "effy", deliveryWindow: { slotId: "evening", date: day(1) }, shownDeliveryAmount: "6.00" })
    expect(capture).toHaveBeenCalledWith({ name: "checkout_delivery_type_shown", props: { type: "effy", reason: "in_coverage" } })
  })

  it("no window left and the business sends it by courier: told so first, then offered", async () => {
    quoteFor.home = { ...COURIER, postcode: "3121", courier: { ...COURIER.courier!, reason: "no_window" } }
    render(<CheckoutFlow initialAddresses={[HOME]} />)
    const section = await screen.findByTestId("courier-delivery")
    expect(within(section).getByRole("status")).toHaveTextContent(
      "There are no Effy delivery windows available in the next few days. We can send this order by courier instead.",
    )
    expect(capture).toHaveBeenCalledWith({ name: "checkout_delivery_type_shown", props: { type: "courier", reason: "no_window" } })
  })
})

describe("079 — changing the address re-decides everything (US4)", () => {
  it("⚠ Effy → courier → Effy: the window is gone, the fee follows the address, and nothing is pre-selected on the way back", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[HOME, FAR]} />)
    await user.click(await screen.findByRole("radio", { name: /–/ }))
    await waitFor(() => expect(payButton()).toBeEnabled())

    await switchTo(user, /Sam/)
    const section = await screen.findByTestId("courier-delivery")
    expect(section).toHaveTextContent("$9.00")
    expect(within(delivery()).queryByRole("radio")).not.toBeInTheDocument()
    await user.click(payButton())
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    // ⚠ Nothing of the first address went with it: not its window, not its $6.00.
    expect(intentBodies[0]).toMatchObject({ addressId: "far", deliveryType: "courier", shownDeliveryAmount: "9.00" })
    expect(intentBodies[0]).not.toHaveProperty("deliveryWindow")
  })

  it("⚠ back at the Effy address the picker is shown with NOTHING selected, and pay waits for a choice", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[HOME, FAR]} />)
    await user.click(await screen.findByRole("radio", { name: /–/ }))
    await switchTo(user, /Sam/)
    await screen.findByTestId("courier-delivery")
    await switchTo(user, /Pat/)

    const window = await within(await screen.findByRole("region", { name: "Delivery" })).findByRole("radio")
    expect(window).not.toBeChecked()
    expect(payButton()).toBeDisabled()
    expect(screen.queryByTestId("courier-delivery")).not.toBeInTheDocument()
    expect(quoted).toEqual(["home", "far", "home"])
  })

  it("⚠ two addresses Effy BOTH delivers to, offering the same window: the choice still does not follow the shopper", async () => {
    // The case the re-quote alone would get wrong: the window IS still on offer at the new address,
    // so "keep it while it is offered" would carry a time chosen for one front door to another.
    const user = userEvent.setup()
    const WORK = address("work", "Kim", "3141")
    quoteFor.work = { ...EFFY, postcode: "3141" }
    render(<CheckoutFlow initialAddresses={[HOME, WORK]} />)
    await user.click(await screen.findByRole("radio", { name: /–/ }))
    await waitFor(() => expect(payButton()).toBeEnabled())

    await switchTo(user, /Kim/)
    await waitFor(() => expect(quoted).toEqual(["home", "work"]))
    const window = await within(await screen.findByRole("region", { name: "Delivery" })).findByRole("radio")
    expect(window).not.toBeChecked()
    expect(payButton()).toBeDisabled()
  })

  it("an address nobody reaches: the one refusal sentence, no delivery section, and no way to pay", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[{ ...FAR, isDefault: true }, NOWHERE]} />)
    await screen.findByTestId("courier-delivery")
    await switchTo(user, /Lee/)
    expect(await screen.findByTestId("checkout-coverage-refusal")).toHaveTextContent(COVERAGE_REFUSAL_SENTENCE)
    expect(screen.queryByTestId("courier-delivery")).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Delivery" })).not.toBeInTheDocument()
    expect(payButton()).toBeDisabled()
    expect(intentBodies).toHaveLength(0)
  })

  it("the same address with a different POSTCODE is a different destination: re-quoted, and the window dropped", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<CheckoutFlow key="a" initialAddresses={[HOME]} />)
    await user.click(await screen.findByRole("radio", { name: /–/ }))
    await waitFor(() => expect(payButton()).toBeEnabled())
    // The address book is edited elsewhere and the page comes back with the same id at a new postcode.
    quoteFor.home = COURIER
    rerender(<CheckoutFlow key="b" initialAddresses={[{ ...HOME, postalCode: "7000" }]} />)
    expect(await screen.findByTestId("courier-delivery")).toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: /–/ })).not.toBeInTheDocument()
  })
})

describe("079 — the server says who delivers has changed", () => {
  it("⚠ nothing is charged: back to the options, told plainly, and the section re-drawn from a fresh quote", async () => {
    const user = userEvent.setup()
    intentReplies = [() => jsonRes({ error: "refused", code: "delivery_type_changed" }, false, 409), ACCEPTED]
    render(<CheckoutFlow initialAddresses={[HOME]} />)
    await user.click(await screen.findByRole("radio", { name: /–/ }))
    await waitFor(() => expect(payButton()).toBeEnabled())

    // Between the quote and the pay button the last window went, and the business sends such an order by courier.
    quoteFor.home = { ...COURIER, postcode: "3121", courier: { ...COURIER.courier!, reason: "no_window" } }
    await user.click(payButton())

    expect(await screen.findByText(DELIVERY_TYPE_CHANGED_MESSAGE)).toBeInTheDocument()
    expect(await screen.findByTestId("courier-delivery")).toBeInTheDocument()
    expect(screen.queryByText("Payment step")).not.toBeInTheDocument()
    expect(capture).toHaveBeenCalledWith({ name: "checkout_delivery_type_changed", props: {} })

    // Pressing pay again buys what is NOW on the screen.
    await user.click(payButton())
    await waitFor(() => expect(intentBodies).toHaveLength(2))
    expect(intentBodies[0]).toMatchObject({ deliveryType: "effy" })
    expect(intentBodies[1]).toMatchObject({ deliveryType: "courier", shownDeliveryAmount: "9.00" })
    expect(intentBodies[1]).not.toHaveProperty("deliveryWindow")
    expect(await screen.findByText("Payment step")).toBeInTheDocument()
  })
})
