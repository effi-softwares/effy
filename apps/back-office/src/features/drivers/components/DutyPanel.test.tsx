import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

const getDuty = vi.hoisted(() => vi.fn())

vi.mock("../repo", () => ({ getDuty, endDutySession: vi.fn() }))
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => ["admin"] }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}))

const { DutyPanel } = await import("./DutyPanel")

function onDuty(over: Record<string, unknown> = {}) {
  return {
    driverId: "d-1",
    driverName: "Sam Rivers",
    zone: "Inner North",
    sessionId: "s-1",
    onDutySince: new Date(Date.now() - 3600_000).toISOString(),
    expectedEndAt: null,
    pastExpectedEnd: false,
    overdue: false,
    ...over,
  }
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<DutyPanel />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  })
}

describe("DutyPanel — an unknown finish time is SAID, never invented", () => {
  it("⚠ renders 'unknown' when the driver did not say, and shows no time at all", async () => {
    getDuty.mockResolvedValue({
      onDuty: [onDuty({ expectedEndAt: null })],
      unassigned: { readyToCollect: 0, readyToDeliver: 0, driversOnDuty: 1 },
    })
    renderPanel()

    expect(await screen.findByText(/Finish time unknown/)).toBeInTheDocument()
    expect(screen.queryByText(/Expects to finish/)).not.toBeInTheDocument()
  })

  it("renders the time in Melbourne when the driver did say", async () => {
    getDuty.mockResolvedValue({
      onDuty: [onDuty({ expectedEndAt: "2026-09-20T08:30:00.000Z" })],
      unassigned: { readyToCollect: 0, readyToDeliver: 0, driversOnDuty: 1 },
    })
    renderPanel()

    expect(await screen.findByText(/Expects to finish 6:30/)).toBeInTheDocument()
    expect(screen.queryByText(/Finish time unknown/)).not.toBeInTheDocument()
  })

  it("⚠ an unstated finish time is NOT an overrun — absence is not lateness", async () => {
    getDuty.mockResolvedValue({
      onDuty: [onDuty({ expectedEndAt: null, pastExpectedEnd: false })],
      unassigned: { readyToCollect: 0, readyToDeliver: 0, driversOnDuty: 1 },
    })
    renderPanel()

    await screen.findByText(/Finish time unknown/)
    expect(screen.queryByText(/Past their expected finish/)).not.toBeInTheDocument()
  })

  it("shows the overrun when an expected finish has actually passed", async () => {
    getDuty.mockResolvedValue({
      onDuty: [onDuty({ expectedEndAt: "2020-01-01T00:00:00.000Z", pastExpectedEnd: true })],
      unassigned: { readyToCollect: 0, readyToDeliver: 0, driversOnDuty: 1 },
    })
    renderPanel()

    expect(await screen.findByText(/Past their expected finish/)).toBeInTheDocument()
  })
})
