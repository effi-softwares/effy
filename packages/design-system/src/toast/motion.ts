/**
 * How one toast moves (spec FR-014-FR-017, research R2).
 *
 * The toast's content is laid out once, at its final size, and never re-wraps while it moves. What changes shape is a
 * separate surface (background, hairline, shadow) sized by two springs - width and height - and the content is
 * clipped to the same box. A third spring brings the toast in from the edge; a fourth shakes it; a fifth slides it
 * when a longer or shorter message moves its anchored edge. When nothing moves the toast carries no transform at all,
 * so its text is never resampled.
 *
 * With reduced motion every spring jumps to its target; the stylesheet fades the toast in and out instead.
 */
import { ARRIVAL, CLOSE, SHAKE, SHAPE, Spring, runFrame, stopFrame } from "./spring";
import type { Kind, Phase } from "./types";

/** The mark's own square: what a toast is before it opens, and after it folds back. */
export const MARK = 44;

export interface MotionTarget {
  phase: Phase;
  kind: Kind;
  count: number;
}

export interface MotionOptions {
  root: HTMLElement;
  surface: HTMLElement;
  content: HTMLElement;
  /** 0 = the toast is anchored at its left, 0.5 = centred, 1 = at its right. */
  anchor: number;
  /** 1 = it lives at the bottom of the screen, -1 = at the top. */
  edge: 1 | -1;
  reduced: () => boolean;
}

export interface Motion {
  sync(target: MotionTarget): void;
  drag(dx: number, dy: number): void;
  /** Let go without dismissing: spring back. */
  release(): void;
  /** Let go away: throw it in that direction, then `done`. */
  fling(dx: number, dy: number, done: () => void): void;
  destroy(): void;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function bindMotion(o: MotionOptions): Motion {
  const { root, surface, content, anchor, edge } = o;
  const Y0 = edge * (MARK + 40);
  const radius = parseFloat(getComputedStyle(surface).borderTopLeftRadius) || 12;

  const w = new Spring(MARK, SHAPE);
  const h = new Spring(MARK, SHAPE);
  const y = new Spring(Y0, ARRIVAL);
  const shake = new Spring(0, SHAKE);
  const slide = new Spring(0, SHAPE);
  const springs = [w, h, y, shake, slide];

  let W = MARK;
  let H = MARK;
  let dragX = 0;
  let dragY = 0;
  let measured = false;
  let flinging = false;
  let current: MotionTarget | null = null;
  let spin: Animation | null = null;

  function apply() {
    if (flinging) return;
    const vw = clamp(w.x, MARK, Math.max(MARK, W));
    const vh = clamp(h.x, MARK, Math.max(MARK, H));
    surface.style.width = `${vw}px`;
    surface.style.height = `${vh}px`;
    const right = Math.max(0, W - vw);
    const vert = Math.max(0, H - vh);
    content.style.clipPath =
      edge === 1
        ? `inset(${vert}px ${right}px 0px 0px round ${radius}px)`
        : `inset(0px ${right}px ${vert}px 0px round ${radius}px)`;
    const reveal = clamp((vw - MARK) / Math.max(1, W - MARK));
    root.style.setProperty("--ef-reveal", reveal.toFixed(3));
    root.toggleAttribute("data-settled", reveal >= 1);

    const arrived = clamp(1 - Math.abs(y.x) / Math.abs(Y0));
    const tx = shake.x + slide.x + dragX;
    const ty = y.x + dragY;
    const scale = 0.72 + 0.28 * arrived;
    const still = tx === 0 && ty === 0 && scale === 1;
    root.style.transform = still ? "" : `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${scale.toFixed(4)})`;
    root.style.opacity = arrived >= 1 ? "" : String(clamp(arrived * 1.6));
  }

  const task = (dt: number) => {
    const moving = springs.map((s) => s.step(dt)).some(Boolean);
    apply();
    return moving;
  };

  const kick = () => {
    if (o.reduced()) {
      springs.forEach((s) => s.jump(s.target));
      shake.jump(0);
      slide.jump(0);
      apply();
    } else runFrame(task);
  };

  function aim() {
    if (!current) return;
    const openShape = current.phase === "open";
    w.retarget(openShape ? W : MARK);
    h.retarget(openShape ? H : MARK);
    y.retarget(current.phase === "closing" ? Y0 * 0.5 : 0);
  }

  function measure() {
    const nextW = content.offsetWidth || MARK;
    const nextH = content.offsetHeight || MARK;
    if (measured && nextW === W && nextH === H) return;
    // A longer message moves the anchored toast's leading edge; slide it back so the mark stays where it was.
    if (measured && !o.reduced()) slide.x += (nextW - W) * anchor;
    measured = true;
    W = nextW;
    H = nextH;
    aim();
    kick();
  }

  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
  observer?.observe(content);

  function mark(): SVGElement | null {
    return root.querySelector<SVGElement>(".ef-toast-mark");
  }

  function setSpin(kind: Kind, was: Kind | undefined) {
    const el = mark();
    if (!el || typeof el.animate !== "function" || o.reduced()) return;
    if (kind === "loading") {
      if (!spin) spin = el.animate([{ rotate: "0deg" }, { rotate: "360deg" }], { duration: 900, iterations: Infinity });
      return;
    }
    if (was === "loading" && spin) {
      // Catch the ring mid-turn and ease it to rest as its gap closes.
      const deg = ((Number(spin.currentTime ?? 0) % 900) / 900) * 360;
      spin.cancel();
      spin = null;
      el.animate([{ rotate: `${deg}deg` }, { rotate: "360deg" }], { duration: 560, easing: "cubic-bezier(.2,.7,.2,1)" });
    }
  }

  return {
    sync(target) {
      const first = current === null;
      const prev = current;
      current = target;
      measure();
      if (first) {
        if (o.reduced()) {
          w.jump(target.phase === "open" ? W : MARK);
          h.jump(target.phase === "open" ? H : MARK);
          y.jump(0);
        } else {
          y.jump(Y0);
        }
      }
      if (target.phase === "closing") {
        w.tune(CLOSE);
        h.tune(CLOSE);
        y.tune(CLOSE);
      } else if (prev?.phase === "closing") {
        w.tune(SHAPE);
        h.tune(SHAPE);
        y.tune(ARRIVAL);
      }
      aim();
      if (!o.reduced() && prev && target.phase !== "closing") {
        if (target.kind !== prev.kind && target.kind === "error") shake.kick(420);
        else if (target.kind !== prev.kind && target.kind === "warning") y.kick(-edge * 220);
        else if (target.count > prev.count) y.kick(-edge * 160);
      }
      if (prev?.phase === "entering" && target.phase === "open" && !o.reduced()) {
        // The gesture of a toast that arrives as a failure or a warning, once it is open.
        if (target.kind === "error") shake.kick(420);
        else if (target.kind === "warning") y.kick(-edge * 220);
      }
      setSpin(target.kind, prev?.kind);
      kick();
    },
    drag(dx, dy) {
      dragX = dx;
      dragY = dy;
      apply();
    },
    release() {
      // Hand the drag to the springs so it comes back.
      shake.x += dragX;
      y.x += dragY;
      dragX = 0;
      dragY = 0;
      kick();
    },
    fling(dx, dy, done) {
      const len = Math.hypot(dx, dy) || 1;
      const far = 220;
      if (o.reduced() || typeof root.animate !== "function") return done();
      flinging = true;
      stopFrame(task);
      const from = root.style.transform || "none";
      const to = `translate(${((dx / len) * far + shake.x + slide.x).toFixed(1)}px, ${((dy / len) * far + y.x).toFixed(1)}px)`;
      const a = root.animate([{ transform: from, opacity: 1 }, { transform: to, opacity: 0 }], {
        duration: 200,
        easing: "cubic-bezier(.2,.8,.3,1)",
        fill: "forwards",
      });
      a.onfinish = done;
      a.oncancel = done;
    },
    destroy() {
      stopFrame(task);
      observer?.disconnect();
      spin?.cancel();
      spin = null;
    },
  };
}
