import type { ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const repo = vi.hoisted(() => ({
  getSamedayDeclaration: vi.fn(),
  submitSamedayDeclaration: vi.fn(),
  searchLocalities: vi.fn(),
  postcodeCoverage: vi.fn(),
}));
vi.mock("./repo", () => repo);

import { SameDayScreen } from "./SameDayScreen";

const BALLARAT_COVERAGE = {
  postcode: "3350",
  count: 20,
  places: Array.from({ length: 20 }, (_, i) => ({ name: `Ballarat Place ${i + 1}`, state: "VIC", postcode: "3350" })),
};

function area(postcode: string, localityCount = 20) {
  return { postcode, places: [`Place in ${postcode}`], localityCount };
}

function declaration(over: Record<string, unknown> = {}) {
  return {
    id: "d1",
    shopId: "s1",
    offersSameday: true,
    cutoffTime: "14:00",
    status: "approved",
    areas: [area("3550")],
    submittedBy: "sub",
    submittedAt: "2026-08-01T00:00:00.000Z",
    decidedBy: "admin",
    decidedAt: "2026-08-01T01:00:00.000Z",
    decisionNote: null,
    ...over,
  };
}

const CAN_DECLARE = {
  canDeclare: true,
  cannotDeclareReason: null,
  inForce: null,
  pending: null,
  lastDecision: null,
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SameDayScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  repo.getSamedayDeclaration.mockResolvedValue(CAN_DECLARE);
  repo.submitSamedayDeclaration.mockResolvedValue(CAN_DECLARE);
  repo.searchLocalities.mockResolvedValue([{ name: "Alfredton", state: "VIC", postcode: "3350" }]);
  repo.postcodeCoverage.mockResolvedValue(BALLARAT_COVERAGE);
});

describe("SameDayScreen", () => {
  // ⚠ FR-018 — in force and pending are TWO facts. Collapsing them would make a shop either think a
  // pending edit was already live, or think an approved one had been lost.
  it("shows what is live and what is waiting, separately", async () => {
    repo.getSamedayDeclaration.mockResolvedValue({
      ...CAN_DECLARE,
      inForce: declaration({ cutoffTime: "14:00", areas: [area("3550")] }),
      pending: declaration({ id: "d2", status: "pending", cutoffTime: "12:00", decidedBy: null, decidedAt: null }),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("status-in-force")).toBeInTheDocument());
    expect(screen.getByTestId("status-pending")).toBeInTheDocument();
    expect(screen.getByTestId("status-in-force").textContent).toMatch(/14:00/);
    expect(screen.getByTestId("status-pending").textContent).toMatch(/version above is what customers get/i);
  });

  // ⚠ FR-017 — the shop must be told, in the interface, that saving changes nothing yet.
  it("says a save is a proposal, not a switch", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("status-in-force")).toBeInTheDocument());
    expect(document.body.textContent).toMatch(/Nothing changes for customers until it is approved/i);
  });

  // ⚠ FR-020, both refusals — explained BEFORE a form is filled in, not after it is rejected.
  it("explains a missing shop location and disables the form", async () => {
    repo.getSamedayDeclaration.mockResolvedValue({
      ...CAN_DECLARE,
      canDeclare: false,
      cannotDeclareReason: "shop_location_required",
    });
    renderScreen();
    const notice = await screen.findByTestId("cannot-declare");
    expect(notice.textContent).toMatch(/No location is recorded/i);
    expect(screen.getByRole("button", { name: /send for approval/i })).toBeDisabled();
  });

  // ⚠ THE SUBTLE ONE, and it must read differently. The shop HAS a postcode; the platform does not
  // know where it is — so every distance on the approval screen would be blank and the admin would
  // decide blind.
  it("explains an unmappable shop postcode distinctly", async () => {
    repo.getSamedayDeclaration.mockResolvedValue({
      ...CAN_DECLARE,
      canDeclare: false,
      cannotDeclareReason: "shop_location_unmappable",
    });
    renderScreen();
    const notice = await screen.findByTestId("cannot-declare");
    expect(notice.textContent).toMatch(/no known location on the map/i);
    expect(notice.textContent).not.toMatch(/No location is recorded/i);
  });

  // ⚠ THE DISCLOSURE, WIRED TO REAL DATA. 031 shipped two of these hardcoded to `siblingCount={0}`
  // and `shops={[]}`, so neither would ever have rendered — the warning existed in the code and
  // never once reached a human. This test fails if the count is zero-by-construction.
  it("discloses what a chosen postcode actually covers, from the server", async () => {
    repo.getSamedayDeclaration.mockResolvedValue({
      ...CAN_DECLARE,
      inForce: declaration({ areas: [area("3350")] }),
    });
    renderScreen();

    const notice = await screen.findByTestId("coverage-notice");
    expect(repo.postcodeCoverage).toHaveBeenCalledWith("3350");
    // 20 localities → "19 other places". A hardcoded 0 would render the "sole" branch instead.
    expect(within(notice).getByTestId("coverage-many").textContent).toMatch(/19 other places/);
    expect(screen.queryByTestId("coverage-sole")).not.toBeInTheDocument();
  });

  it("renders the refusal copy for a cutoff_required refusal", async () => {
    repo.getSamedayDeclaration.mockResolvedValue({
      ...CAN_DECLARE,
      inForce: declaration({ areas: [area("3350")] }),
    });
    repo.submitSamedayDeclaration.mockRejectedValue({
      kind: "unknown",
      status: 422,
      title: "Cannot save this declaration",
      fields: [{ field: "cutoff_required", message: "server prose" }],
    });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("status-in-force")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /send for approval/i }));

    const err = await screen.findByTestId("form-error");
    expect(err.textContent).toMatch(/Set a cutoff time/i);
    expect(err.textContent).not.toMatch(/server prose/);
  });

  it("tells a non-manager that only a manager can change this", async () => {
    repo.getSamedayDeclaration.mockResolvedValue({
      ...CAN_DECLARE,
      inForce: declaration({ areas: [area("3350")] }),
    });
    repo.submitSamedayDeclaration.mockRejectedValue({ kind: "forbidden", status: 403, title: "x" });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("status-in-force")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /send for approval/i }));
    expect((await screen.findByTestId("form-error")).textContent).toMatch(/Only a shop manager/i);
  });

  it("confirms a successful submit without claiming it is live", async () => {
    repo.getSamedayDeclaration.mockResolvedValue({
      ...CAN_DECLARE,
      inForce: declaration({ areas: [area("3350")] }),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("status-in-force")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /send for approval/i }));
    const ok = await screen.findByTestId("submitted");
    expect(ok.textContent).toMatch(/Nothing has changed for customers yet/i);
  });

  // ⚠ revoked and superseded are different events, and must not read the same.
  it("shows a revocation as an Effy decision, not as an update going live", async () => {
    repo.getSamedayDeclaration.mockResolvedValue({
      ...CAN_DECLARE,
      lastDecision: declaration({ status: "revoked", decisionNote: "Too far from Ballarat." }),
    });
    renderScreen();
    const box = await screen.findByTestId("status-revoked");
    expect(box.textContent).toMatch(/Effy withdrew same-day/i);
    expect(box.textContent).toMatch(/Too far from Ballarat/);
  });

  it("shows a decline with its reason", async () => {
    repo.getSamedayDeclaration.mockResolvedValue({
      ...CAN_DECLARE,
      lastDecision: declaration({ status: "declined", decisionNote: "Ballarat is 98 km away." }),
    });
    renderScreen();
    expect((await screen.findByTestId("status-declined")).textContent).toMatch(/98 km away/);
  });

  // ⚠ FR-016 — areas are chosen by NAME, from real places, never by typing a postcode.
  it("searches places by name and adds the one chosen", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("status-in-force")).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText(/offers same-day/i));
    await userEvent.type(screen.getByLabelText(/Areas you can reach/i), "alfred");

    const results = await screen.findByTestId("area-results");
    expect(results.textContent).toMatch(/Alfredton, VIC/);
    await userEvent.click(within(results).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(repo.postcodeCoverage).toHaveBeenCalledWith("3350"));
  });
});
