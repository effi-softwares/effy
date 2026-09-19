import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  OfflineError,
  assertOnline,
  isOffline,
  noteContact,
  noteNetworkFailure,
  onlineStore,
  watchConnectivity,
} from "../online"
import { api } from "../api"

beforeEach(() => {
  onlineStore.setState(() => ({ online: true, lastContactAt: null }))
  vi.restoreAllMocks()
})

describe("⚠ FR-036 — a write is refused offline, never faked", () => {
  it("throws a DISTINCT error, so the UI can say 'offline' rather than 'something went wrong'", () => {
    onlineStore.setState((s) => ({ ...s, online: false }))
    expect(() => assertOnline()).toThrow(OfflineError)
    // The message is what the operator reads. "Failed" would send them looking for a fault.
    expect(() => assertOnline()).toThrow(/offline/i)
  })

  it("allows a write while online", () => {
    expect(() => assertOnline()).not.toThrow()
  })

  it("⚠ refuses a POST without touching the network at all", async () => {
    // The thing that must never happen is a write that LOOKS like it worked. Refusing before the
    // request is what makes "told it cannot be done" and "quietly did nothing" distinguishable.
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    onlineStore.setState((s) => ({ ...s, online: false }))

    await expect(api.post("/shop/v1/anything", { a: 1 })).rejects.toThrow(OfflineError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each(["post", "put", "patch", "delete"] as const)("refuses %s offline", async (method) => {
    onlineStore.setState((s) => ({ ...s, online: false }))
    await expect((api[method] as (p: string) => Promise<unknown>)("/shop/v1/x")).rejects.toThrow(
      OfflineError,
    )
  })

  it("⚠ does NOT refuse a GET — a read should fall back to the cache, not to an error page", async () => {
    onlineStore.setState((s) => ({ ...s, online: false }))
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"))
    // It fails as a network error, which is what lets TanStack Query serve its cached data.
    await expect(api.get("/shop/v1/today")).rejects.not.toBeInstanceOf(OfflineError)
  })
})

describe("⚠ only a network failure means offline", () => {
  it("a TypeError from fetch marks the console offline", () => {
    noteNetworkFailure()
    expect(isOffline()).toBe(true)
  })

  it("a successful request marks it online and records the contact", () => {
    noteNetworkFailure()
    noteContact()
    expect(isOffline()).toBe(false)
    expect(onlineStore.state.lastContactAt).toBeTypeOf("number")
  })

  it("⚠ an HTTP error does NOT mark the console offline", async () => {
    // We REACHED the server. Treating a 500 as connectivity tells an operator to check their wifi
    // over a backend defect — and hides the offline banner's meaning when it is genuinely needed.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ title: "boom" }), {
        status: 500,
        headers: { "content-type": "application/problem+json" },
      }),
    )
    await expect(api.get("/shop/v1/today")).rejects.toBeDefined()
    expect(isOffline()).toBe(false)
  })
})

describe("FR-037 — recovery needs no manual reload", () => {
  it("fires onReconnect only on a TRANSITION back to online", () => {
    const onReconnect = vi.fn()
    const stop = watchConnectivity(onReconnect)

    // Already online: an `online` event that is not a recovery must not refetch every screen.
    window.dispatchEvent(new Event("online"))
    expect(onReconnect).not.toHaveBeenCalled()

    window.dispatchEvent(new Event("offline"))
    expect(isOffline()).toBe(true)

    window.dispatchEvent(new Event("online"))
    expect(onReconnect).toHaveBeenCalledTimes(1)

    stop()
    window.dispatchEvent(new Event("offline"))
    window.dispatchEvent(new Event("online"))
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })
})

describe("⚠ the default is ONLINE, not offline", () => {
  it("does not render a console as offline just because the signal is unavailable", () => {
    // `navigator.onLine` is absent in some environments. Defaulting to offline would show the
    // banner and refuse every write on a perfectly connected console — a far worse failure than
    // the reverse, which self-corrects on the first request.
    expect(onlineStore.state.online).toBe(true)
  })
})
