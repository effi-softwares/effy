import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HubExpectedDTO } from "@effy/shared-types";

const getHubExpected = vi.hoisted(() => vi.fn());
const postHubCheckins = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({ getHubExpected, postHubCheckins }));

const { HubStationScreen } = await import("./HubStationScreen");

const expected: HubExpectedDTO = {
  runs: [{
    runId: "r1",
    driverName: "Ada",
    bags: [
      { parcelId: "b1", code: "7K3Q9M", seq: 1, of: 2, zone: "frozen", orderNumber: "EFY-ESDPKF", checkedIn: true, sort: { kind: "load_now", label: "LOAD NOW · Today 4–6 pm" } },
      { parcelId: "b2", code: "WTMZHX", seq: 2, of: 2, zone: "ambient", orderNumber: "EFY-ESDPKF", checkedIn: false, sort: { kind: "load_now", label: "LOAD NOW · Today 4–6 pm" } },
    ],
  }],
};

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<HubStationScreen />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  getHubExpected.mockResolvedValue(expected);
});

describe("Hub station (096 US5)", () => {
  it("lists each run's bags, where each goes, and how many are in", async () => {
    show();
    expect(await screen.findByText("Ada's collection run")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 bags checked in")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Ada's bags" })).toHaveTextContent("WTMZHX");
    expect(screen.getByText(/1 bag on the way in/)).toBeInTheDocument();
  });

  it("checks a typed code in and says where it goes in large type", async () => {
    postHubCheckins.mockResolvedValue({
      results: [{ clientReadId: "x", outcome: "accepted", words: "Bag 2 of 2", code: "WTMZHX", orderNumber: "EFY-ESDPKF", zone: "ambient", sort: { kind: "load_now", label: "LOAD NOW · Today 4–6 pm" }, runClosed: true }],
    });
    show();
    await screen.findByText("Ada's collection run");
    await userEvent.type(screen.getByRole("textbox", { name: "Scan or type a code" }), "wtmzhx");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(postHubCheckins).toHaveBeenCalled());
    expect(postHubCheckins.mock.calls[0]![0][0]).toMatchObject({ raw: "wtmzhx", method: "typed" });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("LOAD NOW · Today 4–6 pm");
    expect(status).toHaveTextContent("Run checked in");
  });

  it("says a refusal in the scan rule's words", async () => {
    postHubCheckins.mockResolvedValue({ results: [{ clientReadId: "x", outcome: "not_on_this_work", words: "Not expected here", code: "22222X", runClosed: false }] });
    show();
    await screen.findByText("Ada's collection run");
    await userEvent.type(screen.getByRole("textbox", { name: "Scan or type a code" }), "22222X");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Not expected here")).toBeInTheDocument();
  });
});
