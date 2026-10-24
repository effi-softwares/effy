import { Store } from "@tanstack/react-store"

/**
 * The shop console's own client state beside the shared UI store: whether the new-order chime is
 * wanted on this device, whether the browser will let it play yet, and the header's scan dialog.
 * Genuine client state only — never server data (Principle VI).
 */
export interface ConsoleState {
  /** The operator's choice, remembered on this device. On by default: a new order must not be missed. */
  soundOn: boolean
  /** Whether the browser will play sound yet. Browsers only allow it after a tap or a key press. */
  audioReady: boolean
  scanOpen: boolean
}

const SOUND_KEY = "effy-shop.sound"

function readSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off"
  } catch {
    return true
  }
}

export const consoleStore = new Store<ConsoleState>({
  soundOn: typeof window === "undefined" ? true : readSound(),
  audioReady: false,
  scanOpen: false,
})

export function setSoundOn(on: boolean): void {
  consoleStore.setState((s) => ({ ...s, soundOn: on }))
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off")
  } catch {
    /* storage blocked — the choice lasts for this visit */
  }
}

export function setAudioReady(ready: boolean): void {
  consoleStore.setState((s) => (s.audioReady === ready ? s : { ...s, audioReady: ready }))
}

export function setScanOpen(open: boolean): void {
  consoleStore.setState((s) => ({ ...s, scanOpen: open }))
}
