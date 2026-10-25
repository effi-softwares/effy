import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const previewDeliveryMove = vi.hoisted(() => vi.fn())
const changeDeliveryWindow = vi.hoisted(() => vi.fn())
vi.mock("../repo", async () => ({
  ...(await vi.importActual<object>("../repo")),
  previewDeliveryMove,
  changeDeliveryWindow,
}))

const { ChangeDeliveryWindowDialog } = await import("./ChangeDeliveryWindowDialog")

const PREVIEW = {
  to: "effy",
  allowed: false,
  refusal: { code: "already_effy", message: "x" },
  updatedAt: "2026-10-09T03:00:00.000Z",
  paidDeliveryAmount: "9.00",
  courierFeeAmount: null,
  differenceAmount: null,
  refundableAmount: "49.00",
  centsPerPoint: 1,
  choices: [],
  courier: null,
  windows: [
    {
      slotId: "any",
      date: "2026-10-10",
      start: "2026-10-10T01:00:00.000Z",
      end: "2026-10-10T10:00:00.000Z",
      label: "Tomorrow · Any time",
      anyTime: true,
    },
    {
      slotId: "s1",
      date: "2026-10-10",
      start: "2026-10-10T05:00:00.000Z",
      end: "2026-10-10T07:00:00.000Z",
      label: "Tomorrow, 4 pm – 6 pm",
    },
  ],
}

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<ChangeDeliveryWindowDialog orderId="o1" open onOpenChange={() => undefined} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  })
}

beforeEach(() => vi.clearAllMocks())

describe("085 — Change day or time…", () => {
  it("offers a day with no time beside the windows, and saves the one chosen with a reason", async () => {
    previewDeliveryMove.mockResolvedValue(PREVIEW)
    changeDeliveryWindow.mockResolvedValue({ orderId: "o1", promise: "day" })
    renderIt()
    expect(await screen.findByLabelText("Tomorrow, 4 pm – 6 pm")).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText("Tomorrow · Any time"))
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/^Why/), "Away until Saturday")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(changeDeliveryWindow).toHaveBeenCalledWith("o1", {
        window: { slotId: "any", date: "2026-10-10" },
        reason: "Away until Saturday",
        expectedUpdatedAt: PREVIEW.updatedAt,
      }),
    )
    expect(await screen.findByRole("status")).toHaveTextContent("Saved")
  })

  it("says so when nothing is open", async () => {
    previewDeliveryMove.mockResolvedValue({ ...PREVIEW, windows: [] })
    renderIt()
    expect(await screen.findByRole("alert")).toHaveTextContent("No day or window is open")
  })
})
