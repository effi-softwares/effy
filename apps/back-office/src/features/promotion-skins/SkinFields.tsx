import { useState, type ReactNode } from "react"

import { TEXT_SIZES, WEIGHTS, type TextStyle } from "@effy/shared-types"
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
} from "@effy/design-system/ui"

const HEX = /^#[0-9a-fA-F]{6}$/

export function ColourField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (c: string) => void
  hint?: ReactNode
}) {
  const [text, setText] = useState(value)
  const shown = HEX.test(text) && text.toLowerCase() !== value.toLowerCase() ? value : text
  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-hex`}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : "#000000"}
          onChange={(e) => {
            setText(e.target.value)
            onChange(e.target.value)
          }}
          className="h-10 w-11 cursor-pointer rounded-lg border border-input bg-background p-1 shadow-xs"
        />
        <Input
          id={`${id}-hex`}
          value={shown}
          onChange={(e) => {
            setText(e.target.value)
            if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase())
          }}
          aria-invalid={!HEX.test(shown)}
          className="w-28 font-mono"
          maxLength={7}
        />
      </div>
      {!HEX.test(shown) ? (
        <p className="text-xs text-destructive">Six hexadecimal digits after #, like #1d4ed8.</p>
      ) : hint ? (
        <p className="mt-0.5 block text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2 self-center">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}

export function Choice<T extends string>({
  id,
  label,
  value,
  options,
  words,
  onChange,
}: {
  id: string
  label: string
  value: T
  options: readonly T[]
  words: Record<T, string>
  onChange: (v: T) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {words[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function Strength({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string
  label: string
  value: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label} <span className="tabular-nums text-muted-foreground">{Math.round(value * 100)}%</span>
      </Label>
      <Slider id={id} min={0} max={max} step={0.05} value={[value]} onValueChange={([v]) => onChange(v ?? 0)} />
    </div>
  )
}

const SIZE_LABEL: Record<(typeof TEXT_SIZES)[number], string> = {
  xs: "12",
  sm: "14",
  md: "16",
  lg: "20",
  xl: "24",
  "2xl": "32",
}
const WEIGHT_LABEL: Record<(typeof WEIGHTS)[number], string> = {
  regular: "Regular",
  medium: "Medium",
  semibold: "Semibold",
  bold: "Bold",
}

export function TextStyleFields({
  id,
  title,
  style,
  maxLines,
  onChange,
}: {
  id: string
  title: string
  style: TextStyle
  maxLines: 1 | 3
  onChange: (s: TextStyle) => void
}) {
  const lines = ([1, 2, 3] as const).filter((n) => n <= maxLines)
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <ColourField
        id={`${id}-colour`}
        label={`${title} colour`}
        value={style.colour}
        onChange={(c) => onChange({ ...style, colour: c })}
      />
      <Choice
        id={`${id}-size`}
        label="Size (px)"
        value={style.size}
        options={TEXT_SIZES}
        words={SIZE_LABEL}
        onChange={(v) => onChange({ ...style, size: v })}
      />
      <Choice
        id={`${id}-weight`}
        label="Weight"
        value={style.weight}
        options={WEIGHTS}
        words={WEIGHT_LABEL}
        onChange={(v) => onChange({ ...style, weight: v })}
      />
      <Choice
        id={`${id}-lines`}
        label="Lines at most"
        value={String(style.lines) as "1" | "2" | "3"}
        options={lines.map(String) as ("1" | "2" | "3")[]}
        words={{ "1": "1", "2": "2", "3": "3" }}
        onChange={(v) => onChange({ ...style, lines: Number(v) as 1 | 2 | 3 })}
      />
    </div>
  )
}
