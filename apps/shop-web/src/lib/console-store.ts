import { Store } from "@tanstack/react-store"

interface ConsoleState {
  soundOn: boolean
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
  } catch {}
}

export function setAudioReady(ready: boolean): void {
  consoleStore.setState((s) => (s.audioReady === ready ? s : { ...s, audioReady: ready }))
}

export function setScanOpen(open: boolean): void {
  consoleStore.setState((s) => ({ ...s, scanOpen: open }))
}
