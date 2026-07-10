import type { DomainError } from "@effy/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const loadManagerPing = vi.hoisted(() => vi.fn());
const track = vi.hoisted(() => vi.fn());
vi.mock("./repo", () => ({ loadManagerPing, loadMe: vi.fn() }));
vi.mock("@/lib/telemetry", () => ({ track, reportError: vi.fn(), initTelemetry: vi.fn() }));

import { ManagerOnlyScreen } from "./ManagerOnlyScreen";

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

function domainError(kind: DomainError["kind"], status: number): DomainError {
  return { kind, status, title: "t", detail: "the record says disabled" };
}

describe("ManagerOnlyScreen", () => {
  it("renders the manager-only read the backend served", async () => {
    loadManagerPing.mockResolvedValue({ subject: "sub-1" });
    wrap(<ManagerOnlyScreen />);

    expect(await screen.findByText(/served this manager-only read/i)).toBeInTheDocument();
    expect(screen.getByText("sub-1")).toBeInTheDocument();
  });

  // The backend refused. That is a correct answer — no retry, no privileged data, no raw detail.
  it("renders a denial when the backend refuses, showing no privileged data", async () => {
    loadManagerPing.mockImplementation(async () => {
      throw domainError("forbidden", 403);
    });
    const { container } = wrap(<ManagerOnlyScreen />);

    expect(await screen.findByText(/can't reach shop management/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/served this manager-only read|the record says disabled/);
  });

  it("emits the denial telemetry event exactly once", async () => {
    track.mockClear();
    loadManagerPing.mockImplementation(async () => {
      throw domainError("forbidden", 403);
    });
    wrap(<ManagerOnlyScreen />);

    expect(await screen.findByText(/can't reach shop management/i)).toBeInTheDocument();
    const denials = track.mock.calls.filter(
      (c) => (c[0] as { name: string }).name === "shop_manager_area_access_denied",
    );
    expect(denials).toHaveLength(1);
  });

  it("offers a retry for a degraded backend, and does not call it a denial", async () => {
    loadManagerPing.mockImplementation(async () => {
      throw domainError("unavailable", 503);
    });
    wrap(<ManagerOnlyScreen />);

    expect(await screen.findByText(/service unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/can't reach shop management/i)).not.toBeInTheDocument();
  });
});
