import { useStore } from "@tanstack/react-store"

import { Toaster } from "@effy/design-system/ui"

import { consoleStore } from "@/lib/console-store"

/** The console's one Toaster: its tones play when, and only when, the shop's Sound setting is on (120 FR-019). */
export function ShopToaster() {
  const soundOn = useStore(consoleStore, (s) => s.soundOn)
  return <Toaster position="top-center" sound={soundOn ? "on" : "off"} />
}
