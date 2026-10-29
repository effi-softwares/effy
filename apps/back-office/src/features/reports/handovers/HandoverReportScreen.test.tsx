import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import type { HandoverReportDTO } from "@effy/shared-types"

/** Every loading shape has gone — a skeleton writes the page's real titles, so a title alone does not mean loaded. */
const loaded = () => waitFor(() => expect(screen.queryAllByRole("status", { busy: true })).toHaveLength(0))

const getHandoverReport = vi.hoisted(() => vi.fn())
vi.mock("./repo", () => ({ getHandoverReport }))

const { HandoverReportScreen } = await import("./HandoverReportScreen")

const report: HandoverReportDTO = {
  from: "2026-10-16",
  to: "2026-10-22",
  overall: { scan: 6, typed: 2, manual: 2 },
  byShop: [{ shopId: "s1", shopName: "Green Grocer", scan: 1, typed: 1, manual: 2 }],
  byDriver: [{ driverId: "d1", driverName: "Ada", scan: 5, typed: 1, manual: 0 }],
  byActor: [{ actor: "admin_staff", scan: 2, typed: 0, manual: 0 }],
  refused: [{ outcome: "belongs_elsewhere", surface: "driver_app", count: 3 }],
  missing: [{ reason: "not_in_van", count: 1 }],
  exceptions: 4,
  exceptionsPer1000: 400,
  disagreements: 1,
}

describe("Hand-over report (096 US6)", () => {
  it("shows the mix, the rate as a row, and each table — no metric cards", async () => {
    getHandoverReport.mockResolvedValue(report)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    render(<HandoverReportScreen />, { wrapper })
    await loaded()
    expect(screen.getByText("Exceptions per 1,000 hand-overs")).toBeInTheDocument()
    expect(screen.getByText("400")).toBeInTheDocument()
    expect(screen.getByRole("table", { name: "By shop" })).toHaveTextContent("Green Grocer")
    expect(screen.getByRole("table", { name: "By shop" })).toHaveTextContent("25%")
    expect(screen.getByRole("table", { name: "By who handed over" })).toHaveTextContent("Hub staff")
    expect(screen.getByRole("table", { name: "Refused reads" })).toHaveTextContent("Not here")
    expect(screen.getByRole("table", { name: "Bags declared missing" })).toHaveTextContent("1")
  })
})
