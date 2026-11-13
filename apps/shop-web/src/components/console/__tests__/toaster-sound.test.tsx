import { act, render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const props = vi.hoisted(() => [] as { sound?: string; position?: string }[])
vi.mock("@effy/design-system/ui", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Toaster: (p: { sound?: string; position?: string }) => {
    props.push(p)
    return null
  },
}))

const { ShopToaster } = await import("../ShopToaster")
const { setSoundOn } = await import("@/lib/console-store")

describe("the shop console's toasts and its Sound setting (120 US1)", () => {
  it("plays tones while Sound is on and none while it is off", () => {
    act(() => setSoundOn(true))
    render(<ShopToaster />)
    expect(props.at(-1)).toEqual({ position: "bottom-right", sound: "on" })
    act(() => setSoundOn(false))
    expect(props.at(-1)).toEqual({ position: "bottom-right", sound: "off" })
  })
})
