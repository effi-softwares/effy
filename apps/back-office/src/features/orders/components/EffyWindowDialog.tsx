import { useQuery } from "@tanstack/react-query"
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
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from "@effy/design-system/ui"

import { deliveryMoveError, deliveryMoveRefusalText } from "../errorText"
import { deliveryMovePreviewQuery } from "../queries"

interface ChosenWindow {
  window: { slotId: string; date: string }
  reason: string
  expectedUpdatedAt: string
}

export interface EffyWindowDialogCopy {
  title: string
  description: string
  loading: string
  empty: string
  done: string
  legend: string
  submit: string
}

interface Props {
  orderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  copy: EffyWindowDialogCopy
  idPrefix: string
  checkAllowed?: boolean
  onSubmit: (chosen: ChosenWindow) => Promise<unknown>
}

const keyOf = (w: { slotId: string; date: string }) => `${w.slotId}|${w.date}`

export function EffyWindowDialog({ open, onOpenChange, copy, ...props }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <WindowPicker {...props} copy={copy} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function WindowPicker({
  orderId,
  copy,
  idPrefix,
  checkAllowed = false,
  onSubmit,
  onClose,
}: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const preview = useQuery(deliveryMovePreviewQuery(orderId, "effy"))
  const [reason, setReason] = useState("")
  const [selected, setSelected] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  const p = preview.data
  const windows = p?.windows ?? []
  const chosen = windows.find((w) => keyOf(w) === selected)
  const allowed = !checkAllowed || !!p?.allowed
  const canConfirm = !!p && allowed && !!chosen && reason.trim() !== "" && !pending

  async function confirm() {
    if (!p || !chosen) return
    setError(null)
    setPending(true)
    try {
      await onSubmit({
        window: { slotId: chosen.slotId, date: chosen.date },
        reason: reason.trim(),
        expectedUpdatedAt: p.updatedAt,
      })
      setDone(true)
    } catch (err) {
      setError(deliveryMoveError(err))
      await preview.refetch()
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      {done ? (
        <p className="text-sm font-medium" role="status">
          {copy.done}
        </p>
      ) : preview.isPending ? (
        <p className="text-sm text-muted-foreground">{copy.loading}</p>
      ) : !p ? (
        <p className="text-sm text-destructive" role="alert">
          {deliveryMoveError(preview.error)}
        </p>
      ) : !allowed ? (
        <p className="text-sm" role="alert">
          {deliveryMoveRefusalText(p.refusal?.code ?? "")}
        </p>
      ) : windows.length === 0 ? (
        <p className="text-sm" role="alert">
          {copy.empty}
        </p>
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{copy.legend}</legend>
            <RadioGroup value={selected} onValueChange={setSelected} aria-label={copy.legend}>
              {windows.map((w) => (
                <div key={keyOf(w)} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem id={`${idPrefix}-${keyOf(w)}`} value={keyOf(w)} />
                  <Label htmlFor={`${idPrefix}-${keyOf(w)}`} className={w.anyTime ? "font-medium" : "font-normal"}>
                    {w.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-reason`}>Why (staff only — the customer never sees this)</Label>
            <Textarea
              id={`${idPrefix}-reason`}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
      )}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        {done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canConfirm} onClick={() => void confirm()}>
              {copy.submit}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}
