/**
 * Turns a burst of "something changed" into a few reads: the first update reads at once; later ones
 * read once quiet for `quietMs`, or after `maxWaitMs`. The last update of a burst is always followed by
 * a read.
 */
export interface Coalescer {
  /** Something changed. */
  trigger(): void;
  /** Drop anything pending — the screen is going away. */
  cancel(): void;
}

export const QUIET_MS = 1_000;
export const MAX_WAIT_MS = 5_000;

export function createCoalescer(run: () => void, quietMs = QUIET_MS, maxWaitMs = MAX_WAIT_MS): Coalescer {
  // Until this moment a new update is "part of a burst" rather than the start of one.
  let burstUntil = 0;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    clearTimeout(quietTimer);
    clearTimeout(maxTimer);
    quietTimer = undefined;
    maxTimer = undefined;
    burstUntil = Date.now() + quietMs;
    run();
  }

  return {
    trigger() {
      const pending = quietTimer !== undefined;
      if (!pending && Date.now() >= burstUntil) {
        flush();
        return;
      }
      clearTimeout(quietTimer);
      quietTimer = setTimeout(flush, quietMs);
      maxTimer ??= setTimeout(flush, maxWaitMs);
    },
    cancel() {
      clearTimeout(quietTimer);
      clearTimeout(maxTimer);
      quietTimer = undefined;
      maxTimer = undefined;
    },
  };
}
