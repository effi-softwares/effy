import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DriverException } from "@effy/shared-types";

const listExceptions = vi.hoisted(() => vi.fn());
const resolveException = vi.hoisted(() => vi.fn());
const roles = vi.hoisted(() => ({ current: ["admin"] as string[] }));

vi.mock("../repo", () => ({ listExceptions, resolveException }));
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.current }));
vi.mock("@/lib/telemetry", () => ({ track: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}));

const { ExceptionsList } = await import("./ExceptionsList");

function failure(over: Partial<DriverException> = {}): DriverException {
  return {
    kind: "delivery_failure",
    id: "df-1",
    reason: "nobody_home",
    note: "no answer, no safe place",
    driverId: "d-1",
    driverName: "Sam Rivers",
    orderId: "o-1",
    orderReference: "EFY-AAA111",
    location: "Carlton",
    occurredAt: "2026-08-29T06:00:00.000Z",
    resolvedAt: null,
    resolvedBySub: null,
    resolutionNote: null,
    ...over,
  };
}

function renderList(props: { driverId?: string } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<ExceptionsList {...props} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  roles.current = ["admin"];
  listExceptions.mockResolvedValue({ items: [failure()], nextCursor: null, outstandingCount: 1 });
});

describe("ExceptionsList — the reader these records never had", () => {
  it("⚠ shows the reason, the driver's own note, the driver, the order and where", async () => {
    renderList();
    expect(await screen.findByText("Delivery failed")).toBeInTheDocument();
    expect(screen.getByText("Nobody home")).toBeInTheDocument();
    expect(screen.getByText(/no answer, no safe place/)).toBeInTheDocument();
    expect(screen.getByText("Sam Rivers")).toBeInTheDocument();
    expect(screen.getByText("EFY-AAA111")).toBeInTheDocument();
    expect(screen.getByText("Carlton")).toBeInTheDocument();
  });

  it("⚠ FR-030 — links to the affected order in one step", async () => {
    renderList();
    const link = await screen.findByText("EFY-AAA111");
    expect(link.closest("a")).toHaveAttribute("params");
  });

  it("labels a collection issue with its own vocabulary, not the delivery one", async () => {
    listExceptions.mockResolvedValue({
      items: [failure({ kind: "collection_issue", reason: "short", location: "Shop One" })],
      nextCursor: null,
      outstandingCount: 1,
    });
    renderList();
    expect(await screen.findByText("Collection problem")).toBeInTheDocument();
    expect(screen.getByText("Short at shop")).toBeInTheDocument();
  });

  it("⚠ says the queue is CLEAR rather than showing a blank panel", async () => {
    listExceptions.mockResolvedValue({ items: [], nextCursor: null, outstandingCount: 0 });
    renderList();
    expect(await screen.findByText(/Every report from the road has been dealt with/)).toBeInTheDocument();
  });

  it("shows a resolved report with who-said-what, still readable and never deleted", async () => {
    listExceptions.mockResolvedValue({
      items: [
        failure({
          resolvedAt: "2026-08-30T01:00:00.000Z",
          resolvedBySub: "staff-1",
          resolutionNote: "redelivered next morning",
        }),
      ],
      nextCursor: null,
      outstandingCount: 0,
    });
    renderList();
    expect(await screen.findByText(/redelivered next morning/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark resolved/i })).not.toBeInTheDocument();
  });

  it("requires a note before resolving — a resolve with no note loses the reason", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(await screen.findByRole("button", { name: /mark resolved/i }));
    const resolveBtn = screen.getByRole("button", { name: "Resolve" });
    expect(resolveBtn).toBeDisabled();
    await user.type(screen.getByLabelText("Resolution note"), "redelivered");
    expect(resolveBtn).toBeEnabled();
  });

  it("⚠ gives a csa no resolve control — absent, not disabled", async () => {
    roles.current = ["csa"];
    renderList();
    await screen.findByText("Delivery failed");
    expect(screen.queryByRole("button", { name: /mark resolved/i })).not.toBeInTheDocument();
  });

  it("hides the fleet-wide filters when scoped to one driver's profile", async () => {
    renderList({ driverId: "d-1" });
    await screen.findByText("Delivery failed");
    expect(screen.queryByText("All reports")).not.toBeInTheDocument();
  });
});
