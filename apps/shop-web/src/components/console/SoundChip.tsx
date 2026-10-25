import { useEffect } from "react"

import { useStore } from "@tanstack/react-store"
import { Volume2, VolumeX } from "lucide-react"

import { unlockAudio, unlockOnFirstGesture } from "@/lib/chime"
import { consoleStore, setSoundOn } from "@/lib/console-store"
import { cn } from "@/lib/utils"

export function SoundChip() {
  const { soundOn, audioReady } = useStore(consoleStore, (s) => s)

  useEffect(() => unlockOnFirstGesture(), [])

  if (soundOn && !audioReady) {
    return (
      <button type="button" className="sh-chip is-solid" onClick={unlockAudio}>
        <VolumeX aria-hidden="true" />
        <span className="max-md:sr-only">Tap to turn sound on</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      className={cn("sh-chip")}
      aria-pressed={soundOn}
      onClick={() => {
        setSoundOn(!soundOn)
        unlockAudio()
      }}
    >
      {soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      <span className="max-md:sr-only">{soundOn ? "Sound on" : "Sound off"}</span>
    </button>
  )
}
