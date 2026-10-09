import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AddressDTO } from "@effy/shared-types"

import { CheckoutFlow } from "./CheckoutFlow"

// Never reach the real Stripe SDK; pin the responsive form to Dialog; silence telemetry.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/stripe", () => ({
  getStripe: () => Promise.resolve(null),
  // 051: the flow now asks lib/stripe for the Elements options (which carry the generated appearance),
  // so a mock that omits it makes the paying step throw rather than render.
  paymentElementsOptions: (clientSecret: string) => ({ clientSecret }),
}))
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
// The paying step is out of scope here — stub the Stripe form so placement succeeds without the SDK.
// 051: PaymentForm is gone — the payment step is PaymentStep, and it carries no order content.
vi.mock("./PaymentStep", () => ({ PaymentStep: () => <div>Payment step</div> }))
vi.mock("@effy/design-system/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

function addr(over: Partial<AddressDTO> = {}): AddressDTO {
  return {
    id: "a1",
    label: null,
    recipientName: "Pat",
    phone: null,
    line1: "1 Test St",
    line2: null,
    city: "Melbourne",
    region: "VIC",
    postalCode: "3000",
    country: "AU",
    isDefault: true,
    ...over,
  }
}

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

// Capture the request bodies the flow sends to the server.
let intentBodies: Array<Record<string, unknown>>
let addressWrites: number
let addressPatches: Array<{ id: string; body: Record<string, unknown> }>

beforeEach(() => {
  intentBodies = []
  addressWrites = 0
  addressPatches = []
  window.localStorage.setItem(
    "effy:cart",
    JSON.stringify([
      { productId: "p1", name: "Sourdough loaf", imageUrl: null, unitPriceAmount: "10.00", currency: "AUD", quantity: 1, packageKey: "pkg_a1b2" },
    ]),
  )

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {}
      if (u.endsWith("/api/cart")) return jsonRes({}, false, 500)
      if (/\/api\/addresses\/[^/]+$/.test(u)) {
        addressPatches.push({ id: u.split("/").pop()!, body })
        return jsonRes(addr({ id: u.split("/").pop()!, defaultDeliveryInstructions: body.defaultDeliveryInstructions as never }))
      }
      if (u.endsWith("/api/addresses")) {
        addressWrites += 1
        return jsonRes(addr({ id: "new1", recipientName: "New Person", isDefault: false }))
      }
      if (u.endsWith("/api/checkout/quote")) {
        // Serviced, $5 delivery. ⚠ A COURIER quote on purpose: one fee and nothing to choose, so
        // these tests go straight to paying — they are not about picking a delivery window.
        return jsonRes({
          postcode: "3000",
          serviced: true,
          coverage: "courier",
          expiresAt: "2026-08-22T12:00:00+10:00",
          courier: { estimate: "2–4 business days", reason: "out_of_coverage", fee: { lines: [{ kind: "delivery", amount: "5.00" }], totalAmount: "5.00" } },
        })
      }
      if (u.endsWith("/api/checkout/intent")) {
        intentBodies.push(body)
        return jsonRes({ orderId: "o1", orderNumber: "E-1", clientSecret: "cs", publishableKey: "pk", grandTotalAmount: "15.00", currency: "AUD" })
      }
      return jsonRes({})
    }),
  )
})

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/**
 * Place the order (the intent request).
 *
 * ⚠ ONE CLICK, not two. There used to be a delivery step between the address and payment; delivery
 * zones, quotes and fees were withdrawn from the platform, so checkout is: choose an address, pay.
 */
async function placeOrder(user: ReturnType<typeof userEvent.setup>) {
  // 047: the pay button gates on a serviced delivery quote, fetched async when the address is set.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /continue to payment/i })).toBeEnabled(),
  )
  await user.click(screen.getByRole("button", { name: /continue to payment/i }))
}

/**
 * 066 — delivery instructions in the checkout flow: what is sent, what is prefilled, and what is
 * (and is NOT) written back to the address book.
 */
const HOME = () =>
  addr({ id: "a1", recipientName: "Pat", defaultDeliveryInstructions: { handover: "leave_at_door", note: "Side gate" } })
const WORK = () => addr({ id: "a2", recipientName: "Sam", isDefault: false, line1: "2 Work St", defaultDeliveryInstructions: null })

describe("066 — delivery instructions at checkout", () => {
  it("sends nothing when the shopper says nothing", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[addr()]} />)
    await placeOrder(user)
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]!.deliveryInstructions).toBeNull()
  })

  it("sends the choice and the note, normalised", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[addr()]} />)
    await user.click(screen.getByRole("button", { name: "Meet at the door" }))
    await user.type(screen.getByLabelText("Note for the driver"), "  Ring   twice ")
    await placeOrder(user)
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]!.deliveryInstructions).toEqual({ handover: "meet_at_door", note: "Ring twice" })
  })

  it("prefills from the selected address's saved default (FR-013)", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[HOME()]} />)
    expect(screen.getByLabelText("Note for the driver")).toHaveValue("Side gate")
    expect(screen.getByRole("button", { name: "Leave at the door" })).toHaveAttribute("aria-pressed", "true")
    await placeOrder(user)
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]!.deliveryInstructions).toEqual({ handover: "leave_at_door", note: "Side gate" })
    // Using the default as it stands writes nothing back.
    expect(addressPatches).toHaveLength(0)
  })

  /** ⚠ FR-014 — the override is for THIS order; the address keeps what it had. */
  it("⚠ editing for one order does NOT write to the address", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[HOME()]} />)
    const note = screen.getByLabelText("Note for the driver")
    await user.clear(note)
    await user.type(note, "Front door today")
    await placeOrder(user)
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]!.deliveryInstructions).toEqual({ handover: "leave_at_door", note: "Front door today" })
    expect(addressPatches).toHaveLength(0)
  })

  it("ticking 'save to this address' writes the default, after the order accepted it", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[WORK(), HOME()].map((a, i) => ({ ...a, isDefault: i === 0 }))} />)
    await user.type(screen.getByLabelText("Note for the driver"), "Reception")
    await user.click(screen.getByRole("checkbox", { name: /save to this address/i }))
    await placeOrder(user)
    await waitFor(() => expect(addressPatches).toHaveLength(1))
    expect(intentBodies).toHaveLength(1)
    expect(addressPatches[0]).toEqual({
      id: "a2",
      body: { defaultDeliveryInstructions: { handover: null, note: "Reception" } },
    })
  })

  it("the save choice is offered only when there is something new to save", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[HOME()]} />)
    expect(screen.queryByRole("checkbox", { name: /save to this address/i })).toBeNull()
    await user.type(screen.getByLabelText("Note for the driver"), " and knock")
    expect(screen.getByRole("checkbox", { name: /save to this address/i })).toBeInTheDocument()
  })

  /** ⚠ FR-015 — a note is about a place. Typed text does not follow the shopper to another address. */
  it("⚠ switching address REPLACES the draft with that address's saved instructions", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[HOME(), WORK()]} />)
    await user.type(screen.getByLabelText("Note for the driver"), " — typed for home")

    await user.click(screen.getByRole("button", { name: /change/i }))
    await user.click(screen.getByRole("radio", { name: /Sam/ }))
    expect(screen.getByLabelText("Note for the driver")).toHaveValue("")
    expect(screen.getByRole("button", { name: "Leave at the door" })).toHaveAttribute("aria-pressed", "false")

    await user.click(screen.getByRole("button", { name: /change/i }))
    await user.click(screen.getByRole("radio", { name: /Pat/ }))
    expect(screen.getByLabelText("Note for the driver")).toHaveValue("Side gate")
  })

  it("clearing a prefilled note sends null, not the saved default", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[HOME()]} />)
    await user.clear(screen.getByLabelText("Note for the driver"))
    await user.click(screen.getByRole("button", { name: "Leave at the door" }))
    await placeOrder(user)
    await waitFor(() => expect(intentBodies).toHaveLength(1))
    expect(intentBodies[0]!.deliveryInstructions).toBeNull()
    expect(addressPatches).toHaveLength(0)
  })
})
