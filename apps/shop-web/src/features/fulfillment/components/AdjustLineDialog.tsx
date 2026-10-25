import { useEffect, useState } from "react"
import { Minus, Plus } from "lucide-react"

import { Input, Textarea } from "@effy/design-system/ui"

import { ChoiceCards } from "@/components/console/ChoiceCards"
import { DesignSheet, SheetField } from "@/components/console/DesignSheet"
import { cn } from "@/lib/utils"

import { lineCodes } from "../codes"
import { pickModeOf, unitsError, type OrderLine, type PickMode } from "../orderConsole"

const AVAILABILITY: { value: Exclude<PickMode, "none">; label: string; description: string }[] = [
  { value: "full", label: "Picked in full", description: "Every unit went in the bag." },
  { value: "part", label: "Found some", description: "Say how many went in the bag." },
  { value: "unavailable", label: "Can't find any", description: "Effy refunds the customer for this line." },
]

export function AdjustLineDialog({
  line,
  preset,
  onClose,
  onSave,
  saving,
}: {
  line: OrderLine | null
  preset?: Exclude<PickMode, "none">
  onClose: () => void
  onSave: (mode: Exclude<PickMode, "none">, units: number, note: string) => void
  saving: boolean
}) {
  const [mode, setMode] = useState<Exclude<PickMode, "none">>("full")
  const [units, setUnits] = useState("")
  const [note, setNote] = useState("")
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!line) return
    const current = pickModeOf(line)
    setMode(preset ?? (current === "none" ? "full" : current))
    setUnits(current === "part" ? String(line.gatheredQuantity) : "")
    setNote(line.pickNote ?? "")
    setTouched(false)
  }, [line, preset])

  const ordered = line?.orderedQuantity ?? 0
  const err = mode === "part" ? unitsError(units, ordered) : null
  const showErr = mode === "part" && touched && !!err
  const n = Number(units) || 0
  const step = (d: number) => {
    setUnits(String(Math.max(0, Math.min(ordered, n + d))))
    setTouched(true)
  }

  return (
    <DesignSheet
      open={line !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Adjust this line"
      description="Use this when the line cannot simply be marked picked."
      saveLabel="Save line"
      saving={saving}
      onSave={() => {
        setTouched(true)
        if (err) return
        onSave(mode, mode === "part" ? Number(units) : 0, note.trim())
      }}
    >
      {line ? (
        <p className="font-medium">
          {line.name}
          {line.variantLabel ? ` · ${line.variantLabel}` : ""}
          <span className="block text-sm font-normal text-muted-foreground">
            {line.orderedQuantity} ordered · <span className="font-mono">{lineCodes(line.variantCode, line.sku)}</span>
          </span>
        </p>
      ) : null}
      <ChoiceCards label="Availability" value={mode} options={AVAILABILITY} onChange={setMode} />
      {mode === "part" ? (
        <div className="grid gap-2">
          <label htmlFor="adjust-units" className="text-base font-medium">
            Units picked
          </label>
          <div className="flex items-center gap-3">
            <div className="stepper">
              <button type="button" aria-label="One fewer" onClick={() => step(-1)} disabled={n <= 0}>
                <Minus aria-hidden="true" />
              </button>
              <Input
                id="adjust-units"
                inputMode="numeric"
                value={units}
                aria-invalid={showErr}
                onChange={(e) => {
                  setUnits(e.target.value)
                  setTouched(true)
                }}
                className="h-full! w-14 rounded-none! border-0! bg-transparent! text-center text-xl! font-semibold tabular-nums shadow-none!"
              />
              <button type="button" aria-label="One more" onClick={() => step(1)} disabled={n >= ordered}>
                <Plus aria-hidden="true" />
              </button>
            </div>
            <span className={cn("text-sm", showErr ? "font-medium text-foreground" : "text-muted-foreground")}>
              {showErr ? err : `Out of ${ordered} ordered.`}
            </span>
          </div>
        </div>
      ) : null}
      <SheetField label="Note for the team" htmlFor="adjust-note">
        <Textarea
          id="adjust-note"
          rows={3}
          maxLength={500}
          placeholder="Optional — what happened with this line"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </SheetField>
    </DesignSheet>
  )
}
