import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeliveryDaysDTO } from "@effy/shared-types";

const repo = vi.hoisted(() => ({
  getDeliveryDays: vi.fn(),
  putDeliveryDays: vi.fn(),
  addNonDeliveryDate: vi.fn(),
  removeNonDeliveryDate: vi.fn(),
}));
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), ...repo }));

const { DeliveryDaysPanel } = await import("./DeliveryDaysPanel");

const DAYS: DeliveryDaysDTO = {
  lookaheadDays: 7, noDeliveryWeekdays: [7], carrierLeadDays: 1, slotHoldMin: 10, hubTurnaroundMin: 60,
  dates: [{ day: "2026-12-25", label: "Christmas Day", affectedOrders: 0 }],
};

function renderPanel(canManage = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<DeliveryDaysPanel canManage={canManage} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getDeliveryDays.mockResolvedValue(DAYS);
  repo.putDeliveryDays.mockResolvedValue(DAYS);
  repo.addNonDeliveryDate.mockResolvedValue({ day: "2026-11-03", label: null, affectedOrders: 0 });
  repo.removeNonDeliveryDate.mockResolvedValue(undefined);
});

describe("DeliveryDaysPanel", () => {
  it("shows the saved settings, with the closed weekday pressed", async () => {
    renderPanel();
    expect(await screen.findByLabelText(/days a customer can choose from/i)).toHaveValue("7");
    expect(screen.getByRole("button", { name: "Sun" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("2026-12-25")).toBeInTheDocument();
    expect(screen.getByText("Christmas Day")).toBeInTheDocument();
  });

  it("⚠ labels the two unmeasured timings as estimates, not facts", async () => {
    renderPanel();
    await screen.findByLabelText(/carrier lead time/i);
    expect(screen.getAllByText(/^Estimate — not yet (measured|timed)/)).toHaveLength(2);
  });

  it("saves what the form holds, weekdays toggled", async () => {
    renderPanel();
    const lookahead = await screen.findByLabelText(/days a customer can choose from/i);
    await userEvent.clear(lookahead);
    await userEvent.type(lookahead, "5");
    await userEvent.click(screen.getByRole("button", { name: "Sat" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(repo.putDeliveryDays).toHaveBeenCalledWith({
        lookaheadDays: 5, noDeliveryWeekdays: [6, 7], carrierLeadDays: 1, slotHoldMin: 10, hubTurnaroundMin: 60,
      }),
    );
    expect(await screen.findByText(/the next checkout uses these/i)).toBeInTheDocument();
  });

  it("puts a named refusal on its field in the console's own words", async () => {
    repo.putDeliveryDays.mockRejectedValue({
      kind: "unknown", status: 400, title: "Refused",
      fields: [{ field: "noDeliveryWeekdays", message: "SERVER PROSE" }],
    });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("At least one day of the week must have delivery.")).toBeInTheDocument();
    expect(screen.queryByText(/SERVER PROSE/)).not.toBeInTheDocument();
  });

  it("says to set the hub first when the settings row does not exist yet", async () => {
    repo.putDeliveryDays.mockRejectedValue({ kind: "unknown", status: 409, title: "Conflict" });
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText(/set the delivery hub on the settings tab first/i)).toBeInTheDocument();
  });

  it("⚠ closing a date says how many placed orders carry it, and that they were not changed (FR-043)", async () => {
    repo.addNonDeliveryDate.mockResolvedValue({ day: "2026-11-03", label: "Cup Day", affectedOrders: 2 });
    renderPanel();
    await userEvent.type(await screen.findByLabelText("Date"), "2026-11-03");
    await userEvent.type(screen.getByLabelText(/reason/i), "Cup Day");
    await userEvent.click(screen.getByRole("button", { name: "Close date" }));

    await waitFor(() => expect(repo.addNonDeliveryDate).toHaveBeenCalledWith({ day: "2026-11-03", label: "Cup Day" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "2 placed orders are already promised 2026-11-03. They have not been changed.",
    );
  });

  it("says nothing extra when no order is affected", async () => {
    renderPanel();
    await userEvent.type(await screen.findByLabelText("Date"), "2026-11-03");
    await userEvent.click(screen.getByRole("button", { name: "Close date" }));
    await waitFor(() => expect(repo.addNonDeliveryDate).toHaveBeenCalled());
    expect(screen.queryByText(/already promised/)).not.toBeInTheDocument();
  });

  it("reopens a date", async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(repo.removeNonDeliveryDate).toHaveBeenCalledWith("2026-12-25"));
  });

  it("a role that cannot manage delivery sees everything and can change nothing", async () => {
    renderPanel(false);
    expect(await screen.findByLabelText(/days a customer can choose from/i)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sun" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close date" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument();
  });
});
