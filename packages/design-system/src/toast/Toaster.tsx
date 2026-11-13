"use client";

/**
 * Where toasts are drawn (spec FR-012-FR-013, FR-023-FR-027; contracts/toast-api.md). Mount exactly one per app.
 *
 * Two live regions are always on the page, so every message is read out without the toast taking focus - even before
 * the toast's drawing code has loaded. That code (`ToastView`) is fetched when the page is idle, or at once when a
 * toast arrives first, so it costs a storefront guest page nothing on first load (research R7). Alt+T moves focus into
 * the visible toast.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";

import { toaster } from "./instance";
import type { Position, SoundPolicy } from "./types";
import type { ToastViewProps } from "./ToastView";

type View = ComponentType<ToastViewProps>;
let loadedView: View | null = null;
let loading: Promise<View> | null = null;

/** Fetch the toast's drawing code once. */
export function loadToastView(): Promise<View> {
  loading ??= import("./ToastView").then((m) => (loadedView = m.ToastView));
  return loading;
}

let mounted = 0;

export interface ToasterProps {
  position?: Position;
  /** Who hears a toast's tone (research R4). */
  sound?: SoundPolicy;
}

export function Toaster({ position = "bottom-right", sound = "off" }: ToasterProps) {
  const state = useSyncExternalStore(toaster.subscribe, toaster.getState, toaster.getState);
  const [duplicate, setDuplicate] = useState(false);
  const toastEl = useRef<HTMLDivElement | null>(null);
  const [View, setView] = useState<View | null>(() => loadedView);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mounted += 1;
    if (mounted > 1) {
      setDuplicate(true);
      console.error("Toaster: an app mounts exactly one Toaster; this one draws nothing.");
    }
    return () => {
      mounted -= 1;
    };
  }, []);

  useEffect(() => toaster.configure({ sound }), [sound]);
  useEffect(() => {
    if (sound !== "on" && sound !== "opt-in") return;
    let stop: (() => void) | undefined;
    let gone = false;
    void import("./sound").then(
      (s) => {
        if (!gone) stop = s.unlockOnFirstGesture();
      },
      () => undefined,
    );
    return () => {
      gone = true;
      stop?.();
    };
  }, [sound]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => toaster.configure({ reducedMotion: mq.matches });
    set();
    mq.addEventListener?.("change", set);
    return () => mq.removeEventListener?.("change", set);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== "KeyT" || !toastEl.current) return;
      e.preventDefault();
      if (!toastEl.current.contains(document.activeElement)) returnTo.current = document.activeElement as HTMLElement | null;
      toastEl.current.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Fetch the drawing code when the page is idle - or now, if a toast is already waiting to be drawn.
  const wanted = state.visible !== null;
  useEffect(() => {
    if (View) return;
    let gone = false;
    const load = () => void loadToastView().then((v) => !gone && setView(() => v), () => undefined);
    if (wanted) load();
    else if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(load);
      return () => {
        gone = true;
        window.cancelIdleCallback(handle);
      };
    } else {
      const handle = window.setTimeout(load, 1500);
      return () => {
        gone = true;
        window.clearTimeout(handle);
      };
    }
    return () => {
      gone = true;
    };
  }, [View, wanted]);

  if (duplicate) return null;

  return (
    <div className="ef-toast-viewport" data-position={position}>
      <div className="ef-toast-sr" role="status" aria-live="polite" aria-atomic="true">
        {state.liveText.polite}
      </div>
      <div className="ef-toast-sr" role="alert" aria-live="assertive" aria-atomic="true">
        {state.liveText.assertive}
      </div>
      {state.visible && View ? (
        <View key={state.visible.key} toast={state.visible} position={position} elRef={toastEl} returnTo={returnTo} />
      ) : null}
    </div>
  );
}
