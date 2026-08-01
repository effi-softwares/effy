import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const repo = vi.hoisted(() => ({
  listDeclarations: vi.fn(),
  getDeclaration: vi.fn(),
  decideDeclaration: vi.fn(),
}));
vi.mock("./repo", () => repo);

import { ApprovalQueueScreen, formatKm } from "./ApprovalQueueScreen";

/**
 * ⚠ THE FIXTURE IS THE DEFECT THIS FEATURE EXISTS FOR.
 *
 * A shop in BENDIGO (3550) asking to serve BALLARAT (3350). 031's guard permitted exactly this,
 * because both postcodes sit in zone REGIONAL — 98 km apart, essentially as far as Melbourne. The
 * check said "a shop is nearby" and carried no information at all.
 */
const BENDIGO_TO_BALLARAT = {
  id: "d1",
  shopId: "s1",
  shopName: "Effy SHOP TWO",
  shopPostcode: "3550",
  offersSameday: true,
  cutoffTime: "14:00",
  status: "pending",
  submittedBy: "shop-sub",
  submittedAt: "2026-08-01T00:00:00.000Z",
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  areas: [
    { postcode: "3550", places: ["Bendigo"], localityCount: 12, straightLineKm: 2.1 },
    { postcode: "3350", places: ["Ballarat", "Alfredton"], localityCount: 20, straightLineKm: 98.4 },
  ],
  furthestKm: 98.4,
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApprovalQueueScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  repo.listDeclarations.mockResolvedValue([BENDIGO_TO_BALLARAT]);
  repo.decideDeclaration.mockResolvedValue(BENDIGO_TO_BALLARAT);
});

describe("ApprovalQueueScreen", () => {
  it("defaults to what is awaiting a decision", async () => {
    renderScreen();
    await waitFor(() => expect(repo.listDeclarations).toHaveBeenCalledWith("pending"));
  });

  it("says so plainly when nothing is waiting", async () => {
    repo.listDeclarations.mockResolvedValue([]);
    renderScreen();
    expect((await screen.findByTestId("queue-empty")).textContent).toMatch(/Nothing is waiting/i);
  });

  // ⚠ SC-008. The whole feature turns on this number reaching a human, with its unit and with an
  // honest label.
  it("shows the furthest requested area as 98.4 km, labelled straight-line", async () => {
    renderScreen();
    const cell = await screen.findByTestId("furthest-d1");
    expect(cell.textContent).toBe("98.4 km");
    expect(screen.getByTestId("queue-table").textContent).toMatch(/straight-line/i);
  });

  it("shows every requested area with its own distance", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("queue-row-d1")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /review/i }));

    expect((await screen.findByTestId("area-km-3350")).textContent).toBe("98.4 km");
    expect(screen.getByTestId("area-km-3550").textContent).toBe("2.1 km");
  });

  // ⚠ An area IS a postcode. Approving 3350 approves all twenty Ballarat localities, and the admin
  // has to be told before they do it.
  it("discloses how many places each area covers", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("queue-row-d1")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /review/i }));
    expect((await screen.findByTestId("area-3350")).textContent).toMatch(/20 places/);
  });

  // ⚠ NULL IS NOT ZERO. A blank cell or "0 km" would be the most reassuring rendering of the least
  // information, on the one screen whose purpose is to say how far away something is.
  it("renders an unknown distance as its own text, never as 0 or blank", async () => {
    repo.listDeclarations.mockResolvedValue([
      {
        ...BENDIGO_TO_BALLARAT,
        furthestKm: null,
        areas: [{ postcode: "0872", places: [], localityCount: 41, straightLineKm: null }],
      },
    ]);
    renderScreen();
    const cell = await screen.findByTestId("furthest-d1");
    expect(cell.textContent).toBe("no location on record");
    expect(cell.textContent).not.toMatch(/^0/);
    expect(cell.textContent?.trim()).not.toBe("");
  });

  // ⚠ FR-024 — the shop must be able to read WHY. A decline with no reason leaves them to resubmit
  // the same thing or quietly stop asking.
  it("will not let an admin decline without a reason", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("queue-row-d1")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /review/i }));

    expect(await screen.findByRole("button", { name: /decline/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/reason/i), "Ballarat is 98 km away.");
    expect(screen.getByRole("button", { name: /decline/i })).toBeEnabled();
  });

  it("declines with the reason the admin typed", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("queue-row-d1")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /review/i }));
    await userEvent.type(await screen.findByLabelText(/reason/i), "Ballarat is 98 km away.");
    await userEvent.click(screen.getByRole("button", { name: /decline/i }));

    expect(repo.decideDeclaration).toHaveBeenCalledWith("d1", "decline", { note: "Ballarat is 98 km away." });
  });

  it("approves without requiring a reason", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("queue-row-d1")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /review/i }));
    await userEvent.click(await screen.findByRole("button", { name: /approve/i }));
    expect(repo.decideDeclaration).toHaveBeenCalledWith("d1", "approve", { note: null });
  });

  // ⚠ Withdrawing takes away something the shop already HAD — a different action from declining a
  // request, and offered only on something in force.
  it("offers withdrawal only on an approved declaration, and requires a reason", async () => {
    repo.listDeclarations.mockResolvedValue([{ ...BENDIGO_TO_BALLARAT, status: "approved" }]);
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("queue-row-d1")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /review/i }));

    expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument();
    const withdraw = await screen.findByRole("button", { name: /withdraw same-day/i });
    expect(withdraw).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/reason/i), "Van off the road.");
    await userEvent.click(screen.getByRole("button", { name: /withdraw same-day/i }));
    expect(repo.decideDeclaration).toHaveBeenCalledWith("d1", "revoke", { note: "Van off the road." });
  });
});

describe("formatKm", () => {
  it("renders a number with its unit", () => {
    expect(formatKm(98.4)).toBe("98.4 km");
    expect(formatKm(0)).toBe("0 km");
  });

  // ⚠ The distinction the whole screen rests on: 0 km is a measurement, null is an absence.
  it("renders null as an absence, not a measurement", () => {
    expect(formatKm(null)).toBe("no location on record");
    expect(formatKm(null)).not.toMatch(/km/);
  });
});
