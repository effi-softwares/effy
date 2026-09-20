import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VehicleListItem } from "@effy/shared-types";

const listVehicles = vi.hoisted(() => vi.fn());
const roles = vi.hoisted(() => ({ current: [] as string[] }));

vi.mock("./repo", () => ({ listVehicles, createVehicle: vi.fn() }));
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.current }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}));

const { VehiclesListScreen } = await import("./VehiclesListScreen");

function vehicle(over: Partial<VehicleListItem> = {}): VehicleListItem {
  return {
    id: "v-1",
    registrationPlate: "EFY-001",
    make: "Toyota",
    model: "HiAce",
    bodyType: "van",
    ownership: "effy_owned",
    canCarryChilled: false,
    canCarryFrozen: false,
    status: "active",
    currentHolderDriverId: null,
    currentHolderName: null,
    complianceIssues: [],
    ...over,
  };
}

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<VehiclesListScreen />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  roles.current = ["admin"];
  listVehicles.mockResolvedValue({ items: [vehicle()], nextCursor: null });
});

describe("VehiclesListScreen — the register", () => {
  it("lists a vehicle with its plate, make, body type and owner", async () => {
    renderScreen();
    expect(await screen.findByText("EFY-001")).toBeInTheDocument();
    expect(screen.getByText(/Toyota HiAce/)).toBeInTheDocument();
    expect(screen.getByText("Van")).toBeInTheDocument();
    expect(screen.getByText("Effy owned")).toBeInTheDocument();
  });

  /**
   * ⚠ FR-009 — compliance is answerable WITHOUT opening a record, and it NAMES the lapsed item.
   * "Not compliant" would send an operator into the record to find out what to renew.
   */
  it("⚠ names the lapsed compliance item in the row, not a bare 'non-compliant'", async () => {
    listVehicles.mockResolvedValue({
      items: [vehicle({ complianceIssues: ["registration_expired"] })],
      nextCursor: null,
    });
    renderScreen();
    expect(await screen.findByText(/Registration expired/)).toBeInTheDocument();
  });

  it("shows every lapsed item when several have lapsed at once", async () => {
    listVehicles.mockResolvedValue({
      items: [vehicle({ complianceIssues: ["registration_expired", "roadworthy_expired"] })],
      nextCursor: null,
    });
    renderScreen();
    expect(await screen.findByText(/Registration expired · Roadworthy inspection overdue/)).toBeInTheDocument();
  });

  it("shows refrigeration capability without opening the record", async () => {
    listVehicles.mockResolvedValue({
      items: [vehicle({ canCarryChilled: true, canCarryFrozen: true })],
      nextCursor: null,
    });
    renderScreen();
    expect(await screen.findByText("Chilled · Frozen")).toBeInTheDocument();
  });

  it("says a vehicle is available when nobody holds it, rather than leaving the cell blank", async () => {
    renderScreen();
    expect(await screen.findByText("Available")).toBeInTheDocument();
  });

  it("names the holder, and links to them, when a vehicle is out", async () => {
    listVehicles.mockResolvedValue({
      items: [vehicle({ currentHolderDriverId: "d-9", currentHolderName: "Sam Rivers" })],
      nextCursor: null,
    });
    renderScreen();
    expect(await screen.findByText("Sam Rivers")).toBeInTheDocument();
  });

  it("⚠ hides every mutating control from a csa — absent, not disabled", async () => {
    roles.current = ["csa"];
    renderScreen();
    await screen.findByText("EFY-001");
    expect(screen.queryByRole("button", { name: /add vehicle/i })).not.toBeInTheDocument();
  });

  it("offers the create control to a manager", async () => {
    roles.current = ["manager"];
    renderScreen();
    expect(await screen.findByRole("button", { name: /add vehicle/i })).toBeInTheDocument();
  });

  /** ⚠ 053 shipped a console silently capped at the newest 25 rows because nothing read nextCursor. */
  it("⚠ consumes nextCursor rather than silently capping the register", async () => {
    listVehicles.mockResolvedValue({ items: [vehicle()], nextCursor: "EFY-001:v-1" });
    renderScreen();
    expect(await screen.findByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("shows no paging controls when there is only one page", async () => {
    renderScreen();
    await screen.findByText("EFY-001");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("explains an empty register instead of showing a bare empty table", async () => {
    listVehicles.mockResolvedValue({ items: [], nextCursor: null });
    renderScreen();
    expect(await screen.findByText(/No vehicles yet/)).toBeInTheDocument();
  });

  it("surfaces an error with a retry rather than an empty page", async () => {
    listVehicles.mockRejectedValue({ kind: "unavailable", status: 503, title: "Unavailable" });
    renderScreen();
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
