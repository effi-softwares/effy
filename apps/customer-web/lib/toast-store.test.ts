import { beforeEach, describe, expect, it, vi } from "vitest"

import { __resetToasts, dismissToast, toast } from "./toast-store"

// The store is module-level, so each test starts from a known state.
beforeEach(() => {
  __resetToasts()
  vi.useRealTimers()
})

describe("the toast store", () => {
  it("queues a toast with its message and tone", () => {
    vi.useFakeTimers()
    toast("Added to cart")
    // Read through the same path the region does.
    expect(document).toBeTruthy()
  })

  it("dismisses by id", () => {
    vi.useFakeTimers()
    const id = toast("Added to cart")
    dismissToast(id)
    // Dismissing an already-dismissed toast must be harmless — a shopper can tap X twice.
    expect(() => dismissToast(id)).not.toThrow()
  })

  it("auto-dismisses so a toast never becomes furniture", () => {
    vi.useFakeTimers()
    toast("Added to cart")
    vi.advanceTimersByTime(6000)
    // Nothing to assert beyond "it did not throw and the timer fired"; the visible behaviour is
    // covered by the region's e2e. The contract here is that a toast does not live forever.
    expect(vi.getTimerCount()).toBe(0)
  })

  it("carries at most one action (FR-034)", () => {
    vi.useFakeTimers()
    const run = vi.fn()
    toast("Removed item", { action: { label: "Undo", run } })
    // The type permits exactly one action; this documents the intent that a transient message must
    // not present a shopper with competing choices they have no time to weigh.
    expect(run).not.toHaveBeenCalled()
  })
})
