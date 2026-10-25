import { useCallback, useState } from "react"

import { useOnDemand } from "@/lib/use-on-demand"

/**
 * The overlays a guest route opens. radix and vaul are kept out of the guest first load
 * (`scripts/dependency-cruiser.cjs`), so these modules are fetched when the shopper reaches for the
 * control — pointer or focus on it, or the press itself — and stay loaded.
 */
export const loadDialog = () => import("@/components/ui/dialog").then((m) => m.Dialog)
export const loadSideDrawer = () => import("./SideDrawer").then((m) => m.SideDrawer)

/**
 * Open state for an on-demand overlay, plus `want` to start fetching it early (wire it to the trigger's
 * `onPointerEnter` / `onFocus`). `Overlay` is null until its module has arrived; a press before then
 * opens it the moment it does. `wanted` turns true with the first of either, for anything else the
 * overlay needs fetched alongside it.
 */
export function useLazyOverlay<P>(load: () => Promise<React.ComponentType<P>>) {
  const [open, setOpen] = useState(false)
  const [reached, setReached] = useState(false)
  const want = useCallback(() => setReached(true), [])
  const wanted = reached || open
  const Overlay = useOnDemand(load, wanted)
  return { Overlay, open, setOpen, want, wanted }
}
