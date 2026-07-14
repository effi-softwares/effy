import { beforeEach, describe, expect, it } from "vitest"

import { clearCooldown, markCodeSent, secondsUntilResend } from "./otp-cooldown"

describe("otp cooldown (FR-016)", () => {
  beforeEach(() => window.sessionStorage.clear())

  it("allows the first send immediately", () => {
    expect(secondsUntilResend()).toBe(0)
  })

  it("blocks a resend right after one is sent", () => {
    const t = 1_000_000
    markCodeSent(t)
    expect(secondsUntilResend(t)).toBe(30)
  })

  it("counts down", () => {
    const t = 1_000_000
    markCodeSent(t)
    expect(secondsUntilResend(t + 10_000)).toBe(20)
    expect(secondsUntilResend(t + 29_000)).toBe(1)
  })

  it("allows a resend once the window has passed", () => {
    const t = 1_000_000
    markCodeSent(t)
    expect(secondsUntilResend(t + 30_000)).toBe(0)
    expect(secondsUntilResend(t + 60_000)).toBe(0)
  })

  it("never reports a negative wait", () => {
    markCodeSent(1_000_000)
    expect(secondsUntilResend(9_999_999)).toBe(0)
  })

  it("clears", () => {
    markCodeSent(1_000_000)
    clearCooldown()
    expect(secondsUntilResend(1_000_000)).toBe(0)
  })
})
