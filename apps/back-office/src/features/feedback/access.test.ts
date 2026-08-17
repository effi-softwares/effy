import { describe, expect, it } from "vitest"

import { canReplyFeedback } from "./access"

describe("canReplyFeedback — reflects the backend reply gate (research D7)", () => {
  it("allows admin and manager", () => {
    expect(canReplyFeedback(["admin"])).toBe(true)
    expect(canReplyFeedback(["manager"])).toBe(true)
    expect(canReplyFeedback(["manager", "csa"])).toBe(true)
  })

  it("refuses csa and role-less staff (they may still read/triage/note)", () => {
    expect(canReplyFeedback(["csa"])).toBe(false)
    expect(canReplyFeedback([])).toBe(false)
  })
})
