import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cueFor } from "./cue";
import { __resetAudio, audioReady, playCue, previewCue, subscribeAudio, unlockAudio } from "./sound";

type Ramp = [string, number, number];

/** A recording stand-in for the browser's audio context. */
class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  state: "suspended" | "running" | "closed" = "running";
  currentTime = 10;
  destination = { name: "destination" };
  oscillators: { type: string; freq: number; start?: number; stop?: number; ramps: Ramp[] }[] = [];
  private stateListeners: (() => void)[] = [];
  constructor() {
    FakeAudioContext.last = this;
  }
  addEventListener(_: string, fn: () => void) {
    this.stateListeners.push(fn);
  }
  setState(s: FakeAudioContext["state"]) {
    this.state = s;
    this.stateListeners.forEach((f) => f());
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  createOscillator() {
    const rec = { type: "", freq: 0, ramps: [] as Ramp[], start: undefined as number | undefined, stop: undefined as number | undefined };
    this.oscillators.push(rec);
    const osc = {
      set type(t: string) {
        rec.type = t;
      },
      frequency: {
        set value(v: number) {
          rec.freq = v;
        },
      },
      connect: (g: { ramps: Ramp[] }) => {
        rec.ramps = g.ramps;
        return g;
      },
      start: (t: number) => {
        rec.start = t;
      },
      stop: (t: number) => {
        rec.stop = t;
      },
    };
    return osc;
  }
  createGain() {
    const ramps: Ramp[] = [];
    const g = {
      ramps,
      gain: {
        value: 0,
        setValueAtTime: (v: number, t: number) => ramps.push(["set", v, t]),
        linearRampToValueAtTime: (v: number, t: number) => ramps.push(["linear", v, t]),
        exponentialRampToValueAtTime: (v: number, t: number) => ramps.push(["exp", v, t]),
      },
      connect: (n: unknown) => n,
    };
    return g;
  }
  createBiquadFilter() {
    return { type: "", frequency: { value: 0 }, connect: (n: unknown) => n };
  }
}

beforeEach(() => {
  __resetAudio();
  FakeAudioContext.last = null;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});
afterEach(() => {
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

const ctx = () => FakeAudioContext.last!;

describe("cues", () => {
  it("each kind plays its own notes", () => {
    unlockAudio();
    playCue("success");
    expect(ctx().oscillators.map((o) => o.freq)).toEqual([783.99, 1174.66]);
    playCue("error");
    expect(ctx().oscillators.slice(2).map((o) => o.freq)).toEqual([329.63, 277.18]);
    playCue("warning");
    expect(ctx().oscillators.slice(4).map((o) => o.freq)).toEqual([440, 440]);
    playCue("info");
    expect(ctx().oscillators.slice(6).map((o) => [o.type, o.freq])).toEqual([["sine", 1046.5]]);
  });

  it("the new-order chime is the old chime, unchanged", () => {
    unlockAudio();
    playCue("new-order");
    const [a, b] = ctx().oscillators;
    expect([a!.type, a!.freq, a!.start, a!.stop]).toEqual(["sine", 880, 10, 10.34]);
    expect(a!.ramps).toEqual([
      ["set", 0.0001, 10],
      ["exp", 0.25, 10.02],
      ["exp", 0.0001, 10.32],
    ]);
    expect([b!.freq, b!.start]).toEqual([1318.5, 10.18]);
  });

  it("plays nothing while audio is locked", () => {
    unlockAudio();
    ctx().state = "suspended";
    playCue("success");
    expect(ctx().oscillators).toHaveLength(0);
  });

  it("never throws: no audio at all, or a broken one", () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    __resetAudio();
    expect(() => playCue("error")).not.toThrow();
    (window as unknown as { AudioContext: unknown }).AudioContext = class extends FakeAudioContext {
      override createOscillator(): never {
        throw new Error("boom");
      }
    };
    __resetAudio();
    unlockAudio();
    expect(() => playCue("error")).not.toThrow();
  });

  it("previewCue unlocks, then plays", async () => {
    previewCue("new-order");
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx().oscillators.map((o) => o.freq)).toEqual([880, 1318.5]);
  });
});

describe("ready state", () => {
  it("reports changes of the audio state", () => {
    const seen = vi.fn();
    subscribeAudio(seen);
    unlockAudio();
    expect(audioReady()).toBe(true);
    ctx().setState("suspended");
    expect(seen).toHaveBeenLastCalledWith(false);
  });
});

describe("policy (guarantee 7)", () => {
  it("in progress never plays", () => {
    expect(cueFor("loading", "on", true)).toBeNull();
  });
  it("on: every other kind plays", () => {
    expect(cueFor("success", "on", false)).toBe("success");
    expect(cueFor("error", "on", false)).toBe("error");
  });
  it("off and never: nothing, even when asked", () => {
    expect(cueFor("error", "off", true)).toBeNull();
    expect(cueFor("error", "never", true)).toBeNull();
  });
  it("opt-in: only when the toast asks", () => {
    expect(cueFor("error", "opt-in", false)).toBeNull();
    expect(cueFor("error", "opt-in", true)).toBe("error");
  });
});
