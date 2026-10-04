import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HandoverRowDTO } from "@effy/shared-types";

const listHandovers = vi.hoisted(() => vi.fn());
vi.mock("./repo", async () => ({ ...(await vi.importActual<object>("./repo")), listHandovers }));
// The order link needs a router; the list's behaviour does not.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: ReactNode; params: { orderId: string } }) => (
    <a href={`/orders/${params.orderId}`}>{children}</a>
  ),
}));

const { HandoverListScreen } = await import("./HandoverListScreen");

const row = (over: Partial<HandoverRowDTO> = {}): HandoverRowDTO => ({
  fulfillmentId: "f1", orderId: "o1", orderNumber: "EFY-0001",
  promisedDate: "2026-10-08", handoverDueOn: "2026-10-07", atRisk: false, atHub: true,
  ...over,
});

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<HandoverListScreen />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  listHandovers.mockImplementation(async (due: string) =>
    due === "today" ? [row()] : due === "overdue" ? [row({ fulfillmentId: "f2", orderId: "o2", orderNumber: "EFY-0002", atRisk: true, atHub: false })] : [],
  );
});

describe("HandoverListScreen (069 US7)", () => {
  it("opens on what is due today, with the customer's day and the day it must leave", async () => {
    renderScreen();
    const r = (await screen.findByText("EFY-0001")).closest("tr")!;
    expect(listHandovers).toHaveBeenCalledWith("today");
    expect(within(r).getByText("Thu 8 Oct")).toBeInTheDocument();
    expect(within(r).getByText("Wed 7 Oct")).toBeInTheDocument();
    expect(within(r).getByText("At the hub")).toBeInTheDocument();
    expect(within(r).queryByText(/at risk/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "EFY-0001" })).toHaveAttribute("href", "/orders/o1");
  });

  it("⚠ the overdue tab says AT RISK in words, and says when a package has not reached the hub", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("tab", { name: "Overdue" }));
    const r = (await screen.findByText("EFY-0002")).closest("tr")!;
    await waitFor(() => expect(listHandovers).toHaveBeenCalledWith("overdue"));
    expect(within(r).getByText("At risk of missing its day")).toBeInTheDocument();
    expect(within(r).getByText("Not at the hub yet")).toBeInTheDocument();
  });

  it("says so plainly when a tab is empty", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("tab", { name: "Upcoming" }));
    expect(await screen.findByText("Nothing is waiting for a later day.")).toBeInTheDocument();
  });

  it("offers no way to record a handover here — that is done on the order, by admin or manager", async () => {
    renderScreen();
    await screen.findByText("EFY-0001");
    expect(screen.queryByRole("button", { name: /record|hand/i })).not.toBeInTheDocument();
  });

  it("has no metric tiles above the table (Principle V)", async () => {
    const { container } = renderScreen();
    await screen.findByText("EFY-0001");
    expect(container.querySelectorAll("table")).toHaveLength(1);
    expect(screen.queryByText(/^\d+ (overdue|due)/i)).not.toBeInTheDocument();
  });
});
