import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GoLiveDTO, GoLiveReadinessItem, GoLiveSwitch } from "@effy/shared-types";

// A real <Link> needs a RouterProvider; an anchor carrying its target is what these tests read.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children, ...rest }: { to: string; search?: Record<string, unknown>; children: ReactNode }) => (
    <a href={search ? `${to}?${new URLSearchParams(Object.entries(search).map(([k, v]) => [k, String(v)])).toString()}` : to} {...rest}>{children}</a>
  ),
}));

const repo = vi.hoisted(() => ({ getGoLive: vi.fn(), putGoLiveSwitch: vi.fn() }));
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), ...repo }));

const { GoLivePanel } = await import("./GoLivePanel");

const item = (key: GoLiveReadinessItem["key"], over: Partial<GoLiveReadinessItem> = {}): GoLiveReadinessItem => ({
  key, required: true, ready: true, detail: `${key} is set up`, fixAt: "/delivery?tab=coverage", ...over,
});
const OFF: GoLiveSwitch = { state: "off", at: null, setBy: null, setAt: null, canTurnBack: false, removedAt: null };
const page = (over: Partial<GoLiveDTO> = {}): GoLiveDTO => ({
  readiness: {
    ready: true,
    items: [
      item("drivers", { required: false, ready: false, detail: "No driver may collect yet", fixAt: "/drivers" }),
      item("coverage"), item("effy_plan", { fixAt: "/delivery?tab=pricing" }), item("windows", { fixAt: "/delivery?tab=slots" }),
    ],
  },
  switch: OFF, legacy: null, history: [], ...over,
});
/** A refusal as `@effy/api-client` throws it: a plain object, NOT an Error. */
const refusal = (status: number, code?: string, kind = "unknown") => ({ kind, status, title: "Refused", code });

const goTo = vi.fn();
function renderPanel(canSwitch = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<GoLivePanel canSwitch={canSwitch} onGoToTab={goTo} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getGoLive.mockResolvedValue(page());
  repo.putGoLiveSwitch.mockResolvedValue({ ...OFF, state: "on", at: "2026-11-02T01:00:00.000Z" });
});

describe("083 — the go-live checklist", () => {
  it("lists required items first, marks an advisory one, and links each to where it is fixed", async () => {
    renderPanel();
    const rows = await screen.findAllByTestId(/^readiness-item-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["readiness-item-coverage", "readiness-item-effy_plan", "readiness-item-windows", "readiness-item-drivers"]);
    expect(screen.getByTestId("readiness-summary")).toHaveTextContent("Everything the new delivery model needs is in place.");

    const drivers = within(screen.getByTestId("readiness-item-drivers"));
    expect(drivers.getByText("Advisory")).toBeInTheDocument();
    expect(drivers.getByText("Check")).toBeInTheDocument(); // a warning, never "Not ready"
    expect(drivers.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/drivers");

    await userEvent.click(within(screen.getByTestId("readiness-item-effy_plan")).getByRole("button", { name: "Open" }));
    expect(goTo).toHaveBeenCalledWith("pricing");
  });

  it("⚠ not ready: says so, names the item, and the switch cannot be set", async () => {
    repo.getGoLive.mockResolvedValue(page({
      readiness: { ready: false, items: [item("coverage"), item("windows", { ready: false, detail: "No delivery window is switched on" })] },
    }));
    renderPanel();
    expect(await screen.findByTestId("readiness-summary")).toHaveTextContent("Not yet.");
    const windows = within(screen.getByTestId("readiness-item-windows"));
    expect(windows.getByText("Not ready")).toBeInTheDocument();
    expect(windows.getByText("No delivery window is switched on")).toBeInTheDocument();
    expect(screen.getByTestId("switch-locked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch now…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeDisabled();
  });
});

describe("083 — the switch", () => {
  it("schedule sends the instant chosen and what the page showed", async () => {
    renderPanel();
    await screen.findByTestId("switch-state");
    expect(screen.getByRole("button", { name: "Schedule" })).toBeDisabled(); // nothing chosen yet
    await userEvent.type(screen.getByLabelText(/Date and time/), "2026-11-02T06:00");
    expect(screen.getByTestId("switch-preview")).toHaveTextContent("(Melbourne)");
    await userEvent.click(screen.getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(repo.putGoLiveSwitch).toHaveBeenCalledTimes(1));
    expect(repo.putGoLiveSwitch.mock.calls[0]![0]).toEqual({ at: new Date("2026-11-02T06:00").toISOString(), expected: null, reason: null });
  });

  it("switch now asks first, and says what happens to orders already placed", async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Switch now…" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Orders already placed keep exactly what they were sold");
    expect(repo.putGoLiveSwitch).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Switch now" }));
    await waitFor(() => expect(repo.putGoLiveSwitch).toHaveBeenCalledWith({ at: "now", expected: null, reason: null }));
  });

  it("a scheduled switch: when, who set it, change or cancel — each carrying the moment shown", async () => {
    const at = "2026-11-02T19:00:00.000Z";
    repo.getGoLive.mockResolvedValue(page({
      switch: { state: "scheduled", at, setBy: "Ada", setAt: "2026-10-30T02:00:00.000Z", canTurnBack: false, removedAt: null },
      history: [{ at: "2026-10-30T02:00:00.000Z", action: "set", value: at, by: "Ada", reason: null }],
    }));
    renderPanel();
    expect(await screen.findByTestId("switch-state")).toHaveTextContent("Scheduled");
    expect(screen.getByTestId("switch-at")).toHaveTextContent("Tue, 3 Nov 2026, 6:00 am (Melbourne)");
    expect(screen.getAllByText(/^Ada, /)).toHaveLength(2); // who set it, and the history line
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(within(screen.getByTestId("golive-history-list")).getByText("Set")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel the scheduled switch" }));
    await waitFor(() => expect(repo.putGoLiveSwitch).toHaveBeenCalledWith({ at: null, expected: at, reason: null }));
  });

  it("⚠ turning back off needs a reason, and says orders placed meanwhile keep what they were sold", async () => {
    const at = "2026-11-02T01:00:00.000Z";
    repo.getGoLive.mockResolvedValue(page({
      switch: { state: "on", at, setBy: "Ada", setAt: at, canTurnBack: true, removedAt: null },
      legacy: { open: 3, lastClosedAt: null, alertAfterDays: 7 },
    }));
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Turn back off…" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Orders placed while the new model was on keep what they were sold");
    const confirm = within(dialog).getByRole("button", { name: "Turn back off" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Why"), "drivers not briefed");
    await userEvent.click(confirm);
    await waitFor(() => expect(repo.putGoLiveSwitch).toHaveBeenCalledWith({ at: null, expected: at, reason: "drivers not briefed" }));
  });

  it("⚠ anyone but an administrator reads the state and is offered no control", async () => {
    renderPanel(false);
    expect(await screen.findByTestId("switch-readonly")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch now|Schedule|Change|Cancel|Turn back off/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Date and time/)).not.toBeInTheDocument();
  });

  it("once the old arrangement is removed there is nothing to switch", async () => {
    repo.getGoLive.mockResolvedValue(page({
      switch: { state: "on", at: "2026-11-02T01:00:00.000Z", setBy: "Ada", setAt: null, canTurnBack: false, removedAt: "2026-11-20T01:00:00.000Z" },
      legacy: { open: 0, lastClosedAt: "2026-11-09T03:00:00.000Z", alertAfterDays: 7 },
    }));
    renderPanel();
    expect(await screen.findByText(/the new model is on for good/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Turn back off|Switch now|Schedule/ })).not.toBeInTheDocument();
  });

  it.each([
    [refusal(409, "not_ready"), /The platform is not ready/],
    [refusal(409, "changed"), /Someone else changed the switch a moment ago/],
    [refusal(409, "removed"), /on for good/],
    [refusal(403, undefined, "forbidden"), /Only an administrator/],
  ])("a refusal is said in the console's own words, and the page is re-read", async (err, words) => {
    repo.putGoLiveSwitch.mockRejectedValue(err);
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Switch now…" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Switch now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(words);
    await waitFor(() => expect(repo.getGoLive).toHaveBeenCalledTimes(2));
  });
});

describe("083 — orders sold the old way", () => {
  const on: GoLiveSwitch = { state: "on", at: "2026-11-02T01:00:00.000Z", setBy: "Ada", setAt: null, canTurnBack: true, removedAt: null };

  it("off: no count at all", async () => {
    renderPanel();
    await screen.findByTestId("switch-state");
    expect(screen.queryByText("Orders sold the old way")).not.toBeInTheDocument();
  });

  it("some still open: the count links to exactly those orders", async () => {
    repo.getGoLive.mockResolvedValue(page({ switch: on, legacy: { open: 3, lastClosedAt: null, alertAfterDays: 7 } }));
    renderPanel();
    const link = await screen.findByRole("link", { name: "3 old orders still open" });
    expect(link).toHaveAttribute("href", "/orders?delivery=legacy&open=true");
    expect(screen.getByText(/still open 7 days after the switch/)).toBeInTheDocument();
  });

  it("none left: says so, and when the last one closed", async () => {
    repo.getGoLive.mockResolvedValue(page({ switch: on, legacy: { open: 0, lastClosedAt: "2026-11-09T03:00:00.000Z", alertAfterDays: 7 } }));
    renderPanel();
    expect(await screen.findByTestId("legacy-none")).toHaveTextContent("No old order remains open — the last one closed Mon, 9 Nov 2026, 2:00 pm (Melbourne).");
  });
});
