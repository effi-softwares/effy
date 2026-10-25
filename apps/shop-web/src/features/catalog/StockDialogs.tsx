import { useState, type ReactNode } from "react"

import { type OperatorStockReason, type ProductStockDTO, OPERATOR_STOCK_REASONS } from "@effy/shared-types"
import {
  Button,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui"

import { CatalogModal } from "./CatalogModal"
import { signedNumber, wholeNumber } from "./numberInput"
import { stockErrorText } from "./stockErrorText"
import { useAdjustStock, useSetStockCount, useSetStockTracking } from "./stockQueries"

const REASON_LABELS: Record<OperatorStockReason, string> = {
  received: "Stock received",
  correction: "Correction",
  damage: "Damaged",
  expiry: "Expired",
}

function Refusal({ error }: { error: unknown }) {
  return (
    <p role="alert" className="text-sm font-medium">
      {stockErrorText(error)}
    </p>
  )
}

interface DialogProps {
  variantId: string
  stock: ProductStockDTO
  open: boolean
  onOpenChange: (open: boolean) => void
  sizeLabel?: string | null
  sizeControl?: ReactNode
}

type FormProps = Omit<DialogProps, "open" | "onOpenChange"> & { onClose: () => void }

const titled = (title: string, sizeLabel: string | null | undefined) => (sizeLabel ? `${title} — ${sizeLabel}` : title)

export function ReceiveStockDialog({ open, onOpenChange, ...props }: DialogProps) {
  return (
    <CatalogModal open={open} onOpenChange={onOpenChange}>
      <ReceiveStockForm {...props} onClose={() => onOpenChange(false)} />
    </CatalogModal>
  )
}

function ReceiveStockForm({ variantId, stock, sizeLabel, sizeControl, onClose }: FormProps) {
  const adjust = useAdjustStock(variantId)
  const [units, setUnits] = useState("")
  const [note, setNote] = useState("")

  const parsed = wholeNumber(units)
  const valid = parsed !== null && parsed > 0
  const onHand = stock.onHand ?? 0

  function submit() {
    if (!valid) return
    adjust.mutate(
      { delta: parsed, reason: "received", note: note.trim() === "" ? undefined : note.trim() },
      { onSuccess: onClose },
    )
  }

  return (
    <>
      <ResponsiveModalHeader>
        <ResponsiveModalTitle>{titled("Receive stock", sizeLabel)}</ResponsiveModalTitle>
        <ResponsiveModalDescription>
          Add counted units to the shelf. Nothing else about the product changes.
        </ResponsiveModalDescription>
      </ResponsiveModalHeader>

      <div className="grid gap-4">
        {sizeControl}
        <div className="grid gap-1.5">
          <Label htmlFor="receive-units">Units received</Label>
          <Input
            id="receive-units"
            inputMode="numeric"
            autoComplete="off"
            className="w-32"
            placeholder="0"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="receive-note">Note (optional)</Label>
          <Textarea
            id="receive-note"
            rows={2}
            placeholder="Anything worth remembering about this delivery."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="border-border flex items-baseline justify-between border-t pt-3.5">
          <span className="text-muted-foreground text-[13px]">On hand after this</span>
          <span className="text-base font-semibold tabular-nums">
            {valid ? `${onHand} → ${onHand + parsed}` : onHand}
          </span>
        </div>

        {adjust.isError ? <Refusal error={adjust.error} /> : null}
      </div>

      <ResponsiveModalFooter>
        <Button variant="outline" onClick={onClose} disabled={adjust.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!valid || adjust.isPending}>
          {adjust.isPending ? "Adding…" : "Add to stock"}
        </Button>
      </ResponsiveModalFooter>
    </>
  )
}

export function StartTrackingDialog({ open, onOpenChange, ...props }: Omit<DialogProps, "stock">) {
  return (
    <CatalogModal open={open} onOpenChange={onOpenChange}>
      <StartTrackingForm {...props} onClose={() => onOpenChange(false)} />
    </CatalogModal>
  )
}

function StartTrackingForm({ variantId, sizeLabel, sizeControl, onClose }: Omit<FormProps, "stock">) {
  const setTracking = useSetStockTracking(variantId)
  const [units, setUnits] = useState("")

  const parsed = wholeNumber(units)
  const valid = parsed !== null

  function submit() {
    if (!valid) return
    setTracking.mutate({ tracked: true, onHand: parsed }, { onSuccess: onClose })
  }

  return (
    <>
      <ResponsiveModalHeader>
        <ResponsiveModalTitle>{titled("Add stock", sizeLabel)}</ResponsiveModalTitle>
        <ResponsiveModalDescription>
          This isn&apos;t counted yet. Enter how many you have and Effy starts keeping count from there.
        </ResponsiveModalDescription>
      </ResponsiveModalHeader>

      <div className="grid gap-4">
        {sizeControl}
        <div className="grid gap-1.5">
          <Label htmlFor="start-units">Units in stock now</Label>
          <Input
            id="start-units"
            inputMode="numeric"
            autoComplete="off"
            className="w-32"
            placeholder="0"
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />
          <p className="text-muted-foreground text-[12.5px]">
            Required — counting cannot start from an unknown number.
          </p>
        </div>

        <div className="border-border border-t pt-3.5">
          <p className="text-muted-foreground text-[12.5px]">
            Stock tracking will be turned on: each paid order deducts a unit, and the product stops selling at zero. You
            can turn it off again, or set a low-stock threshold, under Edit rules.
          </p>
        </div>

        {setTracking.isError ? <Refusal error={setTracking.error} /> : null}
      </div>

      <ResponsiveModalFooter>
        <Button variant="outline" onClick={onClose} disabled={setTracking.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!valid || setTracking.isPending}>
          {setTracking.isPending ? "Adding…" : "Add stock"}
        </Button>
      </ResponsiveModalFooter>
    </>
  )
}

export function AdjustStockDialog({ open, onOpenChange, ...props }: DialogProps) {
  return (
    <CatalogModal open={open} onOpenChange={onOpenChange}>
      <AdjustStockForm {...props} onClose={() => onOpenChange(false)} />
    </CatalogModal>
  )
}

function AdjustStockForm({ variantId, stock, sizeLabel, sizeControl, onClose }: FormProps) {
  const setCount = useSetStockCount(variantId)
  const adjust = useAdjustStock(variantId)

  const [mode, setMode] = useState<"set" | "adjust">("set")
  const [value, setValue] = useState("")
  const [reason, setReason] = useState<OperatorStockReason>("correction")
  const [note, setNote] = useState("")

  const parsed = mode === "set" ? wholeNumber(value) : signedNumber(value)
  const onHand = stock.onHand ?? 0
  const after = parsed === null ? null : mode === "set" ? parsed : Math.max(0, onHand + parsed)

  const pending = setCount.isPending || adjust.isPending
  const failure = setCount.error ?? adjust.error

  function submit() {
    if (parsed === null) return
    const trimmed = note.trim()
    const done = { onSuccess: onClose }
    if (mode === "set") {
      setCount.mutate({ onHand: parsed, reason, note: trimmed === "" ? undefined : trimmed }, done)
    } else {
      adjust.mutate({ delta: parsed, reason, note: trimmed === "" ? undefined : trimmed }, done)
    }
  }

  return (
    <>
      <ResponsiveModalHeader>
        <ResponsiveModalTitle>{titled("Adjust stock", sizeLabel)}</ResponsiveModalTitle>
        <ResponsiveModalDescription>
          Correct the counted quantity. Every change is recorded with who made it and why.
        </ResponsiveModalDescription>
      </ResponsiveModalHeader>

      <div className="grid gap-4">
        {sizeControl}
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="adjust-mode">Change</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                setMode(v as "set" | "adjust")
                setValue("")
              }}
            >
              <SelectTrigger id="adjust-mode" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="set">Set exact count</SelectItem>
                <SelectItem value="adjust">Add or remove</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="adjust-value">{mode === "set" ? "New count" : "Change by"}</Label>
            <Input
              id="adjust-value"
              inputMode={mode === "set" ? "numeric" : "text"}
              autoComplete="off"
              className="w-32"
              placeholder={mode === "set" ? "0" : "e.g. 24 or -3"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as OperatorStockReason)}>
              <SelectTrigger id="adjust-reason" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATOR_STOCK_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="adjust-note">Note (optional)</Label>
          <Textarea id="adjust-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="border-border flex items-baseline justify-between border-t pt-3.5">
          <span className="text-muted-foreground text-[13px]">On hand after this</span>
          <span className="text-base font-semibold tabular-nums">
            {after === null ? onHand : `${onHand} → ${after}`}
          </span>
        </div>

        {failure ? <Refusal error={failure} /> : null}
      </div>

      <ResponsiveModalFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={parsed === null || pending}>
          {pending ? "Saving…" : "Save adjustment"}
        </Button>
      </ResponsiveModalFooter>
    </>
  )
}
