import { describe, expect, it } from "vitest"

import { automationWhenWords, nextRunAt, wallTimeToInstant, type RepeatSchedule } from "./message-automations"
import { fillFirstName, firstWordOf, hasFirstNamePlaceholder, normaliseFirstName, validNameFallback } from "./messages"

const TZ = "Australia/Melbourne"
const sched = (over: Partial<RepeatSchedule>): RepeatSchedule => ({
  every: "day", days: null, date: null, time: "09:00", startsOn: "2026-11-01", endsOn: null, ...over,
})
const at = (iso: string) => new Date(iso)

describe("nextRunAt (115 E12)", () => {
  it("a daily repeat: today's time if still ahead, else tomorrow's, on Effy's clock", () => {
    // 2026-11-12 08:00 Melbourne (AEDT, +11) = 2026-11-11T21:00Z
    expect(nextRunAt(sched({}), at("2026-11-11T21:00:00Z"), TZ)?.toISOString()).toBe("2026-11-11T22:00:00.000Z")
    expect(nextRunAt(sched({}), at("2026-11-11T22:00:00Z"), TZ)?.toISOString()).toBe("2026-11-12T22:00:00.000Z")
  })

  it("weekly on chosen days, and monthly on a date", () => {
    // Thu 2026-11-12 10:00 Melbourne → next Friday 09:00
    expect(nextRunAt(sched({ every: "week", days: [5] }), at("2026-11-11T23:00:00Z"), TZ)?.toISOString()).toBe("2026-11-12T22:00:00.000Z")
    expect(nextRunAt(sched({ every: "month", date: 3 }), at("2026-11-11T23:00:00Z"), TZ)?.toISOString()).toBe("2026-12-02T22:00:00.000Z")
  })

  it("respects the start and the end", () => {
    expect(nextRunAt(sched({ startsOn: "2026-12-01" }), at("2026-11-11T23:00:00Z"), TZ)?.toISOString()).toBe("2026-11-30T22:00:00.000Z")
    expect(nextRunAt(sched({ endsOn: "2026-11-12" }), at("2026-11-12T23:00:00Z"), TZ)).toBeNull()
  })

  it("keeps the wall-clock time across a daylight-saving change (Melbourne leaves AEDT on 2027-04-04)", () => {
    const before = nextRunAt(sched({}), at("2027-04-02T23:00:00Z"), TZ)! // 3 Apr 10:00 AEDT → 4 Apr 09:00 AEST
    expect(before.toISOString()).toBe("2027-04-03T23:00:00.000Z")
    const after = nextRunAt(sched({}), before, TZ)!
    expect(after.toISOString()).toBe("2027-04-04T23:00:00.000Z")
  })

  it("wallTimeToInstant reads the operating zone", () => {
    expect(wallTimeToInstant(2026, 7, 1, 9, 0, TZ).toISOString()).toBe("2026-06-30T23:00:00.000Z")
  })

  it("says when it sends in plain words", () => {
    expect(automationWhenWords({ mode: "repeat", trigger: null, repeat: sched({ every: "week", days: [5, 1] }) })).toBe("Every Mon, Fri at 09:00")
    expect(automationWhenWords({ mode: "trigger", trigger: { kind: "not_ordered_days", value: 30 }, repeat: null })).toBe("Hasn't ordered for 30 days")
    expect(automationWhenWords({ mode: "trigger", trigger: { kind: "cart_left_hours", value: 1 }, repeat: null })).toBe("Left items in the cart for 1 hour")
  })
})

describe("the first name (115 E13)", () => {
  it("is stored as a placeholder with its fallback, never as a name", () => {
    expect(normaliseFirstName("Hi {first name}, welcome", "there")).toBe("Hi {first name|there}, welcome")
    expect(hasFirstNamePlaceholder("Hi {First Name}")).toBe(true)
  })

  it("fills a name where there is one, the fallback where there isn't, and the fallback on every lock screen", () => {
    const stored = normaliseFirstName("Hi {first name}!", "friend")
    expect(fillFirstName(stored, "Sam")).toBe("Hi Sam!")
    expect(fillFirstName(stored, null)).toBe("Hi friend!")
    expect(fillFirstName(stored, "  ")).toBe("Hi friend!")
    expect(fillFirstName("Hi {first name}", null)).toBe("Hi there")
  })

  it("a driver's or staff member's first name is the first word of their name", () => {
    expect(firstWordOf("Ana Lopez")).toBe("Ana")
    expect(firstWordOf("  ")).toBeNull()
    expect(firstWordOf(null)).toBeNull()
  })

  it("a fallback is 1–20 characters with no braces or bar", () => {
    expect(validNameFallback("there")).toBe(true)
    expect(validNameFallback("")).toBe(false)
    expect(validNameFallback("a|b")).toBe(false)
    expect(validNameFallback("x".repeat(21))).toBe(false)
  })
})
