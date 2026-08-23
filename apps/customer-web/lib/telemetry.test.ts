import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("posthog-js", () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}))

vi.mock("@/lib/config", () => ({
  posthogConfig: () => ({ key: "phc_test", host: "https://ph.test", ingestPath: "/rc" }),
  telemetryEnabled: () => true,
}))

import posthog from "posthog-js"

/**
 * `lib/telemetry` keeps module-level state (`started`, and the lazily-loaded SDK handle), so each
 * test loads a FRESH copy. Without this, a test that grants consent leaves the module initialised
 * for every test after it, and the "nothing loaded without consent" assertions below would pass
 * for the wrong reason — or fail depending on declaration order, which is worse.
 */
async function freshTelemetry() {
  vi.resetModules()
  return import("./telemetry")
}

/**
 * Let the dynamic `import("posthog-js")` inside initAnalytics() settle.
 *
 * The SDK is now loaded lazily so it stays off the guest critical path (feature 025 T020), which
 * makes initialisation asynchronous. These tests await it rather than assuming it is synchronous —
 * the same thing a real caller experiences.
 */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * The consent gate is a governance requirement (Principle VII), not a UX nicety. These tests
 * assert the thing that actually matters: nothing reaches PostHog before consent exists.
 */
describe("telemetry consent gate", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it("reports unknown consent before the customer has chosen", async () => {
    const { getConsent } = await freshTelemetry()
    expect(getConsent()).toBe("unknown")
  })

  it("does NOT initialize analytics without consent", async () => {
    const { initAnalytics } = await freshTelemetry()
    initAnalytics()
    await settle()
    expect(posthog.init).not.toHaveBeenCalled()
  })

  it("does NOT capture events without consent", async () => {
    const { capture } = await freshTelemetry()
    capture({ name: "storefront_viewed" })
    await settle()
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it("initializes only once consent is granted", async () => {
    const { setConsent, getConsent } = await freshTelemetry()
    setConsent("granted")
    await settle()
    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(getConsent()).toBe("granted")
  })

  it("does not re-initialize on a repeated grant", async () => {
    const { setConsent, initAnalytics } = await freshTelemetry()
    setConsent("granted")
    await settle()
    initAnalytics()
    await settle()
    expect(posthog.init).toHaveBeenCalledTimes(1)
  })

  /**
   * The SDK must not be FETCHED before consent, not merely left un-called.
   *
   * This is the regression that motivated the change: `lib/telemetry.ts` documented "for a guest
   * who never consents, the analytics SDK never loads at all" while statically importing it, so
   * every guest downloaded ~68 KB regardless. Denying consent must leave nothing loaded — and
   * therefore nothing to opt out of.
   */
  it("loads no SDK at all when consent is denied", async () => {
    const { setConsent, analytics } = await freshTelemetry()
    setConsent("denied")
    await settle()
    expect(posthog.init).not.toHaveBeenCalled()
    expect(analytics()).toBeNull()
    // Nothing was ever started, so there is nothing to opt out OF — which is the desired end
    // state. Asserting opt_out_capturing() here would be asserting that we loaded the SDK in
    // order to switch it off.
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled()
  })

  it("captures a typed event once consent is granted", async () => {
    const { setConsent, capture } = await freshTelemetry()
    setConsent("granted")
    await settle()
    capture({ name: "sign_in_completed", props: { route: "otp" } })
    expect(posthog.capture).toHaveBeenCalledWith("sign_in_completed", {
      route: "otp",
    })
  })

  it("exposes the SDK to web-vitals only after a consenting load", async () => {
    const { setConsent, analytics } = await freshTelemetry()
    expect(analytics()).toBeNull()
    setConsent("granted")
    await settle()
    expect(analytics()).not.toBeNull()
  })
})
