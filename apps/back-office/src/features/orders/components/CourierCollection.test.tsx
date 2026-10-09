import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const changeCourierCollection = vi.hoisted(() => vi.fn());
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), changeCourierCollection }));

const { CourierCollection } = await import("./CourierCollection");

const when = (iso: string) => `@${iso.slice(11, 16)}`;
function renderIt(mode: "hub" | "supplier" | null, canChange = true, history: { from: "hub" | "supplier"; to: "hub" | "supplier"; actorSub: string; note: string | null; at: string }[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<CourierCollection order={{ id: "o1", courierCollection: mode, courierCollectionHistory: history }} canChange={canChange} formatDateTime={when} />, {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("080 US3 — how a courier order's parcels reach the courier", () => {
  it("nothing for an order Effy delivers", () => {
    renderIt(null);
    expect(screen.queryByTestId("courier-collection")).not.toBeInTheDocument();
  });

  it("says the mode, lists every change, and switches with a note", async () => {
    changeCourierCollection.mockResolvedValue({ changed: true });
    renderIt("supplier", true, [{ from: "hub", to: "supplier", actorSub: "sub-m", note: "Courier collects from Shop A", at: "2026-10-09T03:00:00Z" }]);
    expect(screen.getByTestId("courier-collection")).toHaveTextContent("Pickup from the supplier");
    expect(screen.getByRole("list", { name: /changes/ })).toHaveTextContent("@03:00 · Via the hub → Pickup from the supplier — Courier collects from Shop A");
    await userEvent.type(screen.getByLabelText("Why (optional)"), "Courier can't reach the supplier");
    await userEvent.click(screen.getByRole("button", { name: "Switch to via the hub" }));
    await waitFor(() => expect(changeCourierCollection).toHaveBeenCalledWith("o1", { mode: "hub", note: "Courier can't reach the supplier" }));
  });

  it("a refusal is said in words; a CSA sees no switch", async () => {
    changeCourierCollection.mockRejectedValue({ kind: "unknown", status: 409, title: "Refused", code: "collection_locked" });
    const { unmount } = renderIt("hub");
    await userEvent.click(screen.getByRole("button", { name: "Switch to pickup from the supplier" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already left");
    unmount();
    renderIt("hub", false);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
