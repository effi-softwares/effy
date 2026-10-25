import { useEffect, useRef } from "react"

import { useLocation, useNavigate } from "@tanstack/react-router"

import { toast } from "@effy/design-system/ui"
import { createWedge } from "@effy/web-kit/scanner"

import { lookupLabel } from "@/features/orders/repo"
import type { AdminLookupDTO } from "@effy/shared-types"

const TOKEN = /^EFY1:[2-9A-HJKMNP-TV-Z]{6}$/

export function lookupLink(found: AdminLookupDTO) {
  return {
    to: "/orders/$orderId" as const,
    params: { orderId: found.orderId },
    search: found.parcelId ? { parcel: found.parcelId } : found.fulfillmentId ? { package: found.fulfillmentId } : {},
  }
}

export function ScanBox() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const off = pathname.startsWith("/hub")
  const busy = useRef(false)

  useEffect(() => {
    if (off) return
    const onKey = createWedge({
      accept: (t) => TOKEN.test(t),
      onScan: async (raw) => {
        if (busy.current) return
        busy.current = true
        try {
          const found = await lookupLabel(raw, "scan")
          if (!found) {
            toast.error("No bag has that label.")
            return
          }
          if (found.voided) toast("That label was removed from its order. Throw it away.")
          void navigate(lookupLink(found) as never)
        } catch {
          toast.error("Couldn't look that label up. Try again.")
        } finally {
          busy.current = false
        }
      },
    })
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable) return
      if (onKey({ key: e.key, at: e.timeStamp, field: null })) e.preventDefault()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [off, navigate])

  return null
}
