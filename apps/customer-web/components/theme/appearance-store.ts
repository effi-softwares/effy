"use client"

import * as React from "react"

/**
 * The storefront's appearance store (017 FR-009, rebuilt without `next-themes` — 025 T102).
 *
 * ── Why this exists rather than the library ─────────────────────────────────────────────────────
 *
 * `next-themes` cost **~8.3 KB gzipped on every guest page**, measured during T020. The guest
 * first-load budget is a hard build gate, and the storefront's whole design is that a guest
 * downloads as little as possible — so an 8 KB provider for "which of three values is stored"
 * is the single most expensive dependency-per-line on the public path.
 *
 * ⚠ Nothing here is a simplification of what the library did. All four hard parts are reproduced,
 * because each one is a real bug if you drop it:
 *
 *   1. **No flash of the wrong theme.** Handled by `themeScript` below, which runs BEFORE paint.
 *      This module is a client component; anything it does happens after hydration, which is far
 *      too late — a dark-mode visitor would see a white page first.
 *   2. **`system` tracks the OS live.** A shopper who flips their phone to dark at sunset while the
 *      page is open sees it follow, without a reload.
 *   3. **Cross-tab sync**, via the `storage` event. Two open tabs must not disagree.
 *   4. **Transitions suppressed during the switch**, or every colour on the page cross-fades at once
 *      and the change reads as a slow smear rather than a switch.
 *
 * ⚠ The storage KEY and VALUES are deliberately `next-themes`' defaults (`"theme"`, and
 * `light | dark | system`). Anyone who already chose an appearance keeps it; this migration is
 * invisible to them. Changing the key would silently reset every existing visitor to System.
 */

export type Appearance = "light" | "dark" | "system"

export const APPEARANCE_KEY = "theme"

const DARK_QUERY = "(prefers-color-scheme: dark)"

function isAppearance(value: unknown): value is Appearance {
  return value === "light" || value === "dark" || value === "system"
}

/** Read the stored choice. Anything unrecognised — or an unreadable store — means System (FR-013). */
export function readAppearance(): Appearance {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_KEY)
    return isAppearance(stored) ? stored : "system"
  } catch {
    // Private browsing, disabled storage, or a sandboxed iframe. Not being able to REMEMBER a
    // preference must never stop the page rendering with a sensible one.
    return "system"
  }
}

/** Resolve a mode to the concrete appearance. Only `system` consults the device. */
export function resolveDark(mode: Appearance): boolean {
  if (mode === "light") return false
  if (mode === "dark") return true
  try {
    return window.matchMedia(DARK_QUERY).matches
  } catch {
    return false
  }
}

/**
 * Write the resolved appearance to the document.
 *
 * `colorScheme` is set alongside the class and is not optional: it is what tells the browser to
 * render form controls, scrollbars and the address bar in the matching appearance. Without it a dark
 * page gets white scrollbars and white select dropdowns, which looks like a bug in the CSS.
 */
function apply(dark: boolean): void {
  const root = document.documentElement
  root.classList.toggle("dark", dark)
  root.style.colorScheme = dark ? "dark" : "light"
}

/**
 * Apply while suppressing transitions.
 *
 * Every themed element has a colour transition; switching appearance without this makes all of them
 * animate simultaneously, which reads as the page melting rather than as a setting changing. The
 * forced reflow between injecting and removing the override is what makes the browser commit the
 * new colours before transitions are re-enabled — remove it and the suppression does nothing.
 */
function applyWithoutTransition(dark: boolean): void {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode("*,*::before,*::after{transition:none!important}"),
  )
  document.head.appendChild(style)

  apply(dark)

  // Read a layout property to force the style flush. The void cast documents that the VALUE is
  // deliberately discarded — this line exists for its side effect and a linter should not "fix" it.
  void window.getComputedStyle(document.body).opacity
  document.head.removeChild(style)
}

// ── The store ───────────────────────────────────────────────────────────────────────────────────

const listeners = new Set<() => void>()

/** Cached so `getSnapshot` is referentially stable — returning a fresh value each call loops React. */
let snapshot: Appearance | null = null

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)

  // Another tab changed the choice.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== APPEARANCE_KEY) return
    snapshot = readAppearance()
    apply(resolveDark(snapshot))
    emit()
  }

  // The OS appearance changed. Only matters while the choice is `system`, but the listener is always
  // attached: attaching it conditionally would mean re-subscribing on every mode change for no gain.
  const media = window.matchMedia(DARK_QUERY)
  const onMedia = () => {
    if ((snapshot ?? readAppearance()) === "system") apply(resolveDark("system"))
  }

  window.addEventListener("storage", onStorage)
  media.addEventListener("change", onMedia)

  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onStorage)
    media.removeEventListener("change", onMedia)
  }
}

function getSnapshot(): Appearance {
  if (snapshot === null) snapshot = readAppearance()
  return snapshot
}

/**
 * ⚠ The server cannot know the choice — it lives in `localStorage`, which is why the pre-paint script
 * exists at all. Returning `"system"` here is what makes `useSyncExternalStore` render the neutral
 * state during SSR and hydration and then immediately re-render with the real one, which is the
 * documented way to avoid a hydration mismatch. It is NOT a guess at the shopper's preference: the
 * DOM already has the right class by this point, so only the control's own active state is briefly
 * neutral.
 */
function getServerSnapshot(): Appearance {
  return "system"
}

/** Persist and apply a choice. */
export function setAppearance(mode: Appearance): void {
  snapshot = mode
  try {
    window.localStorage.setItem(APPEARANCE_KEY, mode)
  } catch {
    // Unreadable storage means the choice does not survive the session. It still applies now.
  }
  applyWithoutTransition(resolveDark(mode))
  emit()
}

/** The current choice, re-rendering the caller when it changes. */
export function useAppearance(): Appearance {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Test seam — resets module state between cases. Not used by the app. */
export function __resetAppearanceStoreForTests(): void {
  snapshot = null
  listeners.clear()
}
