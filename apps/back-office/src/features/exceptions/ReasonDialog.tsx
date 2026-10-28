import { useEffect, useState } from "react"

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

interface Props {
  label: string
  title: string
  description: string
  fieldLabel: string
  confirmLabel: string
  onConfirm: (text: string) => Promise<string | null>
  /** Opened from elsewhere (a "More" menu): no button of its own. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ReasonDialog({
  label,
  title,
  description,
  fieldLabel,
  confirmLabel,
  onConfirm,
  open: openProp,
  onOpenChange,
}: Props) {
  const [ownOpen, setOwnOpen] = useState(false)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : ownOpen
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOwnOpen(next))
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setText("")
      setError(null)
    }
  }, [open])
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    setError(null)
    const problem = await onConfirm(text.trim())
    setBusy(false)
    if (problem) setError(problem)
    else setOpen(false)
  }

  return (
    <>
      {controlled ? null : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason-text">{fieldLabel}</Label>
            <Textarea
              id="reason-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={busy || text.trim().length < 3}>
              {busy ? "Saving…" : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
