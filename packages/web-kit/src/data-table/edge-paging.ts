import { useEffect, useRef, useState, type RefObject } from "react";

/** How far past an edge a wheel or a drag must keep going before the page turns. */
const PULL_PX = 240;
/** A gesture that reaches an edge must rest there this long first, so one fling never runs into the next page. */
const SETTLE_MS = 250;
/** No second turn straight after the first. */
const COOLDOWN_MS = 900;
/** A pause this long ends a pull. */
const IDLE_MS = 400;

export type PullDirection = "next" | "back";

/**
 * Scrolling past the end of a page turns to the next one, and past the top back to the previous one (103). The
 * scroller is the table's own body when it scrolls (md and up) and the window otherwise (phones). Returns the
 * direction being pulled, for a hint, and moves the new page's scroll to its start (next) or its end (back).
 */
export function useEdgePaging({
  frame,
  scroller,
  canNext,
  canBack,
  onNext,
  onBack,
  busy,
  pageKey,
}: {
  frame: RefObject<HTMLElement | null>;
  scroller: RefObject<HTMLElement | null>;
  canNext: boolean;
  canBack: boolean;
  onNext: () => void;
  onBack: () => void;
  /** A page is loading: no turn until it has arrived. */
  busy: boolean;
  /** Changes when a new page's rows are shown. */
  pageKey: unknown;
}): PullDirection | null {
  const [pull, setPull] = useState<PullDirection | null>(null);
  const latest = useRef({ canNext, canBack, onNext, onBack, busy });
  latest.current = { canNext, canBack, onNext, onBack, busy };
  const turned = useRef<PullDirection | null>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let acc = 0;
    let dir: PullDirection | null = null;
    let edgeSince = 0;
    let lastAt = 0;
    let cooldownUntil = 0;
    let touchY: number | null = null;

    const box = () => {
      const s = scroller.current;
      if (s && s.scrollHeight > s.clientHeight + 1) {
        return { top: s.scrollTop <= 0, bottom: s.scrollTop + s.clientHeight >= s.scrollHeight - 1 };
      }
      const d = document.scrollingElement ?? document.documentElement;
      return { top: d.scrollTop <= 0, bottom: d.scrollTop + window.innerHeight >= d.scrollHeight - 1 };
    };

    const reset = () => {
      acc = 0;
      dir = null;
      setPull(null);
    };

    const push = (delta: number) => {
      const now = Date.now();
      const { canNext, canBack, onNext, onBack, busy } = latest.current;
      if (now - lastAt > IDLE_MS) reset();
      lastAt = now;
      if (busy || now < cooldownUntil) return;
      const want: PullDirection | null = delta > 0 ? "next" : delta < 0 ? "back" : null;
      const edge = box();
      const atEdge = (want === "next" && edge.bottom && canNext) || (want === "back" && edge.top && canBack);
      if (!want || !atEdge) {
        edgeSince = 0;
        reset();
        return;
      }
      if (!edgeSince) edgeSince = now;
      if (now - edgeSince < SETTLE_MS) return;
      if (dir !== want) {
        acc = 0;
        dir = want;
        setPull(want);
      }
      acc += Math.abs(delta);
      if (acc < PULL_PX) return;
      turned.current = want;
      cooldownUntil = now + COOLDOWN_MS;
      edgeSince = 0;
      reset();
      if (want === "next") onNext();
      else onBack();
    };

    const onWheel = (e: WheelEvent) => push(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY);
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchY === null || y === undefined) return;
      push(touchY - y);
      touchY = y;
    };
    const onTouchEnd = () => {
      touchY = null;
    };

    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [frame, scroller]);

  // The page this turn asked for has arrived: start it at its top, or - going back - at its end.
  useEffect(() => {
    const dir = turned.current;
    if (!dir || busy) return;
    turned.current = null;
    const s = scroller.current;
    if (s && s.scrollHeight > s.clientHeight + 1) {
      s.scrollTop = dir === "next" ? 0 : s.scrollHeight;
      return;
    }
    frame.current?.scrollIntoView?.({ block: dir === "next" ? "start" : "end" });
  }, [pageKey, busy, frame, scroller]);

  return pull;
}
