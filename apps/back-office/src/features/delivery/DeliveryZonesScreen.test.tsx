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

const listZones = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({ listZones }));

import { DeliveryZonesScreen } from "./DeliveryZonesScreen";

const ONE_PAGE = {
  items: [
    { id: "z1", code: "MEL-METRO", name: "Melbourne Metro", status: "active", postcodeCount: 5, createdAt: "t", updatedAt: "t" },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

afterEach(() => {
  vi.clearAllMocks();
  roleState.roles = ["manager"];
});

describe("DeliveryZonesScreen", () => {
  it("renders zones from the paged response", async () => {
    listZones.mockResolvedValue(ONE_PAGE);
    wrap(<DeliveryZonesScreen />);
    expect(await screen.findByText("MEL-METRO")).toBeInTheDocument();
    expect(screen.getByText("Melbourne Metro")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows the empty message when there are no zones", async () => {
    listZones.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    wrap(<DeliveryZonesScreen />);
    expect(await screen.findByText(/no zones match your filter/i)).toBeInTheDocument();
  });

  it("renders an error state when the list fails", async () => {
    listZones.mockRejectedValue({ kind: "unavailable", status: 503, title: "Unavailable" });
    wrap(<DeliveryZonesScreen />);
    expect(await screen.findByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });

  it("a manager sees the Create zone control", async () => {
    listZones.mockResolvedValue(ONE_PAGE);
    wrap(<DeliveryZonesScreen />);
    expect(await screen.findByText("MEL-METRO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create zone/i })).toBeInTheDocument();
  });

  it("a csa sees the register read-only — NO Create zone control", async () => {
    roleState.roles = ["csa"];
    listZones.mockResolvedValue(ONE_PAGE);
    wrap(<DeliveryZonesScreen />);
    expect(await screen.findByText("MEL-METRO")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create zone/i })).toBeNull();
  });
});
