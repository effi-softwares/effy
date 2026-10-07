import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const driversFor = vi.hoisted(() => vi.fn());
const assignTo = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({ driversFor, assignTo, unassign: vi.fn() }));
vi.mock("@effy/design-system/ui", async (orig) => ({ ...(await orig<object>()), toast }));

const { AssignSheet } = await import("./AssignSheet");

const DRIVERS = [
  { driverId: "d1", name: "Ada", packagesToday: 2, fit: "fine", notes: [] },
  { driverId: "d2", name: "Ben", packagesToday: 0, fit: "concern", notes: ["Not cleared for this area"] },
  { driverId: "d3", name: "Cara", packagesToday: 1, fit: "cannot", notes: ["Off duty"] },
];

function renderSheet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const onOpenChange = vi.fn();
  render(
    <AssignSheet open onOpenChange={onOpenChange} packageId="p1" stage="collection" expectedAssignmentId={null} title="EFY-1" />,
    { wrapper },
  );
  return { onOpenChange };
}

beforeEach(() => {
  driversFor.mockReset().mockResolvedValue(DRIVERS);
  assignTo.mockReset();
  toast.mockReset();
});

describe("Assign to… (073)", () => {
  it("groups drivers, says why for each concern, and greys out those who can't take it", async () => {
    renderSheet();
    expect(await screen.findByRole("region", { name: "Can take it" })).toBeInTheDocument();
    expect(screen.getByText("Not cleared for this area")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cara/ })).toBeDisabled();
  });

  it("assigns a fine driver and says so in one line", async () => {
    assignTo.mockResolvedValue({ message: "Assigned to Ada" });
    const { onOpenChange } = renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: /Ada/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Assigned to Ada"));
    expect(assignTo).toHaveBeenCalledWith("p1", { stage: "collection", driverId: "d1", expectedAssignmentId: null, acceptConcerns: false });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks once before accepting a concern", async () => {
    assignTo
      .mockRejectedValueOnce({ kind: "unknown", status: 409, title: "", type: "needs_confirm", detail: "Not cleared for this area. Assign anyway?" })
      .mockResolvedValueOnce({ message: "Assigned to Ben" });
    renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: /Ben/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Assign anyway" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Assigned to Ben"));
    expect(assignTo).toHaveBeenLastCalledWith("p1", expect.objectContaining({ driverId: "d2", acceptConcerns: true }));
  });

  it("shows a refusal as the one line the server wrote", async () => {
    assignTo.mockRejectedValue({ kind: "unknown", status: 409, title: "", type: "changed", detail: "This changed a moment ago — showing the latest." });
    renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: /Ada/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("This changed a moment ago — showing the latest."));
  });
});
