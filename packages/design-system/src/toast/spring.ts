/**
 * Spring physics for the toast (research R2).
 *
 * A mass-spring-damper stepped by semi-implicit Euler at a fixed 1/240 s sub-step, so it is stable at the stiffness we
 * use and moves the same at 30 fps and 120 fps. Retargeting keeps the velocity, which is what makes a change of
 * message mid-movement flow instead of starting over. One shared frame loop drives every spring and stops when
 * nothing moves.
 */

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass?: number;
}

/** The mark arriving: quick, a little overshoot. */
export const ARRIVAL: SpringConfig = { stiffness: 300, damping: 24 };
/** The message opening and reshaping. */
export const SHAPE: SpringConfig = { stiffness: 360, damping: 30 };
/** A failure's one shake: under-damped. */
export const SHAKE: SpringConfig = { stiffness: 600, damping: 12 };
/** Folding back: firm, no overshoot. */
export const CLOSE: SpringConfig = { stiffness: 420, damping: 40 };

const STEP = 1 / 240;
const REST = 0.5;

export class Spring {
  x: number;
  v = 0;
  target: number;
  private k: number;
  private c: number;
  private m: number;

  constructor(x: number, config: SpringConfig) {
    this.x = x;
    this.target = x;
    this.k = config.stiffness;
    this.c = config.damping;
    this.m = config.mass ?? 1;
  }

  tune(config: SpringConfig): void {
    this.k = config.stiffness;
    this.c = config.damping;
    this.m = config.mass ?? 1;
  }

  /** Move the target; the current velocity is kept. */
  retarget(to: number): void {
    this.target = to;
  }

  /** Be there now. */
  jump(to: number): void {
    this.x = to;
    this.target = to;
    this.v = 0;
  }

  /** Add velocity (px/s): a shake, a hop. */
  kick(velocity: number): void {
    this.v += velocity;
  }

  get resting(): boolean {
    return this.v === 0 && this.x === this.target;
  }

  /** Advance `dt` seconds. Returns true while still moving. */
  step(dt: number): boolean {
    let left = dt;
    while (left > 1e-9) {
      const h = Math.min(STEP, left);
      const a = (-this.k * (this.x - this.target) - this.c * this.v) / this.m;
      this.v += a * h;
      this.x += this.v * h;
      left -= h;
    }
    if (Math.abs(this.v) < REST && Math.abs(this.x - this.target) < REST) {
      this.x = this.target;
      this.v = 0;
      return false;
    }
    return true;
  }
}

/** A frame task: advance `dt` seconds, return false when at rest. */
export type FrameTask = (dt: number) => boolean;

type Scheduler = { request: (cb: (t: number) => void) => number; now: () => number };

const browserScheduler = (): Scheduler | null =>
  typeof requestAnimationFrame === "function"
    ? { request: (cb) => requestAnimationFrame(cb), now: () => performance.now() }
    : null;

let scheduler: Scheduler | null = null;
const tasks = new Set<FrameTask>();
let handle = 0;
let last = 0;

function tick(t: number) {
  const dt = Math.min(0.064, Math.max(0, (t - last) / 1000));
  last = t;
  for (const task of [...tasks]) if (!task(dt)) tasks.delete(task);
  handle = tasks.size && scheduler ? scheduler.request(tick) : 0;
}

/** Run `task` every frame until it reports rest. Adding a running task again is a no-op. */
export function runFrame(task: FrameTask): void {
  scheduler ??= browserScheduler();
  if (!scheduler) return;
  tasks.add(task);
  if (!handle) {
    last = scheduler.now();
    handle = scheduler.request(tick);
  }
}

export function stopFrame(task: FrameTask): void {
  tasks.delete(task);
}

/** True while any frame is requested. */
export function frameLoopActive(): boolean {
  return handle !== 0;
}

/** Tests only: drive the loop by hand. */
export function __setScheduler(s: Scheduler | null): void {
  scheduler = s;
  tasks.clear();
  handle = 0;
}
