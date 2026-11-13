/**
 * Effy's own toast (feature 120) - the only way a web surface shows a toast (contracts/toast-api.md), and the
 * platform's one set of sounds (contracts/sound-api.md). Imports nothing outside React and this folder, so the
 * storefront's guest pages can load it.
 */
export { toast } from "./instance";
export { Toaster, type ToasterProps } from "./Toaster";
export {
  audioReady,
  playCue,
  previewCue,
  subscribeAudio,
  unlockAudio,
  unlockOnFirstGesture,
} from "./sound";
export type { Cue } from "./cue";
export type {
  Kind,
  Position,
  PromiseMessages,
  SoundPolicy,
  ToastButton,
  ToastOptions,
  ToastPatch,
} from "./types";
