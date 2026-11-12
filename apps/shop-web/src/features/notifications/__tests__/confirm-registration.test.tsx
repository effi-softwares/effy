import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ registerDevice: vi.fn() }))
const messaging = vi.hoisted(() => ({
  pushSupport: vi.fn(() => ({ supported: true })),
  permissionState: vi.fn(() => "granted"),
  obtainToken: vi.fn(async () => "tok-1"),
}))
vi.mock("../api", () => api)
vi.mock("../messaging", () => messaging)

const { resetConfirmedRegistration, useConfirmRegistration } = await import("../useConfirmRegistration")

beforeEach(() => {
  vi.clearAllMocks()
  resetConfirmedRegistration()
  api.registerDevice.mockResolvedValue(undefined)
  messaging.pushSupport.mockReturnValue({ supported: true })
  messaging.permissionState.mockReturnValue("granted")
  messaging.obtainToken.mockResolvedValue("tok-1")
})

describe("113 - the console confirms its notification registration when it opens", () => {
  it("re-registers the device's token once per page load, keeping its choices", async () => {
    renderHook(() => useConfirmRegistration())
    await waitFor(() => expect(api.registerDevice).toHaveBeenCalledWith({ fcmToken: "tok-1", platform: "web" }))
    renderHook(() => useConfirmRegistration())
    await Promise.resolve()
    expect(api.registerDevice).toHaveBeenCalledTimes(1)
  })

  it("never asks for permission, and does nothing without it", async () => {
    messaging.permissionState.mockReturnValue("default")
    renderHook(() => useConfirmRegistration())
    await Promise.resolve()
    expect(messaging.obtainToken).not.toHaveBeenCalled()
    expect(api.registerDevice).not.toHaveBeenCalled()
  })

  it("tries again on the next load after a failure", async () => {
    api.registerDevice.mockRejectedValueOnce(new Error("offline"))
    renderHook(() => useConfirmRegistration())
    await waitFor(() => expect(api.registerDevice).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 0))
    renderHook(() => useConfirmRegistration())
    await waitFor(() => expect(api.registerDevice).toHaveBeenCalledTimes(2))
  })
})
