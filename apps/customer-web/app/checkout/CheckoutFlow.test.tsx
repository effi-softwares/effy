import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AddressDTO } from "@effy/shared-types"

import { CheckoutFlow } from "./CheckoutFlow"

// The paying step is never reached in these tests; stub Stripe so nothing tries to load the SDK.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/stripe", () => ({ getStripe: () => Promise.resolve(null) }))
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const quotePackage = {
  packageKey: "pkg_a1b2",
  items: [{ productId: "p1", name: "Sourdough loaf", quantity: 1, imageUrl: null }],
  serviceable: true,
  methods: [
    { method: "standard", serviceLevel: "Standard", feeAmount: "5.00", window: "in 2–3 days", scheduleDates: null },
  ],
}

const address = {
  id: "a1",
  isDefault: true,
  recipientName: "Pat",
  line1: "1 Test St",
  line2: null,
  city: "Melbourne",
  region: "VIC",
  postalCode: "3000",
  country: "AU",
} as unknown as AddressDTO

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response
}

let quoteCalls = 0
let intentCalls = 0

beforeEach(() => {
  quoteCalls = 0
  intentCalls = 0
  window.localStorage.setItem(
    "effy:cart",
    JSON.stringify([
      { productId: "p1", name: "Sourdough loaf", imageUrl: null, unitPriceAmount: "10.00", currency: "AUD", quantity: 1, packageKey: "pkg_a1b2" },
    ]),
  )

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = String(url)
      // Keep the guest cart intact: a failed merge means clearCart never runs.
      if (u.endsWith("/api/cart/merge")) return jsonRes({}, false, 500)
      if (u.endsWith("/api/checkout/quote")) {
        quoteCalls += 1
        return jsonRes({ packages: [quotePackage], quoteId: `q${quoteCalls}`, expiresAt: "2099-01-01T00:00:00Z" })
      }
      if (u.endsWith("/api/checkout/intent")) {
        intentCalls += 1
        // First placement 409s (stale quote); a second would succeed — but the customer must re-review.
        if (intentCalls === 1) return jsonRes({ error: "re-quote" }, false, 409)
        return jsonRes({ orderId: "o1", orderNumber: "E-1", clientSecret: "cs", publishableKey: "pk", grandTotalAmount: "15.00", currency: "AUD" })
      }
      return jsonRes({})
    }),
  )
})

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe("CheckoutFlow — 409 re-quote (FR-011a / T044)", () => {
  it("re-quotes and re-shows the options instead of blind-retrying", async () => {
    const user = userEvent.setup()
    render(<CheckoutFlow initialAddresses={[address]} />)

    // Address step → quote → delivery step.
    await user.click(screen.getByRole("button", { name: /Continue to delivery/ }))
    expect(await screen.findByText("Sourdough loaf")).toBeInTheDocument()
    expect(quoteCalls).toBe(1)

    // Place the order → intent 409 → the flow re-quotes and shows the change notice.
    await user.click(screen.getByRole("button", { name: /Continue to payment/ }))
    expect(await screen.findByText(/Delivery options changed/i)).toBeInTheDocument()

    // Exactly one intent attempt (no blind retry) and a fresh quote fetched.
    expect(intentCalls).toBe(1)
    expect(quoteCalls).toBe(2)
    // Still on the delivery step, not paying.
    expect(screen.getByRole("button", { name: /Continue to payment/ })).toBeInTheDocument()
  })
})
