import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLOSE_MS, ENTER_MS, LIFE_MS, REANNOUNCE_MS, createToaster, toastApi, type Clock } from "./store";
import type { Kind, SoundPolicy } from "./types";

/** A clock that only moves when told to. */
function fakeClock() {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimer: (fn, ms) => {
      timers.set(++id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h) => {
      timers.delete(h as number);
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };
  return { clock, advance };
}

function setup() {
  const { clock, advance } = fakeClock();
  const cues: { kind: Kind; policy: SoundPolicy; asked: boolean }[] = [];
  const t = createToaster({ clock, cue: (kind, policy, asked) => cues.push({ kind, policy, asked }) });
  const toast = toastApi(t);
  const visible = () => t.getState().visible;
  /** Let the mark open, so the life countdown starts. */
  const open = () => advance(ENTER_MS);
  return { t, toast, visible, advance, open, cues };
}

describe("one toast at a time (guarantee 1)", () => {
  it("a new message takes over the visible toast in place", () => {
    const { toast, visible, open } = setup();
    toast.success("Saved.");
    open();
    const key = visible()!.key;
    toast.info("Copied.");
    expect(visible()!.key).toBe(key);
    expect(visible()!.message.title).toBe("Copied.");
    expect(visible()!.version).toBe(2);
  });
});

describe("a failure is never hidden (guarantee 2)", () => {
  it("a lesser message waits behind a failure and appears, with its full life, when the failure closes", () => {
    const { toast, t, visible, advance, open } = setup();
    toast.error("Couldn't mark order 12 ready.");
    open();
    toast.success("6 orders ready");
    expect(visible()!.message.kind).toBe("error");
    expect(t.waiting()?.title).toBe("6 orders ready");
    toast.dismiss(); // no handle: closes the visible one and drops what waited
    expect(t.waiting()).toBeNull();
    advance(CLOSE_MS);
    expect(visible()).toBeNull();
  });

  it("closing the failure shows what waited", () => {
    const { toast, visible, advance, open } = setup();
    const fail = toast.error("No bag has that label.");
    open();
    toast.success("Saved.");
    toast.dismiss(fail);
    advance(CLOSE_MS);
    expect(visible()!.message.title).toBe("Saved.");
    expect(visible()!.phase).toBe("entering");
    open();
    advance(LIFE_MS - 1);
    expect(visible()!.message.title).toBe("Saved.");
    advance(1);
    expect(visible()!.phase).toBe("closing");
  });

  it("only the newest lesser message waits", () => {
    const { toast, t, open } = setup();
    toast.error("Failed.");
    open();
    toast.success("First.");
    toast.info("Second.");
    expect(t.waiting()?.title).toBe("Second.");
  });

  it("a warning waits too", () => {
    const { toast, visible, t, open } = setup();
    toast.error("Failed.");
    open();
    toast.warning("Running low.");
    expect(visible()!.message.kind).toBe("error");
    expect(t.waiting()?.kind).toBe("warning");
  });

  it("a newer failure takes over an older one", () => {
    const { toast, visible, open } = setup();
    toast.error("First failure.");
    open();
    toast.error("Second failure.");
    expect(visible()!.message.title).toBe("Second failure.");
  });

  it("the failure's own caller may change it", () => {
    const { toast, visible, open } = setup();
    const id = toast.error("Couldn't save.", { action: { label: "Retry", onClick: () => ({ kind: "loading", title: "Saving…" }) } });
    open();
    toast.update(id, { kind: "success", title: "Saved." });
    expect(visible()!.message.title).toBe("Saved.");
  });
});

describe("a caller that lost the toast (guarantee 3, FR-008)", () => {
  it("cannot change it with anything but a failure", () => {
    const { toast, visible, open } = setup();
    const slow = toast.loading("Saving…");
    open();
    toast.info("Copied.");
    toast.update(slow, { kind: "success", title: "Saved." });
    expect(visible()!.message.title).toBe("Copied.");
  });

  it("can still report a failure, which takes over", () => {
    const { toast, visible, open } = setup();
    const slow = toast.loading("Saving…");
    open();
    toast.info("Copied.");
    toast.update(slow, { kind: "error", title: "Couldn't save." });
    expect(visible()!.message).toMatchObject({ kind: "error", title: "Couldn't save." });
  });

  it("toast.promise: success in place, failure in place, the same promise returned", async () => {
    const { toast, visible, open } = setup();
    const ok = Promise.resolve(6);
    const returned = toast.promise(ok, { loading: "Marking…", success: (n) => `${n} orders ready`, error: "Failed" });
    expect(returned).toBe(ok);
    expect(visible()!.message.kind).toBe("loading");
    open();
    await ok;
    expect(visible()!.message).toMatchObject({ kind: "success", title: "6 orders ready" });

    const bad = Promise.reject(new Error("x"));
    void toast.promise(bad, { loading: "Saving…", success: "Saved", error: (e) => `Failed: ${(e as Error).message}` }).catch(() => undefined);
    await bad.catch(() => undefined);
    await Promise.resolve();
    expect(visible()!.message).toMatchObject({ kind: "error", title: "Failed: x" });
  });

  it("a repeated id is one caller", () => {
    const { toast, visible, open } = setup();
    toast.loading("Uploading…", { id: "upload" });
    open();
    toast.success("Uploaded.", { id: "upload" });
    expect(visible()!.message.title).toBe("Uploaded.");
    expect(visible()!.owner).toBe("upload");
  });
});

describe("repeats (guarantee 4)", () => {
  it("the same message again shows a count and restarts its time", () => {
    const { toast, visible, advance, open } = setup();
    toast.error("No bag has that label.");
    open();
    toast.error("No bag has that label.");
    toast.error("No bag has that label.");
    expect(visible()!.count).toBe(3);

    toast.dismiss();
    advance(CLOSE_MS);
    toast.success("Saved.");
    open();
    advance(4000);
    toast.success("Saved.");
    expect(visible()!.count).toBe(2);
    advance(4000);
    expect(visible()!.phase).toBe("open");
    advance(1000);
    expect(visible()!.phase).toBe("closing");
  });
});

describe("lives (guarantee 5)", () => {
  it("success, information and warning close after 5 s; failure and in progress stay", () => {
    for (const kind of ["success", "info", "warning"] as const) {
      const { t, visible, advance, open } = setup();
      t.show(kind, "x");
      open();
      advance(LIFE_MS);
      expect(visible()!.phase).toBe("closing");
      advance(CLOSE_MS);
      expect(visible()).toBeNull();
    }
    for (const kind of ["error", "loading"] as const) {
      const { t, visible, advance, open } = setup();
      t.show(kind, "x");
      open();
      advance(60_000);
      expect(visible()!.phase).toBe("open");
    }
  });

  it("a toast with a button stays unless the caller sets a time", () => {
    const { toast, visible, advance, open } = setup();
    toast("Notification archived", { action: { label: "Undo", onClick: () => undefined } });
    open();
    advance(60_000);
    expect(visible()!.phase).toBe("open");

    const b = setup();
    b.toast("Notification archived", { action: { label: "Undo", onClick: () => undefined }, duration: 5000 });
    b.open();
    b.advance(5000);
    expect(b.visible()!.phase).toBe("closing");
  });

  it("duration 0 keeps it until closed", () => {
    const { toast, visible, advance, open } = setup();
    toast.success("Saved.", { duration: 0 });
    open();
    advance(60_000);
    expect(visible()!.phase).toBe("open");
  });

  it("pausing keeps the time that was left", () => {
    const { t, toast, visible, advance, open } = setup();
    toast.success("Saved.");
    open();
    advance(3000);
    t.pause();
    advance(60_000);
    expect(visible()!.phase).toBe("open");
    t.resume();
    advance(1999);
    expect(visible()!.phase).toBe("open");
    advance(1);
    expect(visible()!.phase).toBe("closing");
  });
});

describe("buttons", () => {
  it("a button returning a patch changes the toast in place and removes the buttons", () => {
    const { t, toast, visible, open } = setup();
    toast("Removed from cart", { action: { label: "Undo", onClick: () => ({ kind: "success", title: "Restored" }) } });
    open();
    t.act("action");
    expect(visible()!.message).toMatchObject({ kind: "success", title: "Restored" });
    expect(visible()!.message.action).toBeUndefined();
    expect(visible()!.phase).toBe("open");
  });

  it("a button returning nothing closes the toast", () => {
    const { t, toast, visible, open } = setup();
    const onClick = vi.fn();
    toast("Notification archived", { action: { label: "Undo", onClick } });
    open();
    t.act("action");
    expect(onClick).toHaveBeenCalledOnce();
    expect(visible()!.phase).toBe("closing");
  });
});

describe("announcements (guarantee 6)", () => {
  it("failures go to the assertive region, others to the polite one", () => {
    const { t, toast } = setup();
    toast.success("Saved.", { description: "6 orders" });
    expect(t.getState().liveText.polite).toBe("Saved. 6 orders");
    toast.error("Couldn't save.");
    expect(t.getState().liveText.assertive).toBe("Couldn't save.");
  });

  it("the same words twice are said twice", () => {
    const { t, toast, advance, open } = setup();
    toast.success("Saved.");
    open();
    advance(LIFE_MS + CLOSE_MS);
    toast.success("Saved.");
    expect(t.getState().liveText.polite).toBe("");
    advance(REANNOUNCE_MS);
    expect(t.getState().liveText.polite).toBe("Saved.");
  });

  it("a progress-only change is not said and plays nothing", () => {
    const { t, toast, open, cues } = setup();
    const id = toast.info("Uploading", { progress: 0 });
    open();
    const said = t.getState().liveText.polite;
    const heard = cues.length;
    toast.update(id, { progress: 0.5 });
    expect(t.getState().visible!.message.progress).toBe(0.5);
    expect(t.getState().liveText.polite).toBe(said);
    expect(cues.length).toBe(heard);
  });
});

describe("tones (guarantee 7)", () => {
  beforeEach(() => undefined);
  it("asks the player for every appearance, with the policy and whether the toast asked", () => {
    const { t, toast, cues } = setup();
    t.configure({ sound: "opt-in" });
    toast.error("No bag has that label.", { sound: true });
    expect(cues.at(-1)).toEqual({ kind: "error", policy: "opt-in", asked: true });
  });
});

describe("reduced motion", () => {
  it("opens at once and fades out quickly", () => {
    const { t, toast, visible, advance } = setup();
    t.configure({ reducedMotion: true });
    toast.success("Saved.");
    expect(visible()!.phase).toBe("open");
    advance(LIFE_MS);
    expect(visible()!.phase).toBe("closing");
    advance(120);
    expect(visible()).toBeNull();
  });
});

describe("closing then a new message", () => {
  it("reopens the closing toast instead of waiting for it to go", () => {
    const { toast, visible, advance, open } = setup();
    toast.success("Saved.");
    open();
    advance(LIFE_MS);
    expect(visible()!.phase).toBe("closing");
    toast.info("Copied.");
    expect(visible()!.phase).toBe("open");
    expect(visible()!.message.title).toBe("Copied.");
  });
});
