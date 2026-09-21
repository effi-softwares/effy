import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CoverageGap } from "@effy/shared-types";

const getCoverage = vi.hoisted(() => vi.fn());

vi.mock("../capabilityRepo", () => ({ getCoverage }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}));

const { CoveragePanel } = await import("./CoveragePanel");

function gap(over: Partial<CoverageGap> = {}): CoverageGap {
  return {
    zoneId: "z-1",
    zoneName: "Inner North",
    function: "delivery",
    method: "standard",
    reason: "no_driver_cleared",
    clearedDriverCount: 0,
    ...over,
  };
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<CoveragePanel />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCoverage.mockResolvedValue({ gaps: [gap()] });
});

describe("CoveragePanel — where the fleet has no cover", () => {
  /**
   * ⚠ FR-018 — TWO REASONS, AND THE WORDS NAME DIFFERENT REMEDIES.
   *
   * "Nobody is cleared" is fixed on a driver's record. "Cleared drivers cannot work today" is fixed
   * in readiness — a licence, a vehicle. A single "uncovered" label would send an operator to the
   * wrong screen half the time.
   */
  it("⚠ distinguishes nobody-cleared from everybody-unavailable", async () => {
    getCoverage.mockResolvedValue({
      gaps: [
        gap({ zoneName: "Inner North", reason: "no_driver_cleared", clearedDriverCount: 0 }),
        gap({
          zoneId: "z-2",
          zoneName: "Outer West",
          reason: "all_cleared_unavailable",
          clearedDriverCount: 2,
        }),
      ],
    });
    renderPanel();

    expect(await screen.findByText(/Nobody is cleared for this/)).toBeInTheDocument();
    expect(screen.getByText(/Cleared drivers cannot work today/)).toBeInTheDocument();
    // ⚠ The count is what makes the second reason actionable — somebody HAS the clearance.
    expect(screen.getByText(/2 cleared, none available/)).toBeInTheDocument();
  });

  it("names the kind of work, because a zone can be covered for one and not the other", async () => {
    getCoverage.mockResolvedValue({
      gaps: [gap({ function: "collection", method: "same_day" })],
    });
    renderPanel();
    expect(await screen.findByText(/Collect · Same-day/)).toBeInTheDocument();
  });

  /** ⚠ FR-019 — a list of problems, not a matrix. Nothing covered appears at all. */
  it("⚠ says everything is covered rather than listing zones with a green tick", async () => {
    getCoverage.mockResolvedValue({ gaps: [] });
    renderPanel();
    expect(await screen.findByText(/Every zone can be served/)).toBeInTheDocument();
    expect(screen.queryByText(/Nobody is cleared/)).not.toBeInTheDocument();
  });

  it("groups several gaps in one zone under that zone", async () => {
    getCoverage.mockResolvedValue({
      gaps: [
        gap({ function: "collection" }),
        gap({ function: "delivery" }),
      ],
    });
    renderPanel();
    await screen.findByText("Inner North");
    // One heading, two rows — an operator reads one place at a time, not one row at a time.
    expect(screen.getAllByText("Inner North")).toHaveLength(1);
    expect(screen.getAllByText(/Nobody is cleared for this/)).toHaveLength(2);
  });
});
