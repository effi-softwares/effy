import { useState } from "react"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from "@effy/design-system/ui"

/** The reasons reviewers write most often, said as Effy says them to a shop. One click fills the message. */
export const SEND_BACK_REASONS: readonly { label: string; text: string }[] = [
  {
    label: "Picture",
    text: "The main picture isn't the product itself — use a photo of the product, not a stock image.",
  },
  {
    label: "Price rise",
    text: "A price rises by more than we can approve without a reason. Tell us the supplier's new cost in your next change, or keep today's price.",
  },
  { label: "Required details", text: "Fill in the required details — they are marked on your product page." },
  {
    label: "Description",
    text: "The description mentions prices or delivery promises — Effy says those. Please remove them.",
  },
  { label: "Category", text: "It's filed in the wrong aisle. Move it to the category that matches what it is." },
]

const MAX = 500

/** Asks why before a submission goes back to its shop; the shop sees the reason from Effy, never a person. */
export function SendBackDialog({
  open,
  onOpenChange,
  shopName,
  isChange,
  busy,
  error,
  onSend,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shopName: string
  isChange: boolean
  busy: boolean
  error: string | null
  onSend: (reason: string) => void
}) {
  const [reason, setReason] = useState("")
  const [picked, setPicked] = useState<string | null>(null)

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Send back to {shopName}?</DialogTitle>
          <DialogDescription>
            {isChange ? "The live product stays as it is." : "The product stays off sale."} The shop sees why, from Effy
            — not from you by name — and can fix it and send it again.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common reasons">
            {SEND_BACK_REASONS.map((r) => (
              <Button
                key={r.label}
                type="button"
                size="sm"
                variant={picked === r.label ? "default" : "outline"}
                aria-pressed={picked === r.label}
                disabled={busy}
                onClick={() => {
                  setPicked(r.label)
                  setReason(r.text)
                }}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Label htmlFor="send-back-reason">Why is it being sent back?</Label>
          <Textarea
            id="send-back-reason"
            rows={4}
            maxLength={MAX}
            value={reason}
            disabled={busy}
            onChange={(e) => {
              setReason(e.target.value)
              setPicked(null)
            }}
            placeholder="Pick a reason above, or write your own"
            autoFocus
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {reason.length} / {MAX}
          </p>
          {error ? (
            <p role="alert" className="text-sm font-medium">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || reason.trim() === ""} onClick={() => onSend(reason.trim())}>
            {busy ? "Sending…" : "Send back to shop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
