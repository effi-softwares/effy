"use client";

/**
 * One toast, drawn (feature 120): its surface, its mark (or picture), its words, a count for a repeat, up to two
 * buttons and - on a toast that stays - a close button. Pointer over or focus in pauses its time; Escape closes it; it
 * can be swiped away. Loaded apart from the Toaster (research R7): the storefront's guest pages carry only the rules
 * and the live regions on first load, and fetch this when the page is idle or a toast arrives.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
} from "react";

import { toaster } from "./instance";
import { CloseIcon, Mark } from "./marks";
import { bindMotion, type Motion } from "./motion";
import type { Position, Toast } from "./types";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export interface ToastViewProps {
  toast: Toast;
  position: Position;
  elRef: MutableRefObject<HTMLDivElement | null>;
  returnTo: MutableRefObject<HTMLElement | null>;
}

export function ToastView({ toast: t, position, elRef, returnTo }: ToastViewProps) {
  const surface = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const motion = useRef<Motion | null>(null);
  const m = t.message;
  const open = t.phase === "open";
  const sticky = t.life === 0 && m.kind !== "loading";

  useIsoLayoutEffect(() => {
    const root = elRef.current;
    if (!root || !surface.current || !content.current) return;
    motion.current = bindMotion({
      root,
      surface: surface.current,
      content: content.current,
      anchor: position.endsWith("right") ? 1 : position.endsWith("center") ? 0.5 : 0,
      edge: position.startsWith("top") ? -1 : 1,
      reduced: reducedMotion,
    });
    return () => {
      motion.current?.destroy();
      motion.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useIsoLayoutEffect(() => {
    motion.current?.sync({ phase: t.phase, kind: m.kind, count: t.count });
  }, [t.phase, m.kind, t.count, t.version]);

  // A new title rolls in; the old one rolls out above it.
  const [ghost, setGhost] = useState<{ title: string; key: number } | null>(null);
  const shownTitle = useRef(m.title);
  useIsoLayoutEffect(() => {
    if (shownTitle.current === m.title) return;
    if (open && !reducedMotion()) setGhost({ title: shownTitle.current, key: t.version });
    shownTitle.current = m.title;
  }, [m.title]);

  // Pause while pointed at or focused.
  const hovered = useRef(false);
  const focused = useRef(false);
  const holdTime = () => (hovered.current || focused.current ? toaster.pause() : toaster.resume());
  useEffect(
    () => () => {
      if (hovered.current || focused.current) toaster.resume();
    },
    [],
  );

  const close = (immediate = false) => {
    toaster.dismiss(t.owner, { immediate });
    const back = returnTo.current;
    returnTo.current = null;
    if (back && elRef.current?.contains(document.activeElement)) back.focus?.();
  };

  // Swipe it away.
  const drag = useRef<{ x: number; y: number; at: number; id: number; moved: boolean } | null>(null);
  const edge = position.startsWith("top") ? -1 : 1;
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, at: e.timeStamp, id: e.pointerId, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    let dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    if (dy * edge < 0) dy *= 0.2; // pulling it into the screen resists
    motion.current?.drag(dx, dy);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const toward = dy * edge;
    const speed = Math.hypot(dx, dy) / Math.max(1, e.timeStamp - d.at);
    const away = toward > 48 || Math.abs(dx) > 80 || (speed > 0.5 && (toward > 16 || Math.abs(dx) > 16));
    if (away) motion.current?.fling(dx, toward > 0 ? dy : 0, () => close(true));
    else motion.current?.release();
  };

  return (
    <div
      ref={elRef}
      className="ef-toast"
      data-kind={m.kind}
      data-phase={t.phase}
      data-edge={edge === 1 ? "bottom" : "top"}
      data-tour-above=""
      tabIndex={-1}
      onPointerEnter={() => {
        hovered.current = true;
        holdTime();
      }}
      onPointerLeave={() => {
        hovered.current = false;
        holdTime();
      }}
      onFocus={() => {
        focused.current = true;
        holdTime();
      }}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        focused.current = false;
        holdTime();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        close();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        motion.current?.release();
      }}
    >
      <div ref={surface} className="ef-toast-surface" aria-hidden="true" />
      <div ref={content} className="ef-toast-content" data-progress={m.progress !== undefined ? "" : undefined}>
        <span className="ef-toast-lead">
          {m.image ? <img className="ef-toast-image" src={m.image} alt="" width={28} height={28} /> : <Mark kind={m.kind} />}
        </span>
        <div className="ef-toast-copy">
          {ghost ? (
            <p className="ef-toast-ghost" key={ghost.key} aria-hidden="true" onAnimationEnd={() => setGhost(null)}>
              {ghost.title}
            </p>
          ) : null}
          <div className="ef-toast-text" key={m.title}>
            <p className="ef-toast-title">
              {m.title}
              {t.count > 1 ? (
                <span className="ef-toast-count" key={t.count}>
                  ×{t.count}
                </span>
              ) : null}
              {m.meta ? <span className="ef-toast-meta">{m.meta}</span> : null}
            </p>
            {m.description ? <p className="ef-toast-description">{m.description}</p> : null}
          </div>
        </div>
        {m.secondary || m.action || sticky ? (
          <div className="ef-toast-actions">
            {m.secondary ? (
              <button type="button" className="ef-toast-button" data-variant="quiet" tabIndex={open ? 0 : -1} onClick={() => toaster.act("secondary")}>
                {m.secondary.label}
              </button>
            ) : null}
            {m.action ? (
              <button type="button" className="ef-toast-button" data-variant="main" tabIndex={open ? 0 : -1} onClick={() => toaster.act("action")}>
                {m.action.label}
              </button>
            ) : null}
            {sticky ? (
              <button type="button" className="ef-toast-close" aria-label="Close" tabIndex={open ? 0 : -1} onClick={() => close()}>
                <CloseIcon />
              </button>
            ) : null}
          </div>
        ) : null}
        {m.progress !== undefined ? (
          <span className="ef-toast-progress" aria-hidden="true">
            <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, m.progress))})` }} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
