/** The page's one toaster, wired to the Effy sound set (explicit wiring, no container - constitution VI). */
import { cueFor } from "./cue";
import { createToaster, toastApi } from "./store";

export const toaster = createToaster({
  cue: (kind, policy, asked) => {
    const cue = cueFor(kind, policy, asked);
    // Fetched on first use, so a page that never plays a tone never downloads the sound set.
    if (cue) void import("./sound").then((s) => s.playCue(cue), () => undefined);
  },
});

export const toast = toastApi(toaster);
