import { useState } from "react"

import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import { Loader2, ScanBarcode } from "lucide-react"

import {
  Button,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"
import { ScanField } from "@effy/web-kit/scanner"

import { listOrders } from "@/features/fulfillment/repo"
import { consoleStore, setScanOpen } from "@/lib/console-store"

/**
 * "Scan from anywhere" (Orders board 03): the header's Scan button opens a dialog that takes a scanner's
 * read or a typed order number and opens that order. It asks the order list's own search — one match
 * opens the order, anything else opens the list searched for it, so the operator sees why.
 */
export function ScanButton() {
  const open = useStore(consoleStore, (s) => s.scanOpen)
  const setOpen = setScanOpen
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function find(raw: string) {
    const q = raw.trim()
    if (!q || busy) return
    setBusy(true)
    try {
      const list = await queryClient.fetchQuery({
        queryKey: ["shop-orders", "scan", q],
        queryFn: () => listOrders({ q }),
        staleTime: 0,
      })
      setOpen(false)
      if (list.items.length === 1) {
        void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId: list.items[0]!.id } })
      } else {
        void navigate({ to: "/orders", search: { q } })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} aria-label="Scan">
        <ScanBarcode aria-hidden="true" />
        <span className="max-sm:hidden">Scan</span>
      </Button>
      <ResponsiveModal open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <ResponsiveModalContent className="sm:max-w-[520px]">
          <ResponsiveModalHeader>
            <ResponsiveModalTitle>Scan from anywhere</ResponsiveModalTitle>
            <ResponsiveModalDescription>
              Scan a bag label, or type an order number. The order opens by itself.
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>
          <div className="grid gap-3 max-md:px-4 max-md:pb-6">
            {open ? (
              <ScanField
                accept={(t) => t.trim().length >= 3}
                onRead={({ raw }) => void find(raw)}
                camera={false}
                listenGlobally={false}
                placeholder="Scan, or type an order number"
                label="Scan or type an order number"
                size="large"
                disabled={busy}
              />
            ) : null}
            {busy ? (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Finding the order…
              </p>
            ) : null}
          </div>
        </ResponsiveModalContent>
      </ResponsiveModal>
    </>
  )
}
