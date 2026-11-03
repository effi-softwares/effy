import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useStore } from "@tanstack/react-store";

import type { ConsoleTourPatch, ConsoleTourStateDTO } from "@effy/shared-types";
import { TourStepView } from "@effy/design-system/ui";

import type { TourDef } from "./define";
import {
  counter,
  EMPTY_TOUR_SENTENCE,
  shouldOffer,
  welcomeFirst,
  isPresent,
  nextShown,
  resolveTarget,
  shownSteps,
  type PageStatus,
  type StepContext,
} from "./engine";
import { createTourStore, patchTourUi, type TourStore, type TourVia } from "./store";

/** What the provider reports for product analytics (106 research R10). Keys and step numbers only. */
export type TourEvent =
  | { name: "tour_started"; tour: string; version: number; via: TourVia }
  | { name: "tour_finished"; tour: string; version: number }
  | { name: "tour_closed"; tour: string; version: number; step: number; of: number }
  | { name: "tour_declined"; tour: string; version: number };

export interface TourProviderProps {
  tours: readonly TourDef[];
  roles: { manager: boolean };
  /** The person's tour state - from `tourStateQueries(...).stateQuery`. */
  state: { data: ConsoleTourStateDTO | undefined; isSuccess: boolean };
  write: (patch: ConsoleTourPatch) => void;
  /** Opens the newest order or product for a tour that needs one; false when there is none (the app says so). */
  openRecord: (kind: "order" | "product") => Promise<boolean>;
  onEvent?: (event: TourEvent) => void;
  /** Warn in the console when a page's tour names something the page does not show (development only). */
  devWarnings?: boolean;
  children: ReactNode;
}

interface TourContextValue {
  tours: readonly TourDef[];
  byKey: ReadonlyMap<string, TourDef>;
  manager: boolean;
  state: ConsoleTourStateDTO | null;
  store: TourStore;
  write: (patch: ConsoleTourPatch) => void;
  openRecord: (kind: "order" | "product") => Promise<boolean>;
  emit: (event: TourEvent) => void;
  start: (key: string, via: TourVia) => void;
  decline: (key: string) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTourContext(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTourContext: wrap the console in <TourProvider>");
  return ctx;
}

/** A screen rendered without tours (a test, a preview) registers nothing and offers nothing. */
export function useOptionalTourContext(): TourContextValue | null {
  return useContext(TourContext);
}

/** Is a menu, palette or dialog open or still closing? Radix marks the rest of the page while it is. */
function openerStillOpen(): boolean {
  return Boolean(
    document.querySelector(
      '[data-aria-hidden="true"], [role="dialog"][data-state="open"]:not([data-slot="tour-card"]), [role="menu"][data-state="open"]',
    ),
  );
}

const OPENER_WAIT_MS = 1500;
const PAGE_WAIT_MS = 15_000;

export function TourProvider({
  tours,
  roles,
  state,
  write,
  openRecord,
  onEvent,
  devWarnings = false,
  children,
}: TourProviderProps) {
  const [store] = useState(createTourStore);
  const byKey = useMemo(() => new Map(tours.map((t) => [t.key, t])), [tours]);
  const manager = roles.manager;
  const emitRef = useRef(onEvent);
  emitRef.current = onEvent;
  const writeRef = useRef(write);
  writeRef.current = write;

  const emit = useCallback((event: TourEvent) => emitRef.current?.(event), []);

  const start = useCallback(
    (key: string, via: TourVia) => {
      if (!byKey.has(key)) return;
      patchTourUi(store, { pendingStart: { key, via, since: Date.now() }, active: null });
    },
    [byKey, store],
  );

  const decline = useCallback(
    (key: string) => {
      const tour = byKey.get(key);
      if (!tour) return;
      writeRef.current({ tour: key, version: tour.version, outcome: "declined" });
      emit({ name: "tour_declined", tour: key, version: tour.version });
      patchTourUi(store, { dismissed: [...store.state.dismissed, key] });
    },
    [byKey, emit, store],
  );

  // A start runs once its page is ready and the menu or dialog that started it has closed (research R7).
  const pending = useStore(store, (s) => s.pendingStart);
  useEffect(() => {
    if (!pending) return;
    let frame = 0;
    const tick = () => {
      const s = store.state;
      const p = s.pendingStart;
      if (!p) return;
      const tour = byKey.get(p.key);
      const waited = Date.now() - p.since;
      if (!tour || waited > PAGE_WAIT_MS) {
        patchTourUi(store, { pendingStart: null });
        return;
      }
      const pageReady = s.page?.status === "ready" && (tour.anyPage || s.page.key === tour.key);
      if (pageReady && (!openerStillOpen() || waited > OPENER_WAIT_MS)) {
        const ctx: StepContext = { manager };
        const first = shownSteps(tour, ctx)[0];
        // Recorded the moment it starts, so a reload mid-tour does not start it again (research R13).
        writeRef.current({ tour: tour.key, version: tour.version, outcome: "closed" });
        emit({ name: "tour_started", tour: tour.key, version: tour.version, via: p.via });
        patchTourUi(store, {
          pendingStart: null,
          dismissed: s.dismissed.includes(tour.key) ? s.dismissed : [...s.dismissed, tour.key],
          active: { key: tour.key, via: p.via, index: first ?? 0, empty: first === undefined },
        });
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pending, byKey, emit, manager, store]);

  // A running tour ends (as closed) when the page changes under it.
  const pageKey = useStore(store, (s) => s.page?.key ?? null);
  const lastPageKey = useRef(pageKey);
  useEffect(() => {
    if (lastPageKey.current === pageKey) return;
    lastPageKey.current = pageKey;
    if (store.state.active) patchTourUi(store, { active: null });
  }, [pageKey, store]);

  // Development: a page's tour that names something the page never shows.
  const pageStatus = useStore(store, (s) => s.page?.status ?? null);
  useEffect(() => {
    if (!devWarnings || pageStatus !== "ready" || !pageKey) return;
    const tour = byKey.get(pageKey);
    if (!tour) return;
    const t = window.setTimeout(() => {
      for (const step of tour.steps) {
        if (step.managersOnly || step.shownWhen || step.target === null) continue;
        if (resolveTarget(step.target) === undefined) console.warn(`[tours] ${tour.key}: nothing on the page carries`, step.target);
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [devWarnings, pageStatus, pageKey, byKey]);

  const value = useMemo<TourContextValue>(
    () => ({
      tours,
      byKey,
      manager,
      state: state.isSuccess && state.data ? state.data : null,
      store,
      write: (patch) => writeRef.current(patch),
      openRecord,
      emit,
      start,
      decline,
    }),
    [tours, byKey, manager, state.isSuccess, state.data, store, openRecord, emit, start, decline],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <AutoStart />
      <ActiveTour />
    </TourContext.Provider>
  );
}

/** How long a loaded page shows before its tour starts, so passing through a page on the way to another starts nothing. */
const SETTLE_MS = 700;

/**
 * The first time a person reaches a page, its tour starts by itself (106 FR-002; operator decision 2026-11-03): once
 * the page has loaded and settled, and - through `start` - once any menu or dialog the person opened has closed. The
 * Welcome tour comes first (FR-003). Nothing starts while a tour runs, waits, or All tours is open.
 */
function AutoStart() {
  const { tours, byKey, state, store, start } = useTourContext();
  const ui = useStore(store, (s) => ({
    page: s.page,
    busy: s.active !== null || s.pendingStart !== null || s.allToursOpen,
    dismissed: s.dismissed,
  }));

  let next: string | null = null;
  if (state && !ui.busy && ui.page?.status === "ready") {
    const welcome = welcomeFirst(tours, state);
    const pageTour = byKey.get(ui.page.key);
    const tour = welcome ?? (pageTour && shouldOffer(pageTour, state) ? pageTour : null);
    if (tour && !ui.dismissed.includes(tour.key)) next = tour.key;
  }

  useEffect(() => {
    if (!next) return;
    const t = window.setTimeout(() => start(next, "auto"), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [next, start]);

  return null;
}

/** Re-renders when the page's DOM or layout changes, so a step follows what is on screen. */
function useDomTick(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const bump = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTick((t) => t + 1));
    };
    const observer = new MutationObserver(bump);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden", "inert", "class", "style", "data-state", "data-tour"],
    });
    window.addEventListener("resize", bump);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", bump);
    };
  }, [active]);
  return tick;
}

function ActiveTour() {
  const { byKey, manager, store, write, emit } = useTourContext();
  const active = useStore(store, (s) => s.active);
  const tour = active ? byKey.get(active.key) : undefined;
  useDomTick(Boolean(active));
  const ctx: StepContext = { manager };

  const step = tour && active && !active.empty ? tour.steps[active.index] : undefined;
  const target = step ? resolveTarget(step.target) : null;

  const end = useCallback(
    (how: "finished" | "closed") => {
      const a = store.state.active;
      const t = a ? byKey.get(a.key) : undefined;
      if (!a || !t) return;
      if (how === "finished") {
        write({ tour: t.key, version: t.version, outcome: "finished" });
        emit({ name: "tour_finished", tour: t.key, version: t.version });
      } else {
        const c = a.empty ? { step: 1, of: 1 } : counter(t, a.index, { manager });
        emit({ name: "tour_closed", tour: t.key, version: t.version, step: c.step, of: c.of });
        // Closing the Welcome tour early means "not now": the page's own tour waits for the next visit.
        const page = store.state.page;
        if (t.anyPage && page && !store.state.dismissed.includes(page.key)) {
          patchTourUi(store, { dismissed: [...store.state.dismissed, page.key] });
        }
      }
      patchTourUi(store, { active: null });
    },
    [byKey, emit, manager, store, write],
  );

  const go = useCallback(
    (dir: 1 | -1) => {
      const a = store.state.active;
      const t = a ? byKey.get(a.key) : undefined;
      if (!a || !t || a.empty) return;
      const next = nextShown(t, a.index, dir, { manager });
      if (next === null) {
        if (dir === 1) end("finished");
        return;
      }
      patchTourUi(store, { active: { ...a, index: next } });
    },
    [byKey, end, manager, store],
  );

  // The thing the step points at went away (a live update, a resize): on to the next one shown, or the end.
  useEffect(() => {
    if (!active || active.empty || !tour || !step || target !== undefined) return;
    const next = nextShown(tour, active.index, 1, ctx);
    if (next === null) end("closed");
    else patchTourUi(store, { active: { ...active, index: next } });
  });

  // Bring each step's part into view - any scrolling container, not just the window (research R8).
  const index = active?.index;
  useEffect(() => {
    if (!target) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key, index]);

  if (!active || !tour) return null;

  const above = Array.from(document.querySelectorAll<HTMLElement>("[data-tour-above]")).filter((el) => isPresent(el));

  if (active.empty || !step) {
    return (
      <TourStepView
        open
        target={null}
        above={above}
        title={tour.title}
        text={EMPTY_TOUR_SENTENCE}
        step={1}
        of={1}
        nextLabel="Done"
        onNext={() => end("closed")}
        onClose={() => end("closed")}
      />
    );
  }
  if (target === undefined) return null;

  const { step: n, of } = counter(tour, active.index, ctx);
  const hasBack = nextShown(tour, active.index, -1, ctx) !== null;
  return (
    <TourStepView
      open
      target={target}
      above={above}
      side={step.side}
      title={step.title}
      text={step.text}
      step={n}
      of={of}
      onBack={hasBack ? () => go(-1) : undefined}
      onNext={() => go(1)}
      onClose={() => end("closed")}
      nextLabel={nextShown(tour, active.index, 1, ctx) === null ? "Done" : "Next"}
    />
  );
}

export interface TourListItem {
  tour: TourDef;
  seen: "new" | "seen" | "updated";
}

/** For the console's own controls: start tours, see the page's tour and the list (Help, search, All tours). */
const NO_STORE = createTourStore();

export function useTours() {
  const ctx = useOptionalTourContext();
  const store = ctx?.store ?? NO_STORE;
  const page = useStore(store, (s) => s.page);
  if (!ctx) {
    return {
      page: null,
      pageStatus: "loading" as PageStatus,
      list: [] as TourListItem[],
      start: () => {},
      startPage: () => {},
      openAllTours: () => {},
    };
  }
  const { tours, state, start } = ctx;
  const list: TourListItem[] = tours.map((tour) => {
    const seen = state?.seen[tour.key];
    return { tour, seen: !seen ? "new" : seen.version < tour.version ? "updated" : "seen" };
  });
  return {
    page,
    pageStatus: (page?.status ?? "loading") as PageStatus,
    list,
    start,
    startPage: (via: TourVia) => {
      if (page) start(page.key, via);
    },
    openAllTours: () => patchTourUi(store, { allToursOpen: true }),
  };
}
