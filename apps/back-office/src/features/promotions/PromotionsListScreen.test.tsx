import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BackOfficeRole } from "@effy/shared-types";

// The code column links to the detail route; without a RouterProvider a real <Link> throws. This is a
// column/controls-render test, so a plain anchor stand-in is enough.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

// A mutable role set drives the session mock so a single suite can exercise manager vs csa.
const roleState = vi.hoisted(() => ({ roles: ["manager"] as BackOfficeRole[] }));
vi.mock("@/features/auth/queries", () => ({
  sessionQuery: {
    queryKey: ["auth", "session"],
    queryFn: async () => ({ status: "signed-in", identity: { roles: roleState.roles } }),
  },
}));

const listPromos = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({ listPromos }));

import { PromotionsListScreen } from "./PromotionsListScreen";

const CODE = {
  id: "p1",
  code: "SPRING20",
  kind: "percentage" as const,
  percentOff: 20,
  amountOff: null,
  currency: "AUD",
  minimumSubtotalAmount: "50.00",
  startsAt: null,
  endsAt: null,
  maxRedemptions: 500,
  maxPerCustomer: 1,
  status: "active" as const,
  redemptionCount: 3,
  createdBy: "actor",
  updatedBy: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};
const ONE_PAGE = { items: [CODE], total: 1, page: 1, pageSize: 20 };

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

afterEach(() => {
  vi.clearAllMocks();
  roleState.roles = ["manager"];
});

describe("PromotionsListScreen", () => {
  it("renders a code's value, minimum and usage against its cap", async () => {
    listPromos.mockResolvedValue(ONE_PAGE);
    wrap(<PromotionsListScreen />);
    expect(await screen.findByText("SPRING20")).toBeInTheDocument();
    expect(screen.getByText("20% off")).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    expect(screen.getByText("3 of 500")).toBeInTheDocument();
  });

  it("reads a scheduled code's window as Scheduled, not as running", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    listPromos.mockResolvedValue({ ...ONE_PAGE, items: [{ ...CODE, startsAt: future }] });
    wrap(<PromotionsListScreen />);
    expect(await screen.findByText("Scheduled")).toBeInTheDocument();
  });

  it("reads a closed window as Ended even while the code's status is active", async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    listPromos.mockResolvedValue({ ...ONE_PAGE, items: [{ ...CODE, endsAt: past }] });
    wrap(<PromotionsListScreen />);
    expect(await screen.findByText("Ended")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("shows the empty message when no code matches", async () => {
    listPromos.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    wrap(<PromotionsListScreen />);
    expect(await screen.findByText(/no codes match your filter/i)).toBeInTheDocument();
  });

  it("offers Create code to a manager", async () => {
    listPromos.mockResolvedValue(ONE_PAGE);
    wrap(<PromotionsListScreen />);
    expect(await screen.findByRole("button", { name: /create code/i })).toBeInTheDocument();
  });

  it("hides Create code from a csa — support reads the register, it does not write it", async () => {
    roleState.roles = ["csa"];
    listPromos.mockResolvedValue(ONE_PAGE);
    wrap(<PromotionsListScreen />);
    expect(await screen.findByText("SPRING20")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create code/i })).not.toBeInTheDocument();
  });
});
