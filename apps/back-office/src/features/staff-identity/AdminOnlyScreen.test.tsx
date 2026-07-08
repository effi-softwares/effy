import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DomainError } from "@effy/api-client";

const { loadAdminPing } = vi.hoisted(() => ({ loadAdminPing: vi.fn() }));
vi.mock("./repo", () => ({ loadAdminPing, loadMe: vi.fn() }));

import { AdminOnlyScreen } from "./AdminOnlyScreen";

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{children}</QueryClientProvider>);
}

const forbidden: DomainError = { kind: "forbidden", status: 403, title: "Forbidden" };

describe("AdminOnlyScreen", () => {
  it("confirms access for an administrator (backend 200)", async () => {
    loadAdminPing.mockResolvedValue({ subject: "admin-sub" });
    wrap(<AdminOnlyScreen />);
    expect(await screen.findByText(/administrator access confirmed/i)).toBeInTheDocument();
    expect(screen.getByText("admin-sub")).toBeInTheDocument();
  });

  it("shows access-denied when the backend refuses (403)", async () => {
    loadAdminPing.mockRejectedValue(forbidden);
    wrap(<AdminOnlyScreen />);
    expect(await screen.findByText(/don't have administrator access/i)).toBeInTheDocument();
  });
});
