import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HandoverRowDTO } from "@effy/shared-types";

const listCourierParcels = vi.hoisted(() => vi.fn());
vi.mock("./repo", async () => ({ ...(await vi.importActual<object>("./repo")), listCourierParcels }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params, to }: { children: ReactNode; params?: { orderId: string }; to: string }) => (
    <a href={params ? `/orders/${params.orderId}` : to}>{children}</a>
  ),
}));

const { CourierScreen } = await import("./CourierScreen");

const row = (over: Partial<HandoverRowDTO> = {}): HandoverRowDTO => ({
  fulfillmentId: "f1", orderId: "o1", orderNumber: "EFY-0001", promisedDate: null, handoverDueOn: "2026-10-09",
  atRisk: false, atHub: true, service: "Test Courier · Parcel", dueOut: "2026-10-09T14:00:00+11:00", collection: "hub",
  consignmentState: null, pickup: null, problem: null, ...over,
});

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<CourierScreen />, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
}

beforeEach(() => {
  vi.clearAllMocks();
  listCourierParcels.mockImplementation(async (view: string) =>
    view === "hub_due" ? [row()]
    : view === "hub_late" ? [row({ orderId: "o2", orderNumber: "EFY-0002", atRisk: true })]
    : view === "supplier" ? [row({ orderId: "o3", orderNumber: "EFY-0003", collection: "supplier", atHub: false, dueOut: null, pickup: { date: "2026-10-12", from: "13:00", to: "15:00" }, consignmentState: "booked" })]
    : view === "problems" ? [row({ orderId: "o4", orderNumber: "EFY-0004", consignmentState: "lost", problem: "lost" })]
    : [],
  );
});

describe("080 — the Courier tab", () => {
  it("opens on the hub: the service and when it is due out", async () => {
    renderScreen();
    const r = (await screen.findByText("EFY-0001")).closest("tr")!;
    expect(listCourierParcels).toHaveBeenCalledWith("hub_due");
    expect(within(r).getByText("Test Courier · Parcel")).toBeInTheDocument();
    expect(within(r).getByText(/Fri, 9 Oct, 2:00/)).toBeInTheDocument();
    expect(within(r).getByText("At the hub")).toBeInTheDocument();
    expect(within(r).queryByText("Late")).not.toBeInTheDocument();
  });

  it("late says so in words; supplier pickups show the booked window; problems show where it is", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("tab", { name: "Late at the hub" }));
    expect(within((await screen.findByText("EFY-0002")).closest("tr")!).getByText("Late")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Supplier pickups" }));
    const s = (await screen.findByText("EFY-0003")).closest("tr")!;
    expect(within(s).getByText("Pickup 2026-10-12, 13:00–15:00")).toBeInTheDocument();
    expect(within(s).getByText("Booked")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Problems" }));
    expect(within((await screen.findByText("EFY-0004")).closest("tr")!).getByText("Lost")).toBeInTheDocument();
  });

  it("an empty view says what it means", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("tab", { name: "With the courier" }));
    await waitFor(() => expect(screen.getByText("Nothing is with a courier right now.")).toBeInTheDocument());
  });
});
