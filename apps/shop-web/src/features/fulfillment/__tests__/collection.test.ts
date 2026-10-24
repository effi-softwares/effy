import { describe, expect, it } from "vitest"

import { collectionLine, driverWord, runTime } from "../collection"

const TZ = "Australia/Melbourne"
// 12:30 pm in Melbourne (AEDT, +11).
const RUN = "2026-10-27T01:30:00.000Z"

describe("how a collection run is worded (099)", () => {
  it("says the time today, 'Tomorrow' and a weekday after that", () => {
    expect(runTime({ runAt: RUN, dayOffset: 0 }, TZ)).toBe("12:30 pm")
    expect(runTime({ runAt: RUN, dayOffset: 1 }, TZ)).toBe("Tomorrow 12:30 pm")
    expect(runTime({ runAt: RUN, dayOffset: 3 }, TZ)).toBe("Tuesday 12:30 pm")
    expect(collectionLine({ runAt: RUN, dayOffset: 0, driver: "none" }, TZ)).toBe("collected on the 12:30 pm run")
  })

  it("turns 'assigned' into 'on the way' at the round's opening, on the screen's own clock, only while on duty", () => {
    const opensAt = "2026-10-27T00:45:00.000Z"
    const before = Date.parse("2026-10-27T00:30:00.000Z")
    const after = Date.parse("2026-10-27T01:00:00.000Z")
    expect(driverWord({ driver: "assigned", opensAt, driverOnDuty: true }, before)).toBe("assigned")
    expect(driverWord({ driver: "assigned", opensAt, driverOnDuty: true }, after)).toBe("on_the_way")
    expect(driverWord({ driver: "assigned", opensAt, driverOnDuty: false }, after)).toBe("assigned")
    expect(driverWord({ driver: "collected", opensAt, driverOnDuty: true }, after)).toBe("collected")
  })
})
