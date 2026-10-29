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
 * page's colours, sliding in when something is chosen and out when it is cleared. `ActionBarProvider` wraps
 * each console once and owns it; any screen or feature puts its actions there with `useActionBar` (the data
 * table does, for selected rows). One owner at a time: the latest to open it.
 */

interface BarState {
  owner: string;
  open: boolean;
  count: number;
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
const DENSITIES: readonly BarDensity[] = ["normal", "compact", "tight", "scroll"];
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
        if (!next.open && prev && prev.open && prev.owner !== next.owner) return prev;
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
    release: (owner) => setState((prev) => (prev?.owner === owner ? null : prev)),
  }));

  return (
    <Ctx.Provider value={useMemo(() => ({ api, slot, owner: state?.owner ?? null }), [api, slot, state?.owner])}>
      {/* Actions are portalled onto the bar from their own screen, so the density reaches them from up here. */}
      <DensityCtx.Provider value={density}>
        {children}
        <BarShell
          open={state?.open ?? false}
          count={state?.count ?? 0}
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
 * Shows `children` on the bar while `count` > 0 ("3 selected"). Render what it returns. Without a provider (a
 * test, a screen rendered alone) it draws a bar of its own, so the behaviour is the same.
 */
export function useActionBar({
  count,
  label,
  onClear,
  busy = false,
  children,
}: {
  count: number;
  /** Names the bar for assistive tech, e.g. "Selected orders". */
  label: string;
  onClear: () => void;
  busy?: boolean;
  children: ReactNode;
}): ReactNode {
  const ctx = useContext(Ctx);
  const id = useId();
  const open = count > 0;
  const clear = useRef(onClear);
  clear.current = onClear;
  const [ownDensity, setOwnDensity] = useState<BarDensity>("normal");

  const api = ctx?.api;
  const owns = ctx?.owner === id;
  useLayoutEffect(() => {
    // An owner keeps its place while closing, so its actions stay on the bar as it slides away.
    if (api && (open || owns)) api.claim({ owner: id, open, count, label, busy }, () => clear.current());
  }, [api, owns, id, open, count, label, busy]);
  useEffect(() => () => api?.release(id), [api, id]);

  if (!ctx) {
    return (
      <BarShell
        open={open}
        count={count}
        label={label}
        busy={busy}
        onClear={onClear}
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
  count: number;
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
    if (overflows(bar.current) || overflows(actions.current)) onDensity(DENSITIES[DENSITIES.indexOf(density) + 1]!);
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
      <span className="ef-selbar__count" aria-label={`${shown.current} selected`}>
        {density === "tight" || density === "scroll" ? shown.current : `${shown.current} selected`}
      </span>
      <span className="ef-selbar__rule" aria-hidden="true" />
      <div
        ref={(el) => {
          actions.current = el;
          slotRef?.(el);
        }}
        className="ef-selbar__actions"
      >
        {children}
      </div>
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
    </div>,
    document.body,
  );
}

const overflows = (el: HTMLElement | null) => Boolean(el && el.scrollWidth > el.clientWidth + 1);

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

export function ActionBarButton({ className, ...props }: ComponentProps<typeof Button>) {
  const density = useContext(DensityCtx);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(BAR_CONTROL, "shrink-0", DENSITY_CONTROL[density], className)}
      {...props}
    />
  );
}

/** A select's trigger on the bar. */
export function ActionBarSelectTrigger({ className, ...props }: ComponentProps<typeof SelectTrigger>) {
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
