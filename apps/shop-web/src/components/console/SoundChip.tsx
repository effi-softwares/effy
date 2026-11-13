import { useEffect } from "react"

import { useStore } from "@tanstack/react-store"
import { Volume2, VolumeX } from "lucide-react"

import { subscribeAudio, unlockAudio, unlockOnFirstGesture } from "@effy/design-system/toast"
import { Button } from "@effy/design-system/ui"

import { consoleStore, setAudioReady, setSoundOn } from "@/lib/console-store"

export function SoundChip() {
  const { soundOn, audioReady } = useStore(consoleStore, (s) => s)

  useEffect(() => {
    // The platform's one sound set (120) says when audio can play; the chip shows it.
    const stopListening = subscribeAudio(setAudioReady)
    const stopUnlocking = unlockOnFirstGesture()
    return () => {
      stopListening()
      stopUnlocking()
    }
  }, [])

  if (soundOn && !audioReady) {
    return (
      <Button type="button" size="sm" className="rounded-full" data-tour="header.sound" onClick={unlockAudio}>
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
      data-tour="header.sound"
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
