import { useState } from "react"

import { HOLD_REASON_MAX, type BackOfficeProductDTO } from "@effy/shared-types"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Label,
  Textarea,
} from "@effy/design-system/ui"

import { useHoldProduct, useReleaseProduct } from "./queries"
import { productErrorText } from "./words"

/** Hold: off sale at once, with a reason the shop reads (from Effy, never a person). */
export function HoldDialog({
  product,
  open,
  onOpenChange,
}: {
  product: BackOfficeProductDTO
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const hold = useHoldProduct(product.productId)
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const busy = hold.isPending

  function submit() {
    setError(null)
    hold.mutate(
      { version: product.version, reason: reason.trim() },
      {
        onSuccess: () => {
          setReason("")
          onOpenChange(false)
        },
        onError: (err) => setError(productErrorText(err)),
      },
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hold {product.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It comes off sale straight away: customers can no longer find or buy it, and {product.shop.name} cannot put
            it back on sale. It stays held until Effy releases it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="hold-reason">Why is it being held?</Label>
          <Textarea
            id="hold-reason"
            rows={3}
            maxLength={HOLD_REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The maker has recalled this batch."
          />
          <p className="mt-0.5 block text-sm text-muted-foreground">
            The shop sees this, from Effy - not from you by name.
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy || reason.trim() === ""} onClick={submit}>
            Hold product
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const RELEASED_TO: Record<"draft" | "active" | "unavailable", string> = {
  active: "It is back on sale.",
  unavailable: "It is off sale, as the shop had it.",
  draft: "It is a draft again, as it was.",
}

/** Release: back to where the hold found it. Says so when it cannot go back on sale. */
export function ReleaseDialog({
  product,
  open,
  onOpenChange,
  onReleased,
}: {
  product: BackOfficeProductDTO
  open: boolean
  onOpenChange: (open: boolean) => void
  onReleased: (message: string) => void
}) {
  const release = useReleaseProduct(product.productId)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    release.mutate(
      { version: product.version },
      {
        onSuccess: (r) => {
          onOpenChange(false)
          onReleased(
            r.notOnSaleBecause === "no_main_picture"
              ? "Released. It was on sale before, but it has no main picture now, so it is off sale until the shop adds one."
              : r.notOnSaleBecause === "shop_not_active"
                ? "Released. It was on sale before, but the shop is not active, so it stays off sale."
                : `Released. ${RELEASED_TO[r.releasedTo]}`,
          )
        },
        onError: (err) => setError(productErrorText(err)),
      },
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => (release.isPending ? null : onOpenChange(o))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Release {product.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It goes back to the state it was in when it was held, and {product.shop.name} is told.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={release.isPending}>Cancel</AlertDialogCancel>
          <Button disabled={release.isPending} onClick={submit}>
            Release
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
