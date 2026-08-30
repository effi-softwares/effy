import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminDriverListItem } from "@effy/shared-types";

const listDrivers = vi.hoisted(() => vi.fn());
const listExceptions = vi.hoisted(() => vi.fn());
const listZones = vi.hoisted(() => vi.fn());
const getDuty = vi.hoisted(() => vi.fn());
const getStranded = vi.hoisted(() => vi.fn());
const roles = vi.hoisted(() => ({ current: [] as string[] }));

vi.mock("./repo", () => ({
  listDrivers,
  listExceptions,
  listZones,
  getDuty,
  getStranded,
  createDriver: vi.fn(),
  releaseStranded: vi.fn(),
  endDutySession: vi.fn(),
}));

vi.mock("@/features/auth/useSessionRoles", () => ({
  useSessionRoles: () => roles.current,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}));

const { DriversListScreen } = await import("./DriversListScreen");

function driver(over: Partial<AdminDriverListItem> = {}): AdminDriverListItem {
  return {
    id: "d-1",
    name: "Sam Rivers",
    workEmail: "sam@effyshopping.com",
    zone: "Inner North",
    zoneId: "z-1",
    dutyState: "off_duty",
    status: "active",
    blockedReasons: [],
    ...over,
  };
}

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<DriversListScreen />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  roles.current = ["admin"];
  listDrivers.mockResolvedValue({ items: [driver()], nextCursor: null });
  listExceptions.mockResolvedValue({ items: [], nextCursor: null, outstandingCount: 0 });
  listZones.mockResolvedValue([{ id: "z-1", name: "Inner North" }]);
  getDuty.mockResolvedValue({
    onDuty: [],
    unassigned: { readyToCollect: 0, readyToDeliver: 0, driversOnDuty: 0 },
  });
  getStranded.mockResolvedValue({ items: [] });
});

describe("DriversListScreen — the register", () => {
  it("lists drivers with their zone, duty state and employment status", async () => {
    renderScreen();
    expect(await screen.findByText("Sam Rivers")).toBeInTheDocument();
    expect(screen.getByText("sam@effyshopping.com")).toBeInTheDocument();
    expect(screen.getByText("Inner North")).toBeInTheDocument();
    expect(screen.getByText("Off duty")).toBeInTheDocument();
  });

  it("⚠ SC-009 — a driver with no zone says so on the register, before an order is affected", async () => {
    listDrivers.mockResolvedValue({
      items: [driver({ zone: null, zoneId: null, blockedReasons: ["no_zone"] })],
      nextCursor: null,
    });
    renderScreen();
    expect(
      await screen.findByText(/No delivery zone — cannot be given work/),
    ).toBeInTheDocument();
  });

  it("⚠ FR-032 — the outstanding-report count is a sentence that leads somewhere, not a tile", async () => {
    listExceptions.mockResolvedValue({ items: [], nextCursor: null, outstandingCount: 3 });
    renderScreen();
    expect(await screen.findByText(/unresolved reports from the road/)).toBeInTheDocument();
    expect(screen.getByText("Review them")).toBeInTheDocument();
  });

  it("stays quiet when nothing is outstanding — a permanent '0' trains people to skip the row", async () => {
    renderScreen();
    await screen.findByText("Sam Rivers");
    expect(screen.queryByText(/unresolved/)).not.toBeInTheDocument();
  });

  it("explains the empty register instead of showing a bare empty table", async () => {
    listDrivers.mockResolvedValue({ items: [], nextCursor: null });
    renderScreen();
    expect(await screen.findByText(/No drivers yet/)).toBeInTheDocument();
  });

  it("surfaces an error with a retry rather than an empty page", async () => {
    listDrivers.mockRejectedValue({ kind: "unavailable", status: 503, title: "Unavailable" });
    renderScreen();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());
  });

  it("⚠ hides every mutating control from a csa — absent, not disabled", async () => {
    roles.current = ["csa"];
    renderScreen();
    await screen.findByText("Sam Rivers");
    expect(screen.queryByRole("button", { name: /add driver/i })).not.toBeInTheDocument();
  });

  it("offers the create control to a manager", async () => {
    roles.current = ["manager"];
    renderScreen();
    expect(await screen.findByRole("button", { name: /add driver/i })).toBeInTheDocument();
  });

  it("⚠ consumes nextCursor — 053 shipped a console silently capped at 25 rows", async () => {
    listDrivers.mockResolvedValue({ items: [driver()], nextCursor: "cursor-2" });
    renderScreen();
    const next = await screen.findByRole("button", { name: "Next" });
    expect(next).toBeEnabled();
  });

  it("shows no paging controls when there is only one page", async () => {
    renderScreen();
    await screen.findByText("Sam Rivers");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });
});

describe("DutyPanel — FR-036, the state that was invisible", () => {
  it("⚠ says NOBODY IS ON DUTY when work is waiting and nobody is working", async () => {
    getDuty.mockResolvedValue({
      onDuty: [],
      unassigned: { readyToCollect: 12, readyToDeliver: 0, driversOnDuty: 0 },
    });
    renderScreen();
    expect(await screen.findByText(/Nobody is on duty/)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("reports waiting work plainly when somebody IS on duty", async () => {
    getDuty.mockResolvedValue({
      onDuty: [
        {
          driverId: "d-1",
          driverName: "Sam Rivers",
          zone: "Inner North",
          sessionId: "s-1",
          onDutySince: new Date(Date.now() - 3600_000).toISOString(),
          currentRunId: "r-1",
          currentRunType: "collection",
          completedStops: 2,
          totalStops: 5,
          nextStop: "Shop Two",
          overdue: false,
        },
      ],
      unassigned: { readyToCollect: 4, readyToDeliver: 1, driversOnDuty: 1 },
    });
    renderScreen();
    expect(await screen.findByText(/waiting to be picked up/)).toBeInTheDocument();
    expect(screen.queryByText(/Nobody is on duty/)).not.toBeInTheDocument();
    expect(screen.getByText(/Collection round/)).toBeInTheDocument();
    expect(screen.getByText(/next: Shop Two/)).toBeInTheDocument();
  });

  it("says drivers go on duty from the app, so nobody looks for a control that is not there", async () => {
    renderScreen();
    expect(await screen.findByText(/Drivers go on duty from the driver app/)).toBeInTheDocument();
  });
});

describe("StrandedWorkPanel — the state that is permanent and invisible today", () => {
  it("⚠ names the driver, the order and how long it has been stuck", async () => {
    getStranded.mockResolvedValue({
      items: [
        {
          kind: "collection",
          taskId: "ct-1",
          taskStatus: "collected",
          driverId: "d-9",
          driverName: "Departed Driver",
          driverStatus: "offboarded",
          orderId: "o-1",
          orderReference: "EFY-STRND1",
          location: "Shop One",
          since: "2026-08-29T00:00:00.000Z",
        },
      ],
    });
    renderScreen();
    expect(await screen.findByText("EFY-STRND1")).toBeInTheDocument();
    expect(screen.getByText("Departed Driver")).toBeInTheDocument();
    expect(screen.getByText(/will not come back on their own/)).toBeInTheDocument();
  });

  it("renders nothing at all when no work is stranded", async () => {
    renderScreen();
    await screen.findByText("Sam Rivers");
    expect(screen.queryByText(/Stranded work/)).not.toBeInTheDocument();
  });

  it("⚠ gives a csa no release control", async () => {
    roles.current = ["csa"];
    getStranded.mockResolvedValue({
      items: [
        {
          kind: "collection",
          taskId: "ct-1",
          taskStatus: "collected",
          driverId: "d-9",
          driverName: "Departed Driver",
          driverStatus: "offboarded",
          orderId: "o-1",
          orderReference: "EFY-STRND1",
          location: "Shop One",
          since: "2026-08-29T00:00:00.000Z",
        },
      ],
    });
    renderScreen();
    await screen.findByText("EFY-STRND1");
    expect(screen.queryByRole("button", { name: /release/i })).not.toBeInTheDocument();
  });
});
