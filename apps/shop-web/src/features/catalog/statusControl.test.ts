import { describe, expect, it } from "vitest"

import {
  availableTransitions,
  canHardDelete,
  deleteGuardMessage,
  removalAction,
  visibilityAction,
} from "./statusControl"

describe("availableTransitions", () => {
  it("draft → nothing: a draft goes on sale by Effy's approval, never by a status move (067)", () => {
    expect(availableTransitions("draft")).toEqual([])
  })
  it("active → unavailable or archived", () => {
    expect(availableTransitions("active").map((t) => t.status)).toEqual(["unavailable", "archived"])
  })
  it("unavailable → active or archived", () => {
    expect(availableTransitions("unavailable").map((t) => t.status)).toEqual(["active", "archived"])
  })
  it("archived → reactivate (active) only", () => {
    const t = availableTransitions("archived")
    expect(t.map((x) => x.status)).toEqual(["active"])
    expect(t[0]?.label).toBe("Reactivate")
  })
})

describe("canHardDelete", () => {
  it("is true only for a draft", () => {
    expect(canHardDelete("draft")).toBe(true)
    expect(canHardDelete("active")).toBe(false)
    expect(canHardDelete("unavailable")).toBe(false)
    expect(canHardDelete("archived")).toBe(false)
  })
})

describe("deleteGuardMessage", () => {
  it("warns that a draft is permanently deleted", () => {
    expect(deleteGuardMessage("draft")).toMatch(/permanently deleted/i)
  })
  it("explains that a published product is archived instead", () => {
    expect(deleteGuardMessage("active")).toMatch(/archive it instead/i)
    expect(deleteGuardMessage("archived")).toMatch(/archive it instead/i)
  })
})

describe("visibilityAction", () => {
  it("says what the operator gets, never the internal status name", () => {
    expect(visibilityAction("active")?.label).toBe("Unpublish")
    // A shop submits; it does not publish.
    expect(visibilityAction("draft")?.label).toBe("Submit for review")
    expect(visibilityAction("unavailable")?.label).toBe("Publish")
    expect(visibilityAction("archived")?.label).toBe("Restore")
  })

  it("routes every publish to the one on-sale state", () => {
    expect(visibilityAction("unavailable")?.target).toBe("active")
    expect(visibilityAction("archived")?.target).toBe("active")
    expect(visibilityAction("active")?.target).toBe("unavailable")
  })

  it("never offers a transition availableTransitions would refuse", () => {
    for (const status of ["draft", "active", "unavailable", "archived"] as const) {
      const action = visibilityAction(status)
      if (!action || action.kind !== "status") continue
      expect(availableTransitions(status).map((t) => t.status)).toContain(action.target)
    }
  })

  it("explains what happens to orders and to the stock count, not just 'are you sure'", () => {
    expect(visibilityAction("active")?.confirmBody).toMatch(/orders already placed are unaffected/i)
    expect(visibilityAction("active")?.confirmBody).toMatch(/nothing is deleted/i)
  })
})

describe("removalAction", () => {
  it("offers a permanent delete only for a draft", () => {
    expect(removalAction("draft")).toMatchObject({ kind: "delete" })
    expect(removalAction("active")).toMatchObject({ kind: "archive" })
    expect(removalAction("unavailable")).toMatchObject({ kind: "archive" })
  })

  it("agrees with canHardDelete rather than deciding separately", () => {
    // Two functions answering "can this be deleted" is how they come to disagree.
    for (const status of ["draft", "active", "unavailable", "archived"] as const) {
      const action = removalAction(status)
      const offersDelete = action?.kind === "delete"
      expect(offersDelete).toBe(canHardDelete(status) && status !== "archived")
    }
  })

  it("offers nothing for an archived product", () => {
    expect(removalAction("archived")).toBeNull()
  })

  it("promises the archive keeps the stock count and the history", () => {
    expect(removalAction("active")?.confirmBody).toMatch(/stock count/i)
    expect(removalAction("active")?.confirmBody).toMatch(/restore it at any time/i)
  })
})
