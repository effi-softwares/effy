import { useCallback, useState } from "react"

import { useOnDemand } from "@/lib/use-on-demand"

export const loadDialog = () => import("@/components/ui/dialog").then((m) => m.Dialog)
export const loadSideDrawer = () => import("./SideDrawer").then((m) => m.SideDrawer)

export function useLazyOverlay<P>(load: () => Promise<React.ComponentType<P>>) {
  const [open, setOpen] = useState(false)
  const [reached, setReached] = useState(false)
  const want = useCallback(() => setReached(true), [])
  const wanted = reached || open
  const Overlay = useOnDemand(load, wanted)
  return { Overlay, open, setOpen, want, wanted }
}
