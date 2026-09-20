import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminDriverProfile } from "@effy/shared-types";

const setDriverStatus = vi.hoisted(() => vi.fn());

vi.mock("../repo", () => ({
  setDriverStatus,
  getDriver: vi.fn(),
  listDrivers: vi.fn(),
  listZones: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/telemetry", () => ({ track: vi.fn() }));

const { StatusControl } = await import("./StatusControl");

const DRIVER: AdminDriverProfile = {
  id: "d-1",
  name: "Sam Rivers",
  workEmail: "sam@effyshopping.com",
  contactPhone: null,
  capabilities: [],
  hub: "Effy Hub",
  vehicle: { type: null, plate: null },
  credentials: {
    licenceReference: null,
    licenceExpiresOn: null,
    licenceClass: null,
  },
  emergencyContact: { name: null, phone: null },
  status: "active",
  statusReason: null,
  statusChangedAt: "2026-08-30T00:00:00.000Z",
  startedOn: null,
  notes: null,
  dutyState: "on_duty",
  blockedReasons: [],
  accountState: "ok",
  updatedAt: "2026-08-30T00:00:00.000000Z",
};

function renderControl(driver: AdminDriverProfile = DRIVER) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<StatusControl driver={driver} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StatusControl — the employment lifecycle", () => {
  it("offers suspend and offboard for an active driver, and no restore", async () => {
    renderControl();
    expect(screen.getByRole("button", { name: "Suspend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Offboard" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("offers restore for a suspended driver (FR-018)", () => {
    renderControl({ ...DRIVER, status: "suspended" });
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("⚠ offboarded is TERMINAL — no control brings them back, and the screen says why", () => {
    renderControl({ ...DRIVER, status: "offboarded" });
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    expect(screen.getByText(/permanently closed/)).toBeInTheDocument();
  });

  it("⚠ tells the truth about timing on every stand-down", async () => {
    // Two things are true at once and an operator will assume only the first. Implying a stood-down
    // driver has been cleared of their work when they have not is the exact failure this feature
    // exists to prevent.
    const user = userEvent.setup();
    renderControl();
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    expect(await screen.findByText(/lose access straight away/)).toBeInTheDocument();
    expect(screen.getByText(/goes back to the pool on the next assignment round/)).toBeInTheDocument();
    expect(screen.getByText(/already picked up stays with them/)).toBeInTheDocument();
  });

  it("requires a reason before the confirm button becomes usable (FR-016)", async () => {
    const user = userEvent.setup();
    renderControl();
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    const confirm = await screen.findByRole("button", { name: "Suspend" , hidden: false});
    // The dialog's confirm is the LAST "Suspend" — the trigger is still in the document.
    const buttons = screen.getAllByRole("button", { name: "Suspend" });
    expect(buttons[buttons.length - 1]).toBeDisabled();
    await user.type(screen.getByLabelText("Reason"), "on leave");
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Suspend" }).at(-1)).toBeEnabled(),
    );
    expect(confirm).toBeTruthy();
  });

  /**
   * ⚠ TWO CASES WERE REMOVED HERE, AND WHAT THEY PROVED IS WORTH RESTATING SO IT IS REBUILT.
   * They asserted that a stand-down refused for held work ITEMISES the affected orders rather than
   * saying only that something is held, and that going ahead takes a SECOND, DIFFERENTLY LABELLED
   * button — because re-pressing an unchanged control is a reflex, while pressing one whose label
   * names the consequence is a decision.
   *
   * Both tested a refusal the backend can no longer raise: `heldWorkFor` read `collection_task` and
   * `delivery_task`, dropped with the work model, and nothing assigns work, so nothing can be held.
   */
  it("sends the status and reason, and nothing else", async () => {
    const user = userEvent.setup();
    setDriverStatus.mockResolvedValue({ ...DRIVER, status: "suspended" });
    renderControl();
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    await user.type(screen.getByLabelText("Reason"), "on leave");
    await user.click(screen.getAllByRole("button", { name: "Suspend" }).at(-1)!);
    await waitFor(() =>
      expect(setDriverStatus).toHaveBeenCalledWith("d-1", {
        status: "suspended",
        reason: "on leave",
      }),
    );
  });
});
