import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DispatchWindowsResponse } from "@effy/shared-types";

const getWindows = vi.hoisted(() => vi.fn());
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), getWindows }));

const { WindowsByDay, roundLine } = await import("./WindowsByDay");

const DAYS = [
  { date: "2026-10-13", label: "Today", isToday: true },
  { date: "2026-10-14", label: "Wed 14 Oct", isToday: false },
];
const parcel = (over: object = {}) => ({
  packageId: "p1", orderId: "o1", orderNumber: "EFY-AAA111",
  status: { status: "at_hub", word: "At hub", driverName: null, detail: null },
  collectLate: false, coldOvernight: false, group: "Inner East", ...over,
});
const WED: DispatchWindowsResponse = {
  days: DAYS, date: "2026-10-14",
  windows: [{
    windowStart: "2026-10-14T05:00:00.000Z", windowEnd: "2026-10-14T07:00:00.000Z", label: "Wed 14 Oct, 4 pm – 6 pm", rounds: [],
    parcels: [parcel({ coldOvernight: true }), parcel({ packageId: "p2", orderNumber: "EFY-BBB222", collectLate: true, group: null, status: { status: "ready", word: "Ready", driverName: null, detail: null } })] as never,
  }],
};

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<WindowsByDay />, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
}

beforeEach(() => vi.clearAllMocks());

describe("082 — delivery windows by day", () => {
  it("opens on today, and switches to any day on sale", async () => {
    getWindows.mockImplementation(async (date: string | null) => (date ? WED : { days: DAYS, date: "2026-10-13", windows: [] }));
    renderIt();
    expect(await screen.findByText("No deliveries are booked for this day yet.")).toBeInTheDocument();
    expect(getWindows).toHaveBeenCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: "Wed 14 Oct" }));
    await waitFor(() => expect(getWindows).toHaveBeenCalledWith("2026-10-14"));
    expect(await screen.findByRole("table", { name: "Wed 14 Oct, 4 pm – 6 pm" })).toBeInTheDocument();
  });

  it("a later day's window says it is planned on the day, and flags late collections and cold goods in words", async () => {
    getWindows.mockResolvedValue(WED);
    renderIt();
    const table = await screen.findByRole("table", { name: "Wed 14 Oct, 4 pm – 6 pm" });
    expect(table).toHaveTextContent("2 parcels · Planned on the day");
    const rows = within(table).getAllByRole("row");
    expect(rows[0]).toHaveTextContent("EFY-AAA111");
    expect(rows[0]).toHaveTextContent("At hub");
    expect(rows[0]).toHaveTextContent("Needs cold storage");
    expect(rows[1]).toHaveTextContent("Late for its run");
    expect(rows[1]).toHaveTextContent("No area");
    // No dispatch screen says the old words.
    expect(document.body.textContent).not.toMatch(/same[- ]day|standard/i);
  });

  it("names who has a window's round once it exists", () => {
    const w = { ...WED.windows[0]!, rounds: [{ roundId: "r1", driver: { id: "d1", name: "Dana" }, opensAt: null, parcels: 2 }] };
    expect(roundLine(w, true)).toBe("Dana (2)");
    expect(roundLine({ ...w, rounds: [] }, true)).toMatch(/auto-assign plans it/);
    expect(roundLine({ ...w, rounds: [] }, false)).toBe("Planned on the day");
  });
});
