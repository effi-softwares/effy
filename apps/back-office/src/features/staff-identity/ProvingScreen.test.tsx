import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DomainError } from "@effy/api-client";

const { loadMe } = vi.hoisted(() => ({ loadMe: vi.fn() }));
vi.mock("./repo", () => ({ loadMe, loadAdminPing: vi.fn() }));

import { ProvingScreen } from "./ProvingScreen";

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

const unavailable: DomainError = { kind: "unavailable", status: 0, title: "Service unavailable" };

describe("ProvingScreen (record-backed identity read)", () => {
  it("renders the platform record (subject, roles, status)", async () => {
    loadMe.mockResolvedValue({
      subject: "sub-42",
      email: "op@effy.test",
      roles: ["admin", "manager"],
      status: "active",
    });
    wrap(<ProvingScreen />);
    expect(await screen.findByText("sub-42")).toBeInTheDocument();
    expect(screen.getByText(/admin, manager/i)).toBeInTheDocument();
  });

  it("shows a recorded no-roles state for a role-less account (200, roles: [])", async () => {
    loadMe.mockResolvedValue({
      subject: "sub-9",
      email: "new@effy.test",
      roles: [],
      status: "active",
    });
    wrap(<ProvingScreen />);
    expect(await screen.findByText(/no back-office roles are assigned/i)).toBeInTheDocument();
  });

  it("shows a degraded state with retry when the backend is unreachable", async () => {
    loadMe.mockRejectedValue(unavailable);
    wrap(<ProvingScreen />);
    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
