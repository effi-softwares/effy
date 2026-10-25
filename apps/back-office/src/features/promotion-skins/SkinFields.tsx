import { useState, type ReactNode } from "react"

import { TEXT_SIZES, WEIGHTS, type TextStyle } from "@effy/shared-types"
import { Input, Label, Switch } from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

const SELECT = "h-9 rounded-md border border-input bg-background px-2 text-sm"

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
    <div className="space-y-1.5">
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
          className="h-9 w-10 cursor-pointer rounded-md border border-input bg-background p-1"
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
        <p className="ef-sub">{hint}</p>
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
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={cn(SELECT, "w-full")} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {words[o]}
          </option>
        ))}
      </select>
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
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} <span className="tabular-nums text-muted-foreground">{Math.round(value * 100)}%</span>
      </Label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
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
