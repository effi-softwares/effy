import { afterEach, describe, expect, it } from "vitest";

import { SHAPE, Spring, __setScheduler, frameLoopActive, runFrame } from "./spring";

function settle(s: Spring, fps: number, maxSeconds = 5): number {
  let t = 0;
  while (s.step(1 / fps) && t < maxSeconds) t += 1 / fps;
  return t;
}

describe("Spring", () => {
  it("settles at its target", () => {
    const s = new Spring(44, SHAPE);
    s.retarget(320);
    settle(s, 60);
    expect(s.x).toBe(320);
    expect(s.v).toBe(0);
  });

  it("keeps its velocity when retargeted mid-flight", () => {
    const s = new Spring(0, SHAPE);
    s.retarget(300);
    for (let i = 0; i < 6; i++) s.step(1 / 60);
    const v = s.v;
    expect(v).toBeGreaterThan(0);
    s.retarget(200);
    expect(s.v).toBe(v);
  });

  it("moves the same at 30 fps and 120 fps", () => {
    const a = new Spring(0, SHAPE);
    const b = new Spring(0, SHAPE);
    a.retarget(300);
    b.retarget(300);
    for (let i = 0; i < 6; i++) a.step(1 / 30);
    for (let i = 0; i < 24; i++) b.step(1 / 120);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.5);
  });

  it("a kick moves it and it comes back", () => {
    const s = new Spring(0, { stiffness: 600, damping: 12 });
    s.kick(380);
    s.step(1 / 60);
    expect(s.x).not.toBe(0);
    settle(s, 60);
    expect(s.x).toBe(0);
  });
});

describe("the frame loop", () => {
  afterEach(() => __setScheduler(null));

  it("runs tasks each frame and stops when all rest", () => {
    const frames: ((t: number) => void)[] = [];
    let now = 0;
    __setScheduler({ request: (cb) => frames.push(cb), now: () => now });
    const s = new Spring(0, SHAPE);
    s.retarget(100);
    runFrame((dt) => s.step(dt));
    expect(frameLoopActive()).toBe(true);
    for (let i = 0; i < 600 && frames.length; i++) {
      now += 16;
      frames.shift()!(now);
    }
    expect(s.x).toBe(100);
    expect(frameLoopActive()).toBe(false);
  });
});
