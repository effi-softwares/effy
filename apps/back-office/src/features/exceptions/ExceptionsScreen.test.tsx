import { screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DeliveryExceptionDTO, DeliveryExceptionListDTO } from "@effy/shared-types"

import { onePage, renderList } from "@/test/renderList"

const fetchBoard = vi.hoisted(() => vi.fn())
const roles = vi.hoisted(() => ({ current: [] as string[] }))

vi.mock("./repo", () => ({ fetchExceptionsBoard: fetchBoard, listExceptions: vi.fn() }))
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.current }))

const { ExceptionsScreen } = await import("./ExceptionsScreen")

function failure(over: Partial<DeliveryExceptionDTO> = {}): DeliveryExceptionDTO {
  return {
    exceptionId: "x-1",
    stopId: "s-1",
    orderNumber: "EF-1001",
    reason: "nobody_home",
    note: null,
    driverId: "d-1",
    driverName: "Sam",
    destinationSuburb: "Newtown",
    failedAt: "2026-10-28T01:00:00.000Z",
    resolvedAt: null,
    packageLocation: "at_hub",
    roundId: "r-1",
    returnedAt: null,
    ...over,
  }
}

function board(items: DeliveryExceptionDTO[], over: Partial<DeliveryExceptionListDTO> = {}) {
  const dto: DeliveryExceptionListDTO = { exceptions: onePage(items), openCount: items.length, held: [], overdue: [], vehicleChecks: [], ...over }
  return { ...dto.exceptions, board: dto }
}

beforeEach(() => {
  vi.clearAllMocks()
  roles.current = ["admin"]
  fetchBoard.mockResolvedValue(board([failure()]))
})

describe("ExceptionsScreen — failed deliveries (103)", () => {
  it("lists a failure with its order, driver and suburb", async () => {
    renderList(ExceptionsScreen, "/exceptions")
    expect(await screen.findByText("EF-1001")).toBeInTheDocument()
    expect(screen.getByText("Sam")).toBeInTheDocument()
    expect(screen.getByText("Newtown")).toBeInTheDocument()
  })

  it("asks the server for the open view by default, newest first", async () => {
    renderList(ExceptionsScreen, "/exceptions")
    await screen.findByText("EF-1001")
    const qs = fetchBoard.mock.calls[0]![0] as URLSearchParams
    expect(qs.get("view")).toBeNull()
    expect(qs.get("page")).toBe("1")
  })

  it("carries the view and search in the address to the server", async () => {
    renderList(ExceptionsScreen, "/exceptions?view=resolved&q=newtown")
    await waitFor(() => expect(fetchBoard).toHaveBeenCalled())
    const qs = fetchBoard.mock.calls[0]![0] as URLSearchParams
    expect(qs.get("view")).toBe("resolved")
    expect(qs.get("q")).toBe("newtown")
  })
})
