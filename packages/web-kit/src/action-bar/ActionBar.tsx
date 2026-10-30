import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { X } from "lucide-react";

import { cn } from "@effy/design-system";
import { Button, SelectTrigger } from "@effy/design-system/ui";

/**
 * The console's ONE floating action bar: bottom centre of the window, over every screen, in the inverse of the
 * page's colours, one height, sliding in when it opens and out when it closes. `ActionBarProvider` wraps each
 * console once and owns it; a screen puts its CONTENT there with `useActionBar` and nothing else — where the bar
 * sits, how tall it is and how it moves are the bar's, the same on every page. Two kinds of content: a selection
 * (`count` — the bar says "3 selected", shows the actions and a clear button; the data table does this) or a page's
 * own controls (no `count`, opened with `open` — the product review's decision). One owner at a time: the latest
 * to open it.
 */

interface BarState {
  owner: string;
  open: boolean;
  /** A selection's size; null for a page's own controls (no count, no clear). */
  count: number | null;
  label: string;
  busy: boolean;
}

interface ActionBarApi {
  claim: (state: BarState, onClear: () => void) => void;
  release: (owner: string) => void;
}

interface ActionBarContext {
  /** Stable for the provider's life: effects key on it, never on the context object. */
  api: ActionBarApi;
  slot: HTMLElement | null;
  owner: string | null;
}

const Ctx = createContext<ActionBarContext | null>(null);

/**
 * How tightly the bar is packed. It is ALWAYS one row: when its contents do not fit the window it steps down —
 * `compact` (smaller text, tighter gaps), then `tight` (smaller still; the count says just the number), then
 * `scroll` (the actions scroll sideways inside the row). A wider window starts again from `normal`.
 */
export type BarDensity = "normal" | "compact" | "tight" | "scroll";
const DENSITIES: readonly BarDensity[] = [
  "normal",
  "compact",
  "tight",
  "scroll",
];
const DensityCtx = createContext<BarDensity>("normal");

export function ActionBarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BarState | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const onClear = useRef<() => void>(() => {});
  const [density, setDensity] = useState<BarDensity>("normal");
  const [api] = useState<ActionBarApi>(() => ({
    claim: (next, clear) => {
      onClear.current = clear;
      setState((prev) => {
        // A closed bar does not take it from an open one.
        if (!next.open && prev && prev.open && prev.owner !== next.owner)
          return prev;
        if (
          prev &&
          prev.owner === next.owner &&
          prev.open === next.open &&
          prev.count === next.count &&
          prev.label === next.label &&
          prev.busy === next.busy
        )
          return prev;
        return next;
      });
    },
    release: (owner) =>
      setState((prev) => (prev?.owner === owner ? null : prev)),
  }));

  return (
    <Ctx.Provider
      value={useMemo(
        () => ({ api, slot, owner: state?.owner ?? null }),
        [api, slot, state?.owner],
      )}
    >
      {/* Actions are portalled onto the bar from their own screen, so the density reaches them from up here. */}
      <DensityCtx.Provider value={density}>
        {children}
        <BarShell
          open={state?.open ?? false}
          count={state?.count ?? null}
          label={state?.label ?? "Actions"}
          busy={state?.busy}
          onClear={() => onClear.current()}
          slotRef={setSlot}
          density={density}
          onDensity={setDensity}
          contentKey={state?.owner}
        />
      </DensityCtx.Provider>
    </Ctx.Provider>
  );
}

/**
 * Puts `children` on the bar. For a selection, pass `count`: the bar is open while it is above 0 and says
 * "3 selected" before the actions, with a clear button after them. For a page's own controls, leave `count` out
 * and pass `open`. Render what it returns. Without a provider (a test, a screen rendered alone) it draws a bar of
 * its own, so the behaviour is the same.
 */
export function useActionBar({
  count = null,
  open: openProp,
  label,
  onClear,
  busy = false,
  children,
}: {
  /** A selection's size. */
  count?: number | null;
  /** For a page's own controls: whether the bar shows them. A selection opens while `count` > 0. */
  open?: boolean;
  /** Names the bar for assistive tech, e.g. "Selected orders", "Decision". */
  label: string;
  /** A selection's clear button. */
  onClear?: () => void;
  busy?: boolean;
  children: ReactNode;
}): ReactNode {
  const ctx = useContext(Ctx);
  const id = useId();
  const open = openProp ?? (count ?? 0) > 0;
  const clear = useRef(onClear ?? (() => {}));
  clear.current = onClear ?? (() => {});
  const [ownDensity, setOwnDensity] = useState<BarDensity>("normal");

  const api = ctx?.api;
  const owns = ctx?.owner === id;
  useLayoutEffect(() => {
    // An owner keeps its place while closing, so its actions stay on the bar as it slides away.
    if (api && (open || owns))
      api.claim({ owner: id, open, count, label, busy }, () => clear.current());
  }, [api, owns, id, open, count, label, busy]);
  useEffect(() => () => api?.release(id), [api, id]);

  if (!ctx) {
    return (
      <BarShell
        open={open}
        count={count}
        label={label}
        busy={busy}
        onClear={() => clear.current()}
        density={ownDensity}
        onDensity={setOwnDensity}
      >
        <DensityCtx.Provider value={ownDensity}>{children}</DensityCtx.Provider>
      </BarShell>
    );
  }
  return ctx.slot && ctx.owner === id ? createPortal(children, ctx.slot) : null;
}

function BarShell({
  open,
  count,
  label,
  busy,
  onClear,
  slotRef,
  density,
  onDensity,
  contentKey,
  children,
}: {
  open: boolean;
  count: number | null;
  label: string;
  busy?: boolean;
  onClear: () => void;
  slotRef?: (el: HTMLElement | null) => void;
  density: BarDensity;
  onDensity: (d: BarDensity) => void;
  /** Changes when other actions take the bar: it fits them afresh. */
  contentKey?: unknown;
  children?: ReactNode;
}) {
  // While it slides out it keeps saying what it said, not "0 selected".
  const shown = useRef(count);
  if (open) shown.current = count;
  const selection = shown.current !== null;
  const bar = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement | null>(null);

  // One row, always: step the density down until the row fits; a wider window (or new actions) starts over.
  // (Order matters: on opening, or for new actions, start again from full size, then measure.)
  useLayoutEffect(() => {
    if (!open) return;
    const reset = () => onDensity("normal");
    reset();
    window.addEventListener("resize", reset);
    return () => window.removeEventListener("resize", reset);
  }, [open, contentKey, onDensity]);
  useLayoutEffect(() => {
    if (!open || density === "scroll") return;
    if (overflows(bar.current) || overflows(actions.current))
      onDensity(DENSITIES[DENSITIES.indexOf(density) + 1]!);
  });

  if (typeof document === "undefined") return null;
  const small = density !== "normal";
  return createPortal(
    <div
      ref={bar}
      role="region"
      aria-label={label}
      aria-hidden={!open || undefined}
      inert={!open}
      data-state={open ? "open" : "closed"}
      data-density={density}
      className="ef-selbar"
    >
      {selection ? (
        <>
          <span
            className="ef-selbar__count"
            aria-label={`${shown.current} selected`}
          >
            {density === "tight" || density === "scroll"
              ? shown.current
              : `${shown.current} selected`}
          </span>
          <span className="ef-selbar__rule" aria-hidden="true" />
        </>
      ) : null}
      <div
        ref={(el) => {
          actions.current = el;
          slotRef?.(el);
        }}
        className="ef-selbar__actions"
      >
        {children}
      </div>
      {selection ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          disabled={busy}
          onClick={onClear}
          className={cn(BAR_CONTROL, small && "size-8")}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>,
    document.body,
  );
}

/** How tightly the bar is packed right now, for content that drops what it can spare as the bar steps down. */
export function useActionBarDensity(): BarDensity {
  return useContext(DensityCtx);
}

const overflows = (el: HTMLElement | null) =>
  Boolean(el && el.scrollWidth > el.clientWidth + 1);

/** A control on the bar: outlined in the bar's own colour, whatever the page's theme. */
const BAR_CONTROL =
  "border border-background/25 bg-transparent text-background shadow-none hover:bg-background/10 hover:text-background dark:bg-transparent dark:hover:bg-background/10 disabled:opacity-40";

/** The size a control takes at each density (the bar steps down; it never wraps). */
const DENSITY_CONTROL: Record<BarDensity, string> = {
  normal: "",
  compact: "h-8 px-2.5 text-xs",
  tight: "h-7 px-2 text-xs",
  scroll: "h-7 px-2 text-xs",
};

export function ActionBarButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  const density = useContext(DensityCtx);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        BAR_CONTROL,
        "shrink-0",
        DENSITY_CONTROL[density],
        className,
      )}
      {...props}
    />
  );
}

/** A select's trigger on the bar. */
export function ActionBarSelectTrigger({
  className,
  ...props
}: ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      size="sm"
      className={cn(
        BAR_CONTROL,
        "shrink-0 data-[placeholder]:text-background/70 [&_svg]:text-background/70",
        DENSITY_CONTROL[useContext(DensityCtx)],
        className,
      )}
      {...props}
    />
  );
}
