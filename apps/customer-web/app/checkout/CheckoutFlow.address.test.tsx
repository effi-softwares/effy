import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AddressDTO } from "@effy/shared-types"

import { CheckoutFlow } from "./CheckoutFlow"

// Never reach the real Stripe SDK; pin the responsive form to Dialog; silence telemetry.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/stripe", () => ({ getStripe: () => Promise.resolve(null) }))
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
// The paying step is out of scope here — stub the Stripe form so placement succeeds without the SDK.
vi.mock("./PaymentForm", () => ({ PaymentForm: () => <div>Payment form</div> }))
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

const quotePackage = {
  packageKey: "pkg_a1b2",
  items: [{ productId: "p1", name: "Sourdough loaf", quantity: 1, imageUrl: null }],
  serviceable: true,
  methods: [
    { method: "standard", serviceLevel: "Standard", feeAmount: "5.00", window: "in 2–3 days", scheduleDates: null },
  ],
}

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

// Capture the request bodies the flow sends to the hot path.
let quoteBodies: Array<Record<string, unknown>>
let intentBodies: Array<Record<string, unknown>>
let addressWrites: number

beforeEach(() => {
  quoteBodies = []
  intentBodies = []
  addressWrites = 0
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
      if (u.endsWith("/api/cart/merge")) return jsonRes({}, false, 500)
      if (u.endsWith("/api/addresses")) {
        addressWrites += 1
        return jsonRes(addr({ id: "new1", recipientName: "New Person", isDefault: false }))
      }
      if (u.endsWith("/api/checkout/quote")) {
        quoteBodies.push(body)
        return jsonRes({ packages: [quotePackage], quoteId: `q${quoteBodies.length}`, expiresAt: "2099-01-01T00:00:00Z" })
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

/** Advance review → delivery → place the order (the intent request). */
async function placeOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /continue to delivery/i }))
  await user.click(await screen.findByRole("button", { name: /continue to payment/i }))
}

describe("CheckoutFlow shipping (US1/US2)", () => {
  it("blocks pay with no saved address and prompts to add one (FR-007)", () => {
    render(<CheckoutFlow initialAddresses={[]} />)
    expect(screen.getByText(/add an address to continue/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /continue to delivery/i })).toBeDisabled()
  })

  it("pre-selects the default and lets you reach delivery without touching the address (SC-001)", () => {
    render(<CheckoutFlow initialAddresses={[addr()]} />)
    expect(screen.getByText("Pat")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /continue to delivery/i })).toBeEnabled()
  })

  it("switching the shipping address re-quotes for it and never changes the saved default (FR-005/FR-006)", async () => {
    const user = userEvent.setup()
    render(
      <CheckoutFlow
        initialAddresses={[addr(), addr({ id: "a2", recipientName: "Sam", isDefault: false })]}
      />,
    )

    await user.click(screen.getByRole("button", { name: /change/i }))
    await user.click(screen.getByRole("radio", { name: /Sam/ }))
    await placeOrder(user)

    // The quote and the intent both key off the newly chosen shipping address.
    expect(quoteBodies.at(-1)).toMatchObject({ addressId: "a2" })
    expect(intentBodies.at(-1)).toMatchObject({ addressId: "a2" })
    // A per-order switch never writes the address book (no set-default).
    expect(addressWrites).toBe(0)
  })
})

describe("CheckoutFlow billing (US4)", () => {
  it("default ON → the intent carries no billingAddressId (billing = shipping, stores NULL)", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[addr()]} />)

    await placeOrder(user)

    expect(intentBodies.at(-1)).toMatchObject({ addressId: "a1" })
    expect(intentBodies.at(-1)).not.toHaveProperty("billingAddressId")
  })

  it("diverged billing → the intent carries the chosen billingAddressId", async () => {
    const user = userEvent.setup()
    render(
      <CheckoutFlow
        initialAddresses={[addr(), addr({ id: "a2", recipientName: "Sam", isDefault: false })]}
      />,
    )

    await user.click(screen.getByRole("switch")) // billing OFF → billing picker (auto-expanded)
    await user.click(screen.getByRole("radio", { name: /Sam/ }))
    await placeOrder(user)

    expect(intentBodies.at(-1)).toMatchObject({ addressId: "a1", billingAddressId: "a2" })
  })

  it("blocks pay when billing is OFF with nothing chosen (FR-012)", async () => {
    const user = userEvent.setup()
    render(
      <CheckoutFlow
        initialAddresses={[addr(), addr({ id: "a2", recipientName: "Sam", isDefault: false })]}
      />,
    )

    await user.click(screen.getByRole("switch")) // OFF, no billing chosen
    expect(screen.getByRole("button", { name: /continue to delivery/i })).toBeDisabled()
  })

  it("toggling billing back ON discards the divergent choice (FR-013)", async () => {
    const user = userEvent.setup()
    render(
      <CheckoutFlow
        initialAddresses={[addr(), addr({ id: "a2", recipientName: "Sam", isDefault: false })]}
      />,
    )

    await user.click(screen.getByRole("switch")) // OFF
    await user.click(screen.getByRole("radio", { name: /Sam/ })) // pick a2 for billing
    await user.click(screen.getByRole("switch")) // back ON → discard
    await placeOrder(user)

    expect(intentBodies.at(-1)).not.toHaveProperty("billingAddressId")
  })
})
