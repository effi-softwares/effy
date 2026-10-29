import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/** Where the chosen width is kept: one width for every activity drawer, on this device. */
const KEY = "effy.activity-drawer.width";
/** Narrower than this and the table stops reading as one. */
export const MIN_DRAWER_WIDTH = 448;
/** The drawer floats 8px off the right edge (`right-2`); it may grow to 8px off the left. */
const INSET = 8;
const STEP = 32;

const maxWidth = () => window.innerWidth - 2 * INSET;
const clamp = (w: number) => Math.round(Math.max(MIN_DRAWER_WIDTH, Math.min(w, maxWidth())));

function read(): number | null {
  try {
    const v = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function write(w: number | null): void {
  try {
    if (w === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, String(w));
  } catch {
    // Private mode: the width lasts as long as the page.
  }
}

/**
 * The activity drawer's width (104), set by dragging its left edge (or the arrow keys on it) and kept on the device.
 * `null` is the default — half the window. A double-click or Enter on the edge goes back to it.
 */
export function useDrawerWidth() {
  const [width, setWidth] = useState<number | null>(() => read());
  const dragging = useRef(false);

  // A window made smaller never leaves the drawer wider than it.
  const [, setViewport] = useState(0);
  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const set = useCallback((w: number | null, keep: boolean) => {
    const next = w === null ? null : clamp(w);
    setWidth(next);
    if (keep) write(next);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    document.body.style.userSelect = "none";
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!dragging.current) return;
    set(window.innerWidth - e.clientX - INSET, false);
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.userSelect = "";
    e.currentTarget.releasePointerCapture(e.pointerId);
    set(window.innerWidth - e.clientX - INSET, true);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // From the width it has now: the chosen one, else what it measures (never below the minimum).
    const current =
      width ?? Math.max(e.currentTarget.parentElement?.getBoundingClientRect().width ?? 0, MIN_DRAWER_WIDTH);
    if (e.key === "ArrowLeft") set(current + STEP, true);
    else if (e.key === "ArrowRight") set(current - STEP, true);
    else if (e.key === "Enter") set(null, true);
    else return;
    e.preventDefault();
  };

  return {
    /** For the drawer's `style`; undefined leaves its default width. */
    style: width === null ? undefined : { width: Math.min(width, maxWidth()) },
    handle: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick: () => set(null, true),
      onKeyDown,
    },
    width,
  };
}
