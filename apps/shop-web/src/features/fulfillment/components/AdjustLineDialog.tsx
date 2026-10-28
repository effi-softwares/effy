import { useEffect, useState } from "react"
import { Minus, Plus } from "lucide-react"

import { Button, CountField, Label, Textarea } from "@effy/design-system/ui"

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
        <p className="text-sm font-medium">
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
          <Label htmlFor="adjust-units">Units picked</Label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="One fewer"
                onClick={() => step(-1)}
                disabled={n <= 0}
              >
                <Minus aria-hidden="true" />
              </Button>
              <CountField
                id="adjust-units"
                min={0}
                max={ordered}
                value={units}
                aria-invalid={showErr}
                onChange={(v) => {
                  setUnits(v)
                  setTouched(true)
                }}
                className="h-11 w-16 text-center text-lg font-semibold tabular-nums md:text-lg"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label="One more"
                onClick={() => step(1)}
                disabled={n >= ordered}
              >
                <Plus aria-hidden="true" />
              </Button>
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
