/** The toast's public shapes (contracts/toast-api.md, data-model.md - feature 120). */

export type Kind = "success" | "error" | "warning" | "info" | "loading";

/** Who hears a toast's tone: every toast, nobody, only toasts that ask (`sound: true`), or never (storefront). */
export type SoundPolicy = "on" | "off" | "opt-in" | "never";

export type Position = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export interface ToastButton {
  label: string;
  /** Return a patch to change the toast in place (e.g. Undo → "Restored"); return nothing to close it. */
  onClick: () => void | ToastPatch;
}

export interface ToastOptions {
  description?: string;
  action?: ToastButton;
  secondary?: ToastButton;
  /** 0-1: a thin bar. Progress-only changes are silent and are not read out. */
  progress?: number;
  /** A small round picture in place of the mark. */
  image?: string;
  /** A short trailing note, e.g. "now". */
  meta?: string;
  /** ms before it closes by itself; 0 = until closed. */
  duration?: number;
  /** Ask for this toast's tone where the Toaster's policy is "opt-in". */
  sound?: boolean;
  /** The caller key: repeated calls with one id are one caller. */
  id?: string;
}

/** Every field optional; `null` removes it. */
export interface ToastPatch {
  kind?: Kind;
  title?: string;
  description?: string | null;
  action?: ToastButton | null;
  secondary?: ToastButton | null;
  progress?: number | null;
  image?: string | null;
  meta?: string | null;
  duration?: number;
  sound?: boolean;
}

/** What a caller asked for. */
export interface Message {
  kind: Kind;
  title: string;
  description?: string;
  action?: ToastButton;
  secondary?: ToastButton;
  progress?: number;
  image?: string;
  meta?: string;
  duration?: number;
  sound?: boolean;
}

/** `entering`: the mark arrives · `open`: the message is out · `closing`: it folds back and leaves. */
export type Phase = "entering" | "open" | "closing";

/** What is on screen. */
export interface Toast {
  /** Stable for the life of the on-screen toast. */
  key: string;
  message: Message;
  /** The caller allowed to change it in place. */
  owner: string;
  /** Repeat count, from 1. */
  count: number;
  phase: Phase;
  /** Its life in ms; 0 = until closed. */
  life: number;
  /** Raised on every change of message, so the view can react. */
  version: number;
}

export interface LiveText {
  polite: string;
  assertive: string;
}

export interface ToasterState {
  visible: Toast | null;
  liveText: LiveText;
}

export interface PromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((error: unknown) => string);
}
