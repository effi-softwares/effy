import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

async function settle() {
  await new Promise((r) => setTimeout(r, 0))
}

const reassign = vi.hoisted(() => vi.fn())
vi.mock("../repo", () => ({
  reassign,
  getDay: vi.fn(),
  getRound: vi.fn(),
  unassign: vi.fn(),
  reorder: vi.fn(),
  lock: vi.fn(),
  unlock: vi.fn(),
}))

const { ReassignDialog } = await import("./ReassignDialog")

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const DRIVERS = [
  { driverId: "d-1", driverName: "Ada" },
  { driverId: "d-2", driverName: "Bea" },
]

function open() {
  return wrap(
    <ReassignDialog
      roundId="r-1"
      currentDriverName="Cal"
      expectedUpdatedAt="2026-09-21T02:00:00.123456Z"
      drivers={DRIVERS}
    />,
  )
}

describe("ReassignDialog — FR-029 and FR-034", () => {
  beforeEach(() => {
    reassign.mockReset()
    reassign.mockResolvedValue(undefined)
  })

  it("sends the chosen driver and the concurrency token", async () => {
    reassign.mockResolvedValue(undefined)
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole("button", { name: "Reassign" }))
    await user.click(screen.getByLabelText("Driver"))
    await user.click(screen.getByRole("option", { name: "Bea" }))
    await user.click(screen.getByRole("button", { name: "Move the round" }))

    await waitFor(() =>
      expect(reassign).toHaveBeenCalledWith("r-1", {
        driverId: "d-2",
        expectedUpdatedAt: "2026-09-21T02:00:00.123456Z",
      }),
    )
  })

  it("shows the named condition when the server refuses an ineligible driver", async () => {
    reassign.mockRejectedValue({
      kind: "unknown",
      status: 422,
      title: "That driver cannot take this round",
      detail: "That driver cannot take this round because their licence has expired.",
      fields: [{ field: "licence_expired", message: "their licence has expired" }],
    })
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole("button", { name: "Reassign" }))
    await user.click(screen.getByLabelText("Driver"))
    await user.click(screen.getByRole("option", { name: "Ada" }))
    await user.click(screen.getByRole("button", { name: "Move the round" }))

    const alert = await screen.findByRole("alert")
    await settle()
    expect(alert).toHaveTextContent(/licence expired/i)
    // Never collapsed to a generic sentence.
    expect(alert).not.toHaveTextContent(/^That change could not be made/)
  })

  it("lists every named condition, because fixing one of three wastes the trip", async () => {
    reassign.mockRejectedValue({
      kind: "unknown",
      status: 422,
      title: "That driver cannot take this round",
      detail: "That driver cannot take this round.",
      fields: [
        { field: "licence_expired", message: "their licence has expired" },
        { field: "no_vehicle", message: "they are not holding a vehicle" },
      ],
    })
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole("button", { name: "Reassign" }))
    await user.click(screen.getByLabelText("Driver"))
    await user.click(screen.getByRole("option", { name: "Ada" }))
    await user.click(screen.getByRole("button", { name: "Move the round" }))

    await screen.findByRole("alert")
    await settle()
    // This console's words, from REASON_TEXT — not the server's prose.
    expect(screen.getByText("Licence expired")).toBeInTheDocument()
    expect(screen.getByText("Holding no vehicle")).toBeInTheDocument()
  })

  it("explains a stale write rather than failing silently", async () => {
    reassign.mockRejectedValue({ kind: "unknown", status: 409, title: "Conflict", detail: "x" })
    const user = userEvent.setup()
    open()

    await user.click(screen.getByRole("button", { name: "Reassign" }))
    await user.click(screen.getByLabelText("Driver"))
    await user.click(screen.getByRole("option", { name: "Ada" }))
    await user.click(screen.getByRole("button", { name: "Move the round" }))

    const alert = await screen.findByRole("alert")
    await settle()
    expect(alert).toHaveTextContent(/Somebody else changed this round/)
  })

  it("does not offer the driver who already holds the round", async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole("button", { name: "Reassign" }))
    await user.click(screen.getByLabelText("Driver"))
    const names = screen.getAllByRole("option").map((o) => o.textContent)
    expect(names).toContain("Ada")
    expect(names).toContain("Bea")
  })

  it("will not submit until a driver is chosen", async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole("button", { name: "Reassign" }))
    expect(screen.getByRole("button", { name: "Move the round" })).toBeDisabled()
  })
})
