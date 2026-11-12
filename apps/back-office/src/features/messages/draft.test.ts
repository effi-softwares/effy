import { describe, expect, it } from "vitest"

import { reportLines } from "./components/ReportTable"
import { bodyOf, draftProblems, emptyDraft, filledFor, withKind } from "./draft"

describe("the composer - email and the first name (115)", () => {
  it("sends email only with a customer audience, and the fallback - there by default", () => {
    const offer = { ...withKind(emptyDraft(), "offer"), title: "Berries", body: "Hi {first name}, from Effy", email: true }
    expect(bodyOf(offer)).toMatchObject({ email: true, nameFallback: "there" })
    const drivers = { ...emptyDraft("announcement"), title: "Hub", body: "Late", email: true }
    expect(bodyOf(drivers).email).toBe(false)
  })

  it("refuses the first name in the title and a bad fallback before the server is asked", () => {
    const d = { ...withKind(emptyDraft(), "offer"), title: "Hi {first name}", body: "From Effy", nameFallback: "a|b" }
    const problems = draftProblems(d, false)
    expect(problems.some((p) => p.includes("title"))).toBe(true)
    expect(problems.some((p) => p.includes("no first name"))).toBe(true)
  })

  it("previews a name in the inbox and the fallback on the lock screen", () => {
    const d = { ...emptyDraft(), nameFallback: "friend" }
    expect(filledFor("Hi {first name}!", d, "Sam")).toBe("Hi Sam!")
    expect(filledFor("Hi {first name}!", d, null)).toBe("Hi friend!")
  })

  it("the report gains the email lines only when the message went by email", () => {
    const ids = (email: boolean) => reportLines({ kind: "offer", push: true, email }).map((l) => l.id)
    expect(ids(false)).not.toContain("e-sent")
    expect(ids(true)).toEqual(expect.arrayContaining(["email", "e-sent", "e-noAddress", "e-suppressed", "e-unsubscribed"]))
  })
})
