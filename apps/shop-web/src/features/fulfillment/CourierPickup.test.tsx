import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { CourierPickupDTO } from "@effy/shared-types"

const courierHandover = vi.hoisted(() => vi.fn())
vi.mock("./repo", () => ({ courierHandover, listFulfillments: vi.fn(), getFulfillment: vi.fn() }))

import { CourierPickup } from "./components/CourierPickup"
import { courierPickupLine, pickupWhen } from "./courierPickup"
import { buildJobs } from "@/features/today/model"
import { orderRow } from "./__tests__/fixtures"

const pickup = (over: Partial<CourierPickupDTO> = {}): CourierPickupDTO => ({
  state: "booked",
  pickupDate: "2026-10-15",
  pickupFrom: "13:00",
  pickupTo: "15:00",
  courierName: "Test Courier",
  serviceName: "Parcel",
  reference: "REF123",
  labelUrl: "https://signed.example/label.pdf",
  ...over,
})

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>)
}

describe("080 - a courier collects this parcel from the shop", () => {
  beforeEach(() => {
    courierHandover.mockReset()
    courierHandover.mockResolvedValue({ id: "f1", orderNumber: "EFY-1", status: "collected" })
  })

  it("says who comes and when, in one line, for rows and Today", () => {
    expect(courierPickupLine(pickup())).toBe("Courier pickup · Thu 15 Oct, 1–3 pm")
    expect(pickupWhen(pickup({ pickupFrom: "11:30", pickupTo: "13:00" }))).toBe("Thu 15 Oct, 11:30 am–1 pm")
    expect(courierPickupLine(pickup({ pickupFrom: null, pickupTo: null }))).toBe("Courier pickup · Thu 15 Oct")
    expect(courierPickupLine(pickup({ state: "arranging", pickupDate: null }))).toBe("Courier pickup · being arranged")
    expect(courierPickupLine(pickup({ state: "handed_over" }))).toBe("Handed over to courier")
    const detail = (over: Parameters<typeof orderRow>[0]) =>
      buildJobs({ waiting: [orderRow(over)], waitingTotal: 1, attention: [], attentionMore: 0, nextRunAt: null, timezone: "Australia/Melbourne", now: 0 }).jobs[0]!.detail
    expect(detail({ itemCount: 2, courierPickup: pickup() })).toMatch(/^2 items Courier pickup · Thu 15 Oct, 1–3 pm · waited/)
    expect(detail({ itemCount: 1 })).toMatch(/^1 item Courier · waited/)
  })

  it("shows the courier, the window, the reference and the label; hands over once packed", async () => {
    wrap(<CourierPickup fulfillmentId="f1" status="ready_for_pickup" pickup={pickup()} />)
    const block = screen.getByTestId("courier-pickup")
    expect(block).toHaveTextContent("Test Courier · Parcel")
    expect(block).toHaveTextContent("Thu 15 Oct, 1–3 pm")
    expect(block).toHaveTextContent("REF123")
    expect(screen.getByRole("link", { name: "Open label to print" })).toHaveAttribute(
      "href",
      "https://signed.example/label.pdf",
    )
    await userEvent.click(screen.getByRole("button", { name: "Handed over to courier" }))
    await waitFor(() => expect(courierHandover).toHaveBeenCalledWith("f1"))
  })

  it("no handover before it is packed, or before Effy has booked the pickup", () => {
    const { unmount } = wrap(<CourierPickup fulfillmentId="f1" status="picking" pickup={pickup()} />)
    expect(screen.queryByRole("button", { name: "Handed over to courier" })).not.toBeInTheDocument()
    expect(screen.getByText("Mark it ready before the courier arrives.")).toBeInTheDocument()
    unmount()
    wrap(
      <CourierPickup
        fulfillmentId="f1"
        status="ready_for_pickup"
        pickup={pickup({ state: "arranging", pickupDate: null, reference: null, labelUrl: null })}
      />,
    )
    expect(screen.queryByRole("button", { name: "Handed over to courier" })).not.toBeInTheDocument()
    expect(screen.getByTestId("courier-pickup")).toHaveTextContent("Effy will book the pickup")
  })
})
