import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ConsoleTourPatch, ConsoleTourStateDTO } from "@effy/shared-types";

import type { TourDef } from "../define";
import { TourInvitation } from "../TourInvitation";
import { TourProvider, useTours, type TourEvent } from "../TourProvider";
import { useTourPage } from "../useTourPage";

// jsdom lays nothing out; everything rendered counts as laid out unless marked.
const original = Element.prototype.getClientRects;
beforeEach(() => {
  Element.prototype.getClientRects = function (this: Element) {
    return (this.closest("[data-test-hidden]") ? [] : [{}]) as unknown as DOMRectList;
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
      { target: "refund", title: "Refunds", text: "Managers only.", managersOnly: true },
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
      <input aria-label="Search" />
    </main>
  );
}

function setup(state: ConsoleTourStateDTO, manager = false) {
  const writes: ConsoleTourPatch[] = [];
  const events: TourEvent[] = [];
  render(
    <TourProvider
      tours={TOURS}
      roles={{ manager }}
      state={{ data: state, isSuccess: true }}
      write={(p) => writes.push(p)}
      openRecord={async () => true}
      onEvent={(e) => events.push(e)}
    >
      <Page />
      <TourInvitation />
    </TourProvider>,
  );
  return { writes, events };
}

const seenWelcome: ConsoleTourStateDTO = {
  offerTours: true,
  seen: { welcome: { version: 1, outcome: "finished", at: "2026-11-03T00:00:00.000Z" } },
};

describe("TourProvider (106)", () => {
  it("offers Welcome before the page's own tour", async () => {
    setup({ offerTours: true, seen: {} });
    expect(await screen.findByText("Take a quick tour of Welcome to Effy Shop?", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("runs a page tour from Help: records it at once, skips the manager step, finishes with Done", async () => {
    const user = userEvent.setup();
    const { writes, events } = setup(seenWelcome);
    await user.click(screen.getByRole("button", { name: "Help tour" }));

    expect(await screen.findByRole("heading", { name: "Awaiting pick" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(writes[0]).toEqual({ tour: "orders", version: 1, outcome: "closed" });
    expect(events[0]).toEqual({ name: "tour_started", tour: "orders", version: 1, via: "help" });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Ready" })).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Ready" })).toBeNull());
    expect(writes.at(-1)).toEqual({ tour: "orders", version: 1, outcome: "finished" });
    expect(events.at(-1)).toEqual({ name: "tour_finished", tour: "orders", version: 1 });
  });

  it("shows the manager step to a manager", async () => {
    const user = userEvent.setup();
    setup(seenWelcome, true);
    await user.click(screen.getByRole("button", { name: "Help tour" }));
    expect(await screen.findByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("Escape closes the tour and reports where it stopped", async () => {
    const user = userEvent.setup();
    const { events } = setup(seenWelcome);
    await user.click(screen.getByRole("button", { name: "Help tour" }));
    await screen.findByRole("heading", { name: "Awaiting pick" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Awaiting pick" })).toBeNull());
    expect(events.at(-1)).toEqual({ name: "tour_closed", tour: "orders", version: 1, step: 1, of: 2 });
  });

  it("typing on the page declines the invitation; Tab does not", async () => {
    const user = userEvent.setup();
    const { writes } = setup(seenWelcome);
    expect(await screen.findByText("Take a quick tour of Orders?", {}, { timeout: 2000 })).toBeInTheDocument();
    await user.tab();
    expect(writes).toEqual([]);
    await act(async () => {
      screen.getByRole("textbox", { name: "Search" }).focus();
    });
    await user.keyboard("a");
    expect(writes).toEqual([{ tour: "orders", version: 1, outcome: "declined" }]);
    await waitFor(() => expect(screen.queryByText("Take a quick tour of Orders?")).toBeNull());
  });

  it("offers nothing when tours are turned off", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup({ ...seenWelcome, offerTours: false });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText(/Take a quick tour/)).toBeNull();
    vi.useRealTimers();
  });
});
