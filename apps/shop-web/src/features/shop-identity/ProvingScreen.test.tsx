import type { DomainError } from "@effy/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const loadMe = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({ loadMe, loadManagerPing: vi.fn() }));
vi.mock("@/lib/telemetry", () => ({ track: vi.fn(), reportError: vi.fn(), initTelemetry: vi.fn() }));

import { ProvingScreen } from "./ProvingScreen";

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

const RECORD = {
  subject: "sub-1",
  email: "sam@effy.test",
  roles: ["shop_manager" as const],
  status: "active" as const,
  shop: { id: "shop-1", code: "CMB-01", name: "Colombo 01", isActive: true },
};

function domainError(kind: DomainError["kind"], status: number): DomainError {
  return { kind, status, title: "t", detail: "internal SQL detail" };
}

describe("ProvingScreen", () => {
  it("renders the identity, roles, and assigned shop the backend returned", async () => {
    loadMe.mockResolvedValue(RECORD);
    wrap(<ProvingScreen />);

    expect(await screen.findByText("sub-1")).toBeInTheDocument();
    expect(screen.getByText("sam@effy.test")).toBeInTheDocument();
    expect(screen.getByText("shop_manager")).toBeInTheDocument();
    expect(screen.getByText("Colombo 01 (CMB-01)")).toBeInTheDocument();
  });

  // A role-less operator is RECORDED, not refused — this must not read as an error.
  it("explains a role-less operator instead of showing a failure", async () => {
    loadMe.mockResolvedValue({ ...RECORD, roles: [] });
    wrap(<ProvingScreen />);

    expect(await screen.findByText(/no shop roles are assigned yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  // Unassigned is an EXPECTED state: the JIT upsert meets an operator before their shop is known.
  it("explains a missing shop assignment instead of showing a failure", async () => {
    loadMe.mockResolvedValue({ ...RECORD, shop: null });
    wrap(<ProvingScreen />);

    expect(await screen.findByText(/not assigned to a shop yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("renders a recoverable degraded state with a retry when the backend is unreachable", async () => {
    loadMe.mockImplementation(async () => {
      throw domainError("unavailable", 503);
    });
    wrap(<ProvingScreen />);

    expect(await screen.findByText(/service unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("routes an expired session to sign-in copy rather than a retry", async () => {
    loadMe.mockImplementation(async () => {
      throw domainError("unauthenticated", 401);
    });
    wrap(<ProvingScreen />);

    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("never leaks internal error detail to the operator", async () => {
    loadMe.mockImplementation(async () => {
      throw domainError("unavailable", 503);
    });
    const { container } = wrap(<ProvingScreen />);

    expect(await screen.findByText(/service unavailable/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/internal SQL detail|503/);
  });
});
