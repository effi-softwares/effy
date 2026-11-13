import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const onScan = vi.hoisted(() => ({ current: null as null | ((raw: string) => Promise<void>) }))
vi.mock("@effy/web-kit/scanner", () => ({
  createWedge: (o: { onScan: (raw: string) => Promise<void> }) => {
    onScan.current = o.onScan
    return () => false
  },
}))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/orders" }) }))
const lookupLabel = vi.hoisted(() => vi.fn())
vi.mock("@/features/orders/repo", () => ({ lookupLabel }))
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }))
vi.mock("@effy/design-system/ui", () => ({ toast }))
const playCue = vi.hoisted(() => vi.fn())
vi.mock("@effy/design-system/toast", () => ({ playCue }))

const { ScanBox } = await import("../ScanBox")

beforeEach(() => vi.clearAllMocks())

describe("scanning is the one place back-office makes a sound (120 US2)", () => {
  it("an unknown label raises a failure that asks for its tone", async () => {
    lookupLabel.mockResolvedValue(null)
    render(<ScanBox />)
    await onScan.current!("EFY1:ABCDEF")
    expect(toast.error).toHaveBeenCalledWith("No bag has that label.", { sound: true })
  })

  it("a lookup that fails asks for its tone", async () => {
    lookupLabel.mockRejectedValue(new Error("offline"))
    render(<ScanBox />)
    await onScan.current!("EFY1:ABCDEF")
    expect(toast.error).toHaveBeenCalledWith("Couldn't look that label up. Try again.", { sound: true })
  })

  it("a found label confirms with a tone and opens the order, with no toast", async () => {
    lookupLabel.mockResolvedValue({ orderId: "o1", parcelId: "p1", fulfillmentId: "f1", voided: false })
    render(<ScanBox />)
    await onScan.current!("EFY1:ABCDEF")
    expect(playCue).toHaveBeenCalledWith("success")
    expect(toast).not.toHaveBeenCalled()
  })

  it("a removed label says so, with its tone", async () => {
    lookupLabel.mockResolvedValue({ orderId: "o1", parcelId: null, fulfillmentId: "f1", voided: true })
    render(<ScanBox />)
    await onScan.current!("EFY1:ABCDEF")
    expect(toast).toHaveBeenCalledWith("That label was removed from its order. Throw it away.", { sound: true })
    expect(playCue).not.toHaveBeenCalled()
  })
})
