/**
 * The toast's rules (spec FR-006-FR-012, research R3, data-model.md "Transitions").
 *
 * One toast is visible at a time. A new message takes it over in place - except that a failure still on screen is
 * never replaced by a lesser message: that message waits (newest only) until the failure is closed. Only the caller
 * that owns the visible toast may change it; a caller that has lost it may still report a failure, never anything else.
 *
 * Pure over an injected clock and an injected tone player, so every rule is a unit test with fake time.
 */
import { nextLive, regionFor, spokenText } from "./announce";
import type {
  Kind,
  Message,
  PromiseMessages,
  SoundPolicy,
  Toast,
  ToastButton,
  ToasterState,
  ToastOptions,
  ToastPatch,
} from "./types";

export interface Clock {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface ToasterDeps {
  clock?: Clock;
  /** Called on every appearance and change of words; decides by policy whether a tone plays. */
  cue?: (kind: Kind, policy: SoundPolicy, asked: boolean) => void;
}

/** How long a toast lives when the caller does not say. */
export const LIFE_MS = 5000;
/** The mark arrives, then the message opens. */
export const ENTER_MS = 320;
/** The message folds back into the mark and leaves. */
export const CLOSE_MS = 340;
/** With reduced motion the toast only fades. */
export const FADE_OUT_MS = 120;
/** A repeated announcement is written this long after the region is cleared. */
export const REANNOUNCE_MS = 60;

const RANK: Record<Kind, number> = { error: 3, warning: 2, success: 1, info: 1, loading: 1 };

const realClock: Clock = {
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

function lifeOf(m: Message): number {
  if (m.duration !== undefined) return Math.max(0, m.duration);
  if (m.kind === "error" || m.kind === "loading" || m.action || m.secondary) return 0;
  return LIFE_MS;
}

function toMessage(kind: Kind, title: string, o: ToastOptions = {}): Message {
  const m: Message = { kind, title };
  if (o.description !== undefined) m.description = o.description;
  if (o.action) m.action = o.action;
  if (o.secondary) m.secondary = o.secondary;
  if (o.progress !== undefined) m.progress = o.progress;
  if (o.image !== undefined) m.image = o.image;
  if (o.meta !== undefined) m.meta = o.meta;
  if (o.duration !== undefined) m.duration = o.duration;
  if (o.sound !== undefined) m.sound = o.sound;
  return m;
}

function applyPatch(m: Message, p: ToastPatch): Message {
  const next: Message = { ...m };
  if (p.kind !== undefined) next.kind = p.kind;
  if (p.title !== undefined) next.title = p.title;
  if (p.duration !== undefined) next.duration = p.duration;
  if (p.sound !== undefined) next.sound = p.sound;
  const optional = ["description", "action", "secondary", "progress", "image", "meta"] as const;
  for (const key of optional) {
    const v = p[key];
    if (v === undefined) continue;
    if (v === null) delete next[key];
    else (next as unknown as Record<string, unknown>)[key] = v;
  }
  return next;
}

const hasButtons = (m: Message) => Boolean(m.action || m.secondary);

/** Same kind and words, no buttons: shown again as a count, not as a new toast (FR-009). */
function isRepeat(a: Message, b: Message): boolean {
  return (
    a.kind === b.kind &&
    a.title === b.title &&
    (a.description ?? "") === (b.description ?? "") &&
    !hasButtons(a) &&
    !hasButtons(b) &&
    a.progress === undefined &&
    b.progress === undefined
  );
}

/** Only the bar moved: no announcement, no tone (FR-018, FR-023). */
function isProgressOnly(p: ToastPatch): boolean {
  return Object.keys(p).every((k) => k === "progress");
}

export function createToaster(deps: ToasterDeps = {}) {
  const clock = deps.clock ?? realClock;
  const cue = deps.cue ?? (() => undefined);

  let state: ToasterState = { visible: null, liveText: { polite: "", assertive: "" } };
  let waiting: { message: Message; caller: string } | null = null;
  let policy: SoundPolicy = "off";
  let reducedMotion = false;
  let counter = 0;
  let keys = 0;

  // Life of the visible toast.
  let phaseTimer: unknown = null;
  let lifeTimer: unknown = null;
  let lifeLeft = 0;
  let lifeStartedAt = 0;
  let paused = false;
  let reannounceTimer: unknown = null;

  /** The last message each caller sent, so a stale caller's late failure can still be told (FR-008). */
  const lastByCaller = new Map<string, Message>();
  const remember = (caller: string, m: Message) => {
    lastByCaller.delete(caller);
    lastByCaller.set(caller, m);
    if (lastByCaller.size > 50) lastByCaller.delete(lastByCaller.keys().next().value as string);
  };

  const subscribers = new Set<() => void>();
  const emit = () => subscribers.forEach((fn) => fn());
  const setState = (next: Partial<ToasterState>) => {
    state = { ...state, ...next };
    emit();
  };
  const setVisible = (visible: Toast | null) => setState({ visible });

  function announce(m: Message) {
    clock.clearTimer(reannounceTimer);
    reannounceTimer = null;
    const { now, later } = nextLive(state.liveText, regionFor(m.kind), spokenText(m));
    setState({ liveText: now });
    if (later) {
      reannounceTimer = clock.setTimer(() => {
        reannounceTimer = null;
        setState({ liveText: later });
      }, REANNOUNCE_MS);
    }
  }

  function sound(m: Message) {
    cue(m.kind, policy, m.sound === true);
  }

  function clearTimers() {
    clock.clearTimer(phaseTimer);
    clock.clearTimer(lifeTimer);
    phaseTimer = null;
    lifeTimer = null;
  }

  function startLife() {
    clock.clearTimer(lifeTimer);
    lifeTimer = null;
    const v = state.visible;
    if (!v || v.phase !== "open" || paused || lifeLeft <= 0) return;
    lifeStartedAt = clock.now();
    lifeTimer = clock.setTimer(() => {
      lifeTimer = null;
      close();
    }, lifeLeft);
  }

  function restartLife(total: number) {
    lifeLeft = total;
    startLife();
  }

  function create(message: Message, caller: string) {
    clearTimers();
    const toast: Toast = {
      key: `toast-${++keys}`,
      message,
      owner: caller,
      count: 1,
      phase: reducedMotion ? "open" : "entering",
      life: lifeOf(message),
      version: 1,
    };
    lifeLeft = toast.life;
    remember(caller, message);
    setVisible(toast);
    announce(message);
    sound(message);
    if (toast.phase === "entering") {
      phaseTimer = clock.setTimer(() => {
        phaseTimer = null;
        const v = state.visible;
        if (!v || v.key !== toast.key || v.phase !== "entering") return;
        setVisible({ ...v, phase: "open" });
        startLife();
      }, ENTER_MS);
    } else {
      startLife();
    }
  }

  /** Change the visible toast in place; reopen it if it was closing. */
  function replace(message: Message, caller: string, opts: { quiet?: boolean } = {}) {
    const v = state.visible;
    if (!v) return create(message, caller);
    let phase = v.phase;
    if (phase === "closing") {
      clearTimers();
      phase = "open";
    }
    const next: Toast = { ...v, message, owner: caller, count: 1, phase, life: lifeOf(message), version: v.version + 1 };
    remember(caller, message);
    setVisible(next);
    restartLife(next.life);
    if (!opts.quiet) {
      announce(message);
      sound(message);
    }
  }

  /** A message from a caller that does not own the visible toast. */
  function offer(message: Message, caller: string) {
    const v = state.visible;
    if (!v) return create(message, caller);
    const live = v.phase !== "closing";
    if (live && isRepeat(v.message, message)) {
      const next: Toast = { ...v, owner: caller, count: v.count + 1, version: v.version + 1 };
      remember(caller, message);
      setVisible(next);
      restartLife(next.life);
      announce(message);
      sound(message);
      return;
    }
    if (live && v.message.kind === "error" && RANK[message.kind] < RANK.error) {
      waiting = { message, caller };
      remember(caller, message);
      return;
    }
    replace(message, caller);
  }

  function close(opts: { immediate?: boolean } = {}) {
    const v = state.visible;
    if (!v) return;
    if (v.phase === "closing" && !opts.immediate) return;
    clearTimers();
    const finish = () => {
      phaseTimer = null;
      setVisible(null);
      if (waiting) {
        const w = waiting;
        waiting = null;
        create(w.message, w.caller);
      }
    };
    if (opts.immediate) return finish();
    setVisible({ ...v, phase: "closing" });
    phaseTimer = clock.setTimer(finish, reducedMotion ? FADE_OUT_MS : CLOSE_MS);
  }

  function show(kind: Kind, title: string, options: ToastOptions = {}): string {
    const caller = options.id ?? `toast-caller-${++counter}`;
    const message = toMessage(kind, title, options);
    // A repeated id is the same caller saying something new.
    if (options.id !== undefined) {
      if (state.visible?.owner === caller) {
        replace(message, caller);
        return caller;
      }
      if (waiting?.caller === caller) {
        if (message.kind === "error") {
          waiting = null;
          offer(message, caller);
        } else waiting = { message, caller };
        return caller;
      }
    }
    offer(message, caller);
    return caller;
  }

  function update(caller: string, patch: ToastPatch) {
    const v = state.visible;
    if (v && v.owner === caller) {
      const message = applyPatch(v.message, patch);
      if (isProgressOnly(patch)) {
        remember(caller, message);
        setVisible({ ...v, message });
        return;
      }
      return replace(message, caller);
    }
    if (waiting && waiting.caller === caller) {
      const message = applyPatch(waiting.message, patch);
      if (message.kind === "error") {
        waiting = null;
        offer(message, caller);
      } else waiting = { message, caller };
      return;
    }
    // A caller that lost the toast: only a failure gets through.
    const last = lastByCaller.get(caller);
    if (patch.kind === "error" && (last || patch.title)) {
      offer(applyPatch(last ?? { kind: "error", title: "" }, patch), caller);
    }
  }

  function dismiss(caller?: string, opts: { immediate?: boolean } = {}) {
    if (caller === undefined) {
      waiting = null;
      return close(opts);
    }
    if (state.visible?.owner === caller) return close(opts);
    if (waiting?.caller === caller) waiting = null;
  }

  /** A button was pressed: a returned patch changes the toast in place (buttons go unless named), else it closes. */
  function act(which: "action" | "secondary") {
    const v = state.visible;
    const button: ToastButton | undefined = v?.message[which];
    if (!v || !button) return;
    const result = button.onClick();
    if (result && typeof result === "object") update(v.owner, { action: null, secondary: null, ...result });
    else close();
  }

  function pause() {
    if (paused) return;
    paused = true;
    if (lifeTimer !== null) {
      clock.clearTimer(lifeTimer);
      lifeTimer = null;
      lifeLeft = Math.max(0, lifeLeft - (clock.now() - lifeStartedAt));
    }
  }

  function resume() {
    if (!paused) return;
    paused = false;
    startLife();
  }

  function promise<T>(p: Promise<T> | (() => Promise<T>), m: PromiseMessages<T>): Promise<T> {
    const caller = show("loading", m.loading);
    const run = typeof p === "function" ? p() : p;
    run.then(
      (value) => update(caller, { kind: "success", title: typeof m.success === "function" ? m.success(value) : m.success }),
      (error: unknown) => update(caller, { kind: "error", title: typeof m.error === "function" ? m.error(error) : m.error }),
    );
    return run;
  }

  return {
    show,
    update,
    dismiss,
    act,
    pause,
    resume,
    promise,
    configure(c: { sound?: SoundPolicy; reducedMotion?: boolean }) {
      if (c.sound !== undefined) policy = c.sound;
      if (c.reducedMotion !== undefined) reducedMotion = c.reducedMotion;
    },
    soundPolicy: () => policy,
    /** For tests and the view: the message held behind a failure, if any. */
    waiting: () => waiting?.message ?? null,
    subscribe(fn: () => void) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    getState: () => state,
  };
}

export type Toaster = ReturnType<typeof createToaster>;

type ShowFn = (title: string, options?: ToastOptions) => string;

export interface ToastApi extends ShowFn {
  info: ShowFn;
  success: ShowFn;
  error: ShowFn;
  warning: ShowFn;
  loading: ShowFn;
  /** Kept so call sites written for the consoles' old toast need no edit; same as `info`. */
  message: ShowFn;
  update: (handle: string, patch: ToastPatch) => void;
  dismiss: (handle?: string) => void;
  promise: <T>(p: Promise<T> | (() => Promise<T>), m: PromiseMessages<T>) => Promise<T>;
}

/** The callable `toast(...)` over one toaster. */
export function toastApi(t: Toaster): ToastApi {
  const info: ShowFn = (title, o) => t.show("info", title, o);
  return Object.assign(info, {
    info,
    message: info,
    success: ((title, o) => t.show("success", title, o)) as ShowFn,
    error: ((title, o) => t.show("error", title, o)) as ShowFn,
    warning: ((title, o) => t.show("warning", title, o)) as ShowFn,
    loading: ((title, o) => t.show("loading", title, o)) as ShowFn,
    update: (handle: string, patch: ToastPatch) => t.update(handle, patch),
    dismiss: (handle?: string) => t.dismiss(handle),
    promise: <T,>(p: Promise<T> | (() => Promise<T>), m: PromiseMessages<T>) => t.promise(p, m),
  });
}
