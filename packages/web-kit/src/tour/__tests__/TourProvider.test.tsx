import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import type { ConsoleTourPatch, ConsoleTourStateDTO } from "@effy/shared-types";

import type { TourDef } from "../define";
import { applyPatch } from "../engine";
import { TourProvider, useTours, type TourEvent } from "../TourProvider";
import { useTourPage } from "../useTourPage";

// jsdom lays nothing out; everything rendered counts as laid out unless marked.
const original = Element.prototype.getClientRects;
beforeEach(() => {
  Element.prototype.getClientRects = function (this: Element) {
    return (this.closest("[data-test-hidden]") ? [] : [{ width: 10, height: 10 }]) as unknown as DOMRectList;
  };
  Element.prototype.scrollIntoView = () => {};
  if (!("ResizeObserver" in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  }
});
afterEach(() => {
  Element.prototype.getClientRects = original;
});

const TOURS: readonly TourDef[] = [
  { key: "welcome", version: 1, title: "Welcome to Effy Shop", anyPage: true, steps: [{ target: null, title: "Hello", text: "Hi." }] },
  {
    key: "orders",
    version: 1,
    title: "Orders",
    steps: [
      { target: "lane", title: "Awaiting pick", text: "Oldest first." },
      { target: "refund", title: "Refunds", text: "Managers only.", roles: ["manager"] },
      { target: "ready", title: "Ready", text: "Packed." },
    ],
  },
];

function Page() {
  useTourPage("orders", { status: "ready" });
  const { startPage } = useTours();
  return (
    <main>
      <div data-tour="lane">Lane</div>
      <div data-tour="refund">Refund</div>
      <div data-tour="ready">Ready lane</div>
      <button onClick={() => startPage("help")}>Help tour</button>
    </main>
  );
}

const seen = (version = 1) => ({ version, outcome: "finished" as const, at: "2026-11-03T00:00:00.000Z" });

/** Writes land in the state the way the app's optimistic cache does. */
function setup(initial: ConsoleTourStateDTO, roles: readonly string[] = [], analyticsRole?: string, tours: readonly TourDef[] = TOURS) {
  const writes: ConsoleTourPatch[] = [];
  const events: TourEvent[] = [];
  function Harness() {
    const [state, setState] = useState(initial);
    return (
      <TourProvider
        tours={tours}
        roles={roles}
        analyticsRole={analyticsRole}
        state={{ data: state, isSuccess: true }}
        write={(p) => {
          writes.push(p);
          setState((s) => applyPatch(s, p));
        }}
        openRecord={async () => true}
        onEvent={(e) => events.push(e)}
      >
        <Page />
      </TourProvider>
    );
  }
  render(<Harness />);
  return { writes, events };
}

const SLOW = { timeout: 3000 };

describe("TourProvider (106) - tours start by themselves the first time", () => {
  it("starts the Welcome tour first, then the page's own tour when Welcome is finished", async () => {
    const user = userEvent.setup();
    const { events } = setup({ offerTours: true, seen: {} });
    expect(await screen.findByRole("heading", { name: "Hello" }, SLOW)).toBeInTheDocument();
    expect(events[0]).toEqual({ name: "tour_started", tour: "welcome", version: 1, via: "auto" });
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("heading", { name: "Awaiting pick" }, SLOW)).toBeInTheDocument();
    expect(events.at(-1)).toEqual({ name: "tour_started", tour: "orders", version: 1, via: "auto" });
  });

  it("closing Welcome early leaves the page's tour for the next visit", async () => {
    const user = userEvent.setup();
    setup({ offerTours: true, seen: {} });
    await screen.findByRole("heading", { name: "Hello" }, SLOW);
    await user.keyboard("{Escape}");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
    expect(screen.queryByRole("heading", { name: "Awaiting pick" })).toBeNull();
  });

  it("starts a page tour by itself once, records it at once, skips the manager step and finishes with Done", async () => {
    const user = userEvent.setup();
    const { writes, events } = setup({ offerTours: true, seen: { welcome: seen() } });
    expect(await screen.findByRole("heading", { name: "Awaiting pick" }, SLOW)).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(writes[0]).toEqual({ tour: "orders", version: 1, outcome: "closed" });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Ready" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Ready" })).toBeNull());
    expect(writes.at(-1)).toEqual({ tour: "orders", version: 1, outcome: "finished" });
    expect(events.at(-1)).toEqual({ name: "tour_finished", tour: "orders", version: 1 });

    // Not again.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
    expect(screen.queryByRole("heading", { name: "Awaiting pick" })).toBeNull();
  });

  it("shows the manager step to a manager", async () => {
    setup({ offerTours: true, seen: { welcome: seen() } }, ["manager"]);
    expect(await screen.findByText("Step 1 of 3", {}, SLOW)).toBeInTheDocument();
  });

  it("Escape closes the tour and reports where it stopped", async () => {
    const user = userEvent.setup();
    const { events } = setup({ offerTours: true, seen: { welcome: seen() } });
    await screen.findByRole("heading", { name: "Awaiting pick" }, SLOW);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Awaiting pick" })).toBeNull());
    expect(events.at(-1)).toEqual({ name: "tour_closed", tour: "orders", version: 1, step: 1, of: 2 });
  });

  it("replays a seen tour from Help", async () => {
    const user = userEvent.setup();
    const { events } = setup({ offerTours: true, seen: { welcome: seen(), orders: seen() } });
    await user.click(screen.getByRole("button", { name: "Help tour" }));
    expect(await screen.findByRole("heading", { name: "Awaiting pick" })).toBeInTheDocument();
    expect(events[0]).toEqual({ name: "tour_started", tour: "orders", version: 1, via: "help" });
  });

  it("adds the role name to every event when one is given (107 FR-012)", async () => {
    const { events } = setup({ offerTours: true, seen: { welcome: seen() } }, ["csa"], "Customer support");
    await screen.findByRole("heading", { name: "Awaiting pick" }, SLOW);
    expect(events[0]).toEqual({ name: "tour_started", tour: "orders", version: 1, via: "auto", role: "Customer support" });
  });

  it("never starts a tour limited to a role the person lacks (107 FR-005)", async () => {
    const limited = TOURS.map((t) => (t.key === "orders" ? { ...t, roles: ["admin"] } : t));
    setup({ offerTours: true, seen: { welcome: seen() } }, ["csa"], undefined, limited);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
    expect(screen.queryByRole("heading", { name: "Awaiting pick" })).toBeNull();
  });

  it("moves on when the part a step points at goes away, and ends when nothing is left (107 US4)", async () => {
    const { events } = setup({ offerTours: true, seen: { welcome: seen() } });
    expect(await screen.findByRole("heading", { name: "Awaiting pick" }, SLOW)).toBeInTheDocument();
    // A live update removes the lane the step points at.
    await act(async () => {
      document.querySelector('[data-tour="lane"]')!.setAttribute("data-test-hidden", "");
    });
    expect(await screen.findByRole("heading", { name: "Ready" })).toBeInTheDocument();
    await act(async () => {
      document.querySelector('[data-tour="ready"]')!.setAttribute("data-test-hidden", "");
    });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Ready" })).toBeNull());
    expect(events.at(-1)).toMatchObject({ name: "tour_closed", tour: "orders" });
  });

  it("starts nothing by itself when tours are turned off", async () => {
    setup({ offerTours: false, seen: {} });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
