import { describe, expect, it } from "vitest"

import { automaticProblems, bodyOfAutomatic, emptyAutomatic, oneAudience, withMode } from "./draft"

/** 115 US3/US4 - the automatic-message composer: one audience, the trigger rules, the repeat's shape on the wire. */
const words = (d: ReturnType<typeof emptyAutomatic>) => ({
  ...d,
  name: "Win back",
  message: { ...d.message, title: "We miss you", body: "Hi {first name}, 10% off at Effy" },
})

describe("115 - the automatic composer", () => {
  it("starts as a win-back to customers: an offer, one audience, 30 days", () => {
    const d = words(emptyAutomatic())
    expect(automaticProblems(d)).toEqual([])
    expect(bodyOfAutomatic(d)).toMatchObject({
      kind: "offer", audience: "customer", mode: "trigger", trigger: { kind: "not_ordered_days", value: 30 }, repeat: null,
    })
  })

  it("turning an audience on turns the others off", () => {
    const d = emptyAutomatic("repeat")
    const both = { ...d.message, audiences: { ...d.message.audiences, shop: { ...d.message.audiences.shop, on: true } } }
    const next = oneAudience(d.message, both)
    expect(Object.entries(next.audiences).filter(([, a]) => a.on).map(([k]) => k)).toEqual(["shop"])
  })

  it("a trigger keeps only offers and news, to customers", () => {
    const repeat = emptyAutomatic("repeat")
    const t = withMode(repeat, "trigger")
    expect(t.message.kind).toBe("offer")
    expect(Object.entries(t.message.audiences).filter(([, a]) => a.on).map(([k]) => k)).toEqual(["customer"])
  })

  it("a weekly repeat needs a day; out-of-range trigger numbers are refused; a name is required", () => {
    const r = words(emptyAutomatic("repeat"))
    expect(automaticProblems({ ...r, days: [] })).toContain("Choose at least one day of the week.")
    expect(automaticProblems({ ...words(emptyAutomatic()), triggerValue: 2 })).toContain("Hasn't ordered for: 7–365 days.")
    expect(automaticProblems({ ...words(emptyAutomatic()), name: " " })).toContain("Give it a name staff will recognise.")
  })

  it("a repeat goes on the wire with only the fields its frequency uses", () => {
    const r = { ...words(emptyAutomatic("repeat")), every: "month" as const, date: 15, days: [1, 3] }
    expect(bodyOfAutomatic(r).repeat).toMatchObject({ every: "month", date: 15, days: null, endsOn: null })
  })
})
