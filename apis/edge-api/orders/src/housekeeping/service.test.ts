import { describe, expect, it } from "vitest"

import { attentionOf, HousekeepingSettingsInvalid, nextRunOf, parseHousekeepingSettings } from "./service"

const now = new Date("2026-11-12T10:00:00Z")
const ago = (min: number) => new Date(now.getTime() - min * 60_000)

describe("113 - a clean-up's attention", () => {
  it("is late when it has never run, or not within its bound", () => {
    expect(attentionOf(null, 60, now)).toBe("late")
    expect(attentionOf({ started_at: ago(61), outcome: "ok" }, 60, now)).toBe("late")
    expect(attentionOf({ started_at: ago(59), outcome: "ok" }, 60, now)).toBeNull()
  })

  it("is failed for a failed last run, whenever it was", () => {
    expect(attentionOf({ started_at: ago(1), outcome: "failed" }, 60, now)).toBe("failed")
  })

  it("is partial for a run that left something to retry", () => {
    expect(attentionOf({ started_at: ago(1), outcome: "partial" }, 60, now)).toBe("partial")
    // Late outranks partial: the alarm that matters is "it stopped".
    expect(attentionOf({ started_at: ago(200), outcome: "partial" }, 120, now)).toBe("late")
  })

  it("says the next run from the last start and the schedule", () => {
    expect(nextRunOf({ started_at: ago(5) }, 15)).toBe(new Date(now.getTime() + 10 * 60_000).toISOString())
    expect(nextRunOf(null, 15)).toBeNull()
  })
})

describe("113 - the abandon time", () => {
  it("accepts 1 hour to 7 days, in whole minutes, with the version", () => {
    expect(parseHousekeepingSettings({ abandonAfterMinutes: 60, version: "v" })).toEqual({ abandonAfterMinutes: 60, version: "v" })
    expect(parseHousekeepingSettings({ abandonAfterMinutes: 10080, version: "v" }).abandonAfterMinutes).toBe(10080)
  })

  it("refuses anything else", () => {
    for (const body of [
      null,
      { abandonAfterMinutes: 59, version: "v" },
      { abandonAfterMinutes: 10081, version: "v" },
      { abandonAfterMinutes: 90.5, version: "v" },
      { abandonAfterMinutes: "60", version: "v" },
      { abandonAfterMinutes: 60 },
      { abandonAfterMinutes: 60, version: "v", extra: 1 },
    ]) {
      expect(() => parseHousekeepingSettings(body as never), JSON.stringify(body)).toThrow(HousekeepingSettingsInvalid)
    }
  })
})
