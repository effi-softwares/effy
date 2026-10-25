import { setAudioReady } from "./console-store"

let ctx: AudioContext | null = null

function context(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    ctx = new Ctor()
    ctx.addEventListener("statechange", () => setAudioReady(ctx?.state === "running"))
  }
  return ctx
}

export function unlockAudio(): void {
  const c = context()
  if (!c) return
  if (c.state === "running") {
    setAudioReady(true)
    return
  }
  void c
    .resume()
    .then(() => setAudioReady(c.state === "running"))
    .catch(() => setAudioReady(false))
}

export function unlockOnFirstGesture(): () => void {
  const onGesture = () => unlockAudio()
  window.addEventListener("pointerdown", onGesture, { once: false, passive: true })
  window.addEventListener("keydown", onGesture)
  return () => {
    window.removeEventListener("pointerdown", onGesture)
    window.removeEventListener("keydown", onGesture)
  }
}

export function playChime(): void {
  const c = context()
  if (!c || c.state !== "running") return
  const now = c.currentTime
  for (const [i, freq] of [880, 1318.5].entries()) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    const start = now + i * 0.18
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32)
    osc.connect(gain).connect(c.destination)
    osc.start(start)
    osc.stop(start + 0.34)
  }
}
