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
  zoneId: "z-1",
  zone: "Inner North",
  hub: "Effy Hub",
  vehicle: { type: null, plate: null },
  credentials: {
    licenceReference: null,
    licenceExpiresOn: null,
    vehicleRegistrationExpiresOn: null,
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

  it("⚠ FR-020 — the held-work refusal ITEMISES what is held, not just that something is", async () => {
    const user = userEvent.setup();
    setDriverStatus.mockRejectedValue({
      kind: "conflict",
      status: 409,
      title: "Conflict",
      detail: "Sam Rivers is holding 2 item(s) of work… Affected orders: EFY-AAA111, EFY-BBB222.",
      fields: [
        { field: "collection:ct-1", message: "collected — order EFY-AAA111 (Shop One)" },
        { field: "delivery:dt-1", message: "out_for_delivery — order EFY-BBB222 (Carlton)" },
      ],
    });

    renderControl();
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    await user.type(screen.getByLabelText("Reason"), "on leave");
    await user.click(screen.getAllByRole("button", { name: "Suspend" }).at(-1)!);

    // ⚠ TWO separate places, and both matter. The sentence names the affected ORDERS so the operator
    // knows the scale; the list names each held ITEM so they can go and deal with them. An earlier
    // draft of this assertion was ambiguous precisely because both were present — which is the
    // behaviour being asserted, so it is now asserted per element.
    await screen.findByText(/is holding 2 item\(s\)/);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("EFY-AAA111");
    expect(items[0]).toContain("collected");
    expect(items[1]).toContain("EFY-BBB222");
    expect(items[1]).toContain("out_for_delivery");
    expect(screen.getByText(/leave this work stranded/)).toBeInTheDocument();
  });

  it("⚠ the confirm after a warning is a DIFFERENT button, not the same one clicked twice", async () => {
    // Re-pressing an unchanged control is a reflex; pressing one whose label names the consequence
    // is a decision.
    const user = userEvent.setup();
    setDriverStatus.mockRejectedValue({
      kind: "conflict",
      status: 409,
      title: "Conflict",
      detail: "holding work",
      fields: [{ field: "collection:ct-1", message: "collected — order EFY-AAA111" }],
    });

    renderControl();
    await user.click(screen.getByRole("button", { name: "Suspend" }));
    await user.type(screen.getByLabelText("Reason"), "on leave");
    await user.click(screen.getAllByRole("button", { name: "Suspend" }).at(-1)!);

    const escalated = await screen.findByRole("button", { name: /Suspend and strand the work/ });
    expect(escalated).toBeInTheDocument();

    setDriverStatus.mockResolvedValue({ ...DRIVER, status: "suspended" });
    await user.click(escalated);
    await waitFor(() =>
      expect(setDriverStatus).toHaveBeenLastCalledWith("d-1", {
        status: "suspended",
        reason: "on leave",
        acknowledgeHeldWork: true,
      }),
    );
  });

  it("does not acknowledge held work on the first attempt", async () => {
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
        acknowledgeHeldWork: false,
      }),
    );
  });
});
