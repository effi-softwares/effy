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
  posthogConfig: () => ({ key: "phc_test", host: "https://ph.test" }),
}))

import posthog from "posthog-js"
import { capture, getConsent, initAnalytics, setConsent } from "./telemetry"

/**
 * The consent gate is a governance requirement (Principle VII), not a UX nicety. These tests
 * assert the thing that actually matters: nothing reaches PostHog before consent exists.
 */
describe("telemetry consent gate", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it("reports unknown consent before the customer has chosen", () => {
    expect(getConsent()).toBe("unknown")
  })

  it("does NOT initialize analytics without consent", () => {
    initAnalytics()
    expect(posthog.init).not.toHaveBeenCalled()
  })

  it("does NOT capture events without consent", () => {
    capture({ name: "storefront_viewed" })
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it("initializes only once consent is granted", () => {
    setConsent("granted")
    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(getConsent()).toBe("granted")
  })

  it("opts out when consent is denied", () => {
    setConsent("denied")
    expect(posthog.opt_out_capturing).toHaveBeenCalled()
    expect(posthog.init).not.toHaveBeenCalled()
  })

  it("captures a typed event once consent is granted", () => {
    setConsent("granted")
    capture({ name: "sign_in_completed", props: { route: "otp" } })
    expect(posthog.capture).toHaveBeenCalledWith("sign_in_completed", {
      route: "otp",
    })
  })
})
