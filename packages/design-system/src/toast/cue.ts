/**
 * Which tone a toast plays (spec FR-018-FR-021, research R4). Kept apart from the sound set itself so a page that never
 * plays sound (the storefront) never downloads it: the tones are fetched the first time one is actually wanted.
 */
import type { Kind, SoundPolicy } from "./types";

export type Cue = "success" | "error" | "warning" | "info" | "new-order";

/** Which cue, if any, a toast of this kind plays under this policy. In progress never plays. */
export function cueFor(kind: Kind, policy: SoundPolicy, asked: boolean): Cue | null {
  if (kind === "loading") return null;
  if (policy === "on") return kind;
  if (policy === "opt-in" && asked) return kind;
  return null;
}
