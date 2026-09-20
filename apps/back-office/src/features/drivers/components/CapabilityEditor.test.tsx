import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DriverCapability } from "@effy/shared-types";

const listCapabilities = vi.hoisted(() => vi.fn());
const grantCapability = vi.hoisted(() => vi.fn());
const revokeCapability = vi.hoisted(() => vi.fn());
const listZones = vi.hoisted(() => vi.fn());
const roles = vi.hoisted(() => ({ current: [] as string[] }));

vi.mock("../capabilityRepo", () => ({
  listCapabilities,
  grantCapability,
  revokeCapability,
  getCoverage: vi.fn(),
}));
vi.mock("../repo", () => ({ listZones }));
vi.mock("@/features/auth/useSessionRoles", () => ({ useSessionRoles: () => roles.current }));

const { CapabilityEditor } = await import("./CapabilityEditor");

function cap(over: Partial<DriverCapability> = {}): DriverCapability {
  return {
    id: "c-1",
    function: "delivery",
    method: "same_day",
    zoneId: "z-1",
    zoneName: "Inner North",
    grantedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<CapabilityEditor driverId="d-1" />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  roles.current = ["admin"];
  listCapabilities.mockResolvedValue({ items: [cap()] });
  listZones.mockResolvedValue([{ id: "z-1", name: "Inner North" }]);
  grantCapability.mockResolvedValue({ items: [cap()] });
  revokeCapability.mockResolvedValue({ items: [] });
});

describe("CapabilityEditor — what a driver is cleared for", () => {
  it("lists each clearance with its work, method and place", async () => {
    renderEditor();
    // ⚠ ANCHOR ON THE REVOKE BUTTON, which exists ONLY once the list has rendered. Both the work
    // label and the zone name also appear as <option>s in the grant form below, so awaiting either
    // matches instantly — which is exactly how the first draft of this test passed VACUOUSLY while
    // the empty state was on screen, and then failed ambiguously when it did resolve.
    expect(await screen.findByRole("button", { name: "Revoke" })).toBeInTheDocument();
    // ⚠ `getAllBy` throughout: every one of these strings ALSO appears as an <option> in the grant
    // form below the list, and `getBy` would fail on the ambiguity rather than on the behaviour.
    expect(screen.getAllByText("Inner North").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Same-day").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Deliver to customers").length).toBeGreaterThan(0);
  });

  /**
   * ⚠ FR-012 — "every zone" must be legible AS A FACT, not as an enumeration that happens to cover
   * everything today. An operator reading this screen has to be able to tell the two apart, because
   * only one of them stays true when a zone is added next month.
   */
  it("⚠ renders an every-zone grant as 'Every zone', not as a list", async () => {
    listCapabilities.mockResolvedValue({
      items: [cap({ zoneId: null, zoneName: null })],
    });
    renderEditor();
    expect(await screen.findByText("Every zone")).toBeInTheDocument();
  });

  /**
   * ⚠ FR-015 — a driver cleared for nothing is a STATED FACT, not blank space. It is the single
   * thing stopping them being given any work, and an empty area reads as "nothing to say here".
   */
  it("⚠ says so plainly when a driver is cleared for nothing", async () => {
    listCapabilities.mockResolvedValue({ items: [] });
    renderEditor();
    expect(await screen.findByText(/Not cleared for any work/)).toBeInTheDocument();
  });

  /**
   * ⚠ THE GRANT SENDS `zoneId: null` EXPLICITLY. A key absent and a key present-with-null must not
   * be conflated, or "everywhere" becomes indistinguishable from "the operator forgot to choose" —
   * and the platform would grant the broadest clearance there is by accident.
   */
  it("⚠ sends zoneId: null — explicitly — when Every zone is chosen", async () => {
    const user = userEvent.setup();
    listCapabilities.mockResolvedValue({ items: [] });
    renderEditor();
    await screen.findByText(/Not cleared for any work/);

    await user.click(screen.getByRole("button", { name: /grant clearance/i }));

    await waitFor(() => {
      expect(grantCapability).toHaveBeenCalledWith("d-1", {
        function: "delivery",
        method: "standard",
        zoneId: null,
      });
    });
    // The key must be PRESENT, not merely undefined.
    expect("zoneId" in grantCapability.mock.calls[0]![1]).toBe(true);
  });

  it("revokes a single clearance", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(revokeCapability).toHaveBeenCalledWith("d-1", "c-1"));
  });

  it("⚠ hides every mutating control from a csa — absent, not disabled", async () => {
    roles.current = ["csa"];
    renderEditor();
    // ⚠ Wait for the LIST, then assert the controls are absent — otherwise this passes while the
    // component is still loading and nothing is on screen at all.
    await waitFor(() => expect(screen.getAllByText("Inner North").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /grant clearance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
  });
});
