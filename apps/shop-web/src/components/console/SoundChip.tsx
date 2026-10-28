import { useEffect } from "react"

import { useStore } from "@tanstack/react-store"
import { Volume2, VolumeX } from "lucide-react"

import { Button } from "@effy/design-system/ui"

import { unlockAudio, unlockOnFirstGesture } from "@/lib/chime"
import { consoleStore, setSoundOn } from "@/lib/console-store"

export function SoundChip() {
  const { soundOn, audioReady } = useStore(consoleStore, (s) => s)

  useEffect(() => unlockOnFirstGesture(), [])

  if (soundOn && !audioReady) {
    return (
      <Button type="button" size="sm" className="rounded-full" onClick={unlockAudio}>
        <VolumeX aria-hidden="true" />
        <span className="max-md:sr-only">Tap to turn sound on</span>
      </Button>
    )
  }
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="rounded-full"
      aria-pressed={soundOn}
      onClick={() => {
        setSoundOn(!soundOn)
        unlockAudio()
      }}
    >
      {soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      <span className="max-md:sr-only">{soundOn ? "Sound on" : "Sound off"}</span>
    </Button>
  )
}
