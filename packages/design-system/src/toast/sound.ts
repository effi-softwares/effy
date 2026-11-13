/**
 * The Effy sound set (spec FR-018-FR-022, research R4, contracts/sound-api.md).
 *
 * The platform's one place that makes a sound in a web app: the toast's tones and the shop console's new-order chime.
 * Every tone is made here by the browser - there are no sound files. Browsers keep audio locked until a person clicks
 * or presses a key, so a tone before that is silently skipped. Sound is a nicety: nothing here may ever throw.
 */

import type { Cue } from "./cue";

export type { Cue };

type Wave = "sine" | "triangle";
/** [frequency Hz, start offset s, peak gain, decay s] */
type Note = readonly [number, number, number, number];

/** Rising = good news, falling = bad news, a double tap = look, one note = for your information. */
const CUES: Record<Exclude<Cue, "new-order">, { wave: Wave; notes: readonly Note[] }> = {
  success: { wave: "triangle", notes: [[783.99, 0, 0.6, 0.22], [1174.66, 0.09, 0.55, 0.26]] }, // G5 → D6
  error: { wave: "triangle", notes: [[329.63, 0, 0.7, 0.26], [277.18, 0.12, 0.7, 0.3]] }, // E4 → C#4
  warning: { wave: "triangle", notes: [[440, 0, 0.55, 0.12], [440, 0.14, 0.45, 0.12]] }, // A4, A4
  info: { wave: "sine", notes: [[1046.5, 0, 0.5, 0.18]] }, // C6
};

const ATTACK = 0.012;
const MASTER = 0.3;
const SOFTEN_HZ = 2400;

let ctx: AudioContext | null = null;
const listeners = new Set<(ready: boolean) => void>();

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
      ctx.addEventListener?.("statechange", notify);
    } catch {
      ctx = null;
    }
  }
  return ctx;
}

function notify(): void {
  const ready = audioReady();
  listeners.forEach((l) => l(ready));
}

/** Audio can play now. */
export function audioReady(): boolean {
  return ctx?.state === "running";
}

export function subscribeAudio(listener: (ready: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Resume audio. Call it from a click or a key press - that is what lets a browser play sound at all. */
export function unlockAudio(): void {
  try {
    const c = context();
    if (!c) return;
    if (c.state === "running") return notify();
    void c.resume().then(notify, notify);
  } catch {
    // sound is a nicety
  }
}

/** Unlock on the person's first click or key press (and keep trying, in case the browser locks it again). */
export function unlockOnFirstGesture(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onGesture = () => unlockAudio();
  window.addEventListener("pointerdown", onGesture, { passive: true });
  window.addEventListener("keydown", onGesture);
  return () => {
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
  };
}

/** The shop console's new-order chime, exactly as it sounded before it moved here (FR-019). */
function newOrder(c: AudioContext): void {
  const now = c.currentTime;
  for (const [i, freq] of [880, 1318.5].entries()) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.34);
  }
}

function tone(c: AudioContext, cue: Exclude<Cue, "new-order">): void {
  const { wave, notes } = CUES[cue];
  const master = c.createGain();
  master.gain.value = MASTER;
  const soften = c.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = SOFTEN_HZ;
  master.connect(soften).connect(c.destination);
  const now = c.currentTime;
  for (const [freq, offset, peak, decay] of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    const start = now + offset;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + decay + 0.02);
  }
}

/** Play a cue now. Silent if audio is missing, closed or still locked; never throws. */
export function playCue(cue: Cue): void {
  try {
    const c = context();
    if (!c || c.state !== "running") return;
    if (cue === "new-order") newOrder(c);
    else tone(c, cue);
  } catch {
    // sound is a nicety
  }
}

/** On a click: unlock, then play (a settings page's "Play"). */
export function previewCue(cue: Cue): void {
  try {
    const c = context();
    if (!c) return;
    void c.resume().then(
      () => {
        notify();
        playCue(cue);
      },
      notify,
    );
  } catch {
    // sound is a nicety
  }
}

/** Tests only. */
export function __resetAudio(): void {
  ctx = null;
  listeners.clear();
}
