import * as React from "react"
import { CalendarIcon, ClockIcon } from "lucide-react"

import { cn } from "../cn"
import { useIsMobile } from "../hooks/use-mobile"
import { Button } from "./button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHandle, DrawerTitle } from "./drawer"
import { Input } from "./input"
import { WheelPicker, WheelPickerWrapper, type WheelPickerOption } from "./wheel-picker"

/*
 * Time, date and small-count fields. With a mouse or on a tablet they are the plain `Input` they always
 * were (`type="time"`, `type="date"`, or digits). On a phone the field is a button that opens a bottom
 * sheet of wheels; nothing changes until "Done". The value is the same string either way: "HH:MM",
 * "YYYY-MM-DD", or the number as text.
 */

type FieldProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

const ariaOf = (p: FieldProps) => ({
  "aria-label": p["aria-label"],
  "aria-labelledby": p["aria-labelledby"],
  "aria-describedby": p["aria-describedby"],
  "aria-invalid": p["aria-invalid"],
})

/** The sheet's title: the field's own label, wherever it comes from. */
function titleOf(p: FieldProps, fallback: string) {
  if (p["aria-label"]) return p["aria-label"]
  if (typeof document === "undefined") return fallback
  const by = p["aria-labelledby"] ? document.getElementById(p["aria-labelledby"])?.textContent?.trim() : null
  const label = p.id ? document.querySelector(`label[for="${CSS.escape(p.id)}"]`)?.textContent?.trim() : null
  return by || label || fallback
}

/** The phone's field: looks like an input, opens the sheet. */
function WheelTrigger({
  id,
  shown,
  placeholder,
  icon: Icon,
  disabled,
  className,
  onOpen,
  ...aria
}: {
  id?: string
  shown: string | null
  placeholder: string
  icon: typeof ClockIcon
  disabled?: boolean
  className?: string
  onOpen: () => void
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}) {
  return (
    <button
      type="button"
      id={id}
      disabled={disabled}
      onClick={onOpen}
      aria-haspopup="dialog"
      className={cn(
        "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30",
        !shown && "text-placeholder",
        className
      )}
      {...aria}
    >
      <span className="truncate">{shown ?? placeholder}</span>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

/** The sheet: the field's label, the wheels side by side, and Done. */
function WheelSheet({
  open,
  onOpenChange,
  title,
  onDone,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onDone: () => void
  children: React.ReactNode
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="pb-[calc(12px+env(safe-area-inset-bottom))]">
        <DrawerHandle />
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <DrawerTitle className="text-base font-semibold">{title}</DrawerTitle>
          <Button size="sm" onClick={onDone}>
            Done
          </Button>
        </div>
        <DrawerDescription className="sr-only">Turn the wheels, then tap Done.</DrawerDescription>
        <div className="px-4 pb-2">
          <WheelPickerWrapper>{children}</WheelPickerWrapper>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

const pad = (n: number) => String(n).padStart(2, "0")
const range = (from: number, to: number, step = 1) => {
  const out: number[] = []
  for (let n = from; n <= to; n += step) out.push(n)
  return out
}
const options = (ns: number[], label: (n: number) => string = String): WheelPickerOption<string>[] =>
  ns.map((n) => ({ value: String(n), label: label(n) }))

/* ---------- Time ---------- */

const TIME_WORDS = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" })

function timeText(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!m) return null
  return TIME_WORDS.format(new Date(Date.UTC(2000, 0, 1, Number(m[1]), Number(m[2])))).replace(/ |\s/g, " ")
}

function TimeField({ minuteStep = 5, ...props }: FieldProps & { minuteStep?: number; min?: string; max?: string; step?: number }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState({ h12: "9", m: "0", pm: "am" })
  const { id, value, onChange, disabled, placeholder, className, min, max, step } = props

  if (!isMobile) {
    return (
      <Input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        min={min}
        max={max}
        step={step}
        {...ariaOf(props)}
      />
    )
  }

  const startEditing = () => {
    const m = /^(\d{1,2}):(\d{2})/.exec(value)
    const h = m ? Number(m[1]) : 9
    const min = m ? Number(m[2]) : 0
    setDraft({ h12: String(h % 12 === 0 ? 12 : h % 12), m: String(min), pm: h >= 12 ? "pm" : "am" })
    setOpen(true)
  }
  const minutes = range(0, 59, minuteStep)
  const currentMinute = Number(draft.m)
  if (!minutes.includes(currentMinute)) minutes.push(currentMinute), minutes.sort((a, b) => a - b)

  return (
    <>
      <WheelTrigger
        id={id}
        shown={timeText(value)}
        placeholder={placeholder ?? "Choose a time"}
        icon={ClockIcon}
        disabled={disabled}
        className={className}
        onOpen={startEditing}
        {...ariaOf(props)}
      />
      <WheelSheet
        open={open}
        onOpenChange={setOpen}
        title={titleOf(props, "Time")}
        onDone={() => {
          const h12 = Number(draft.h12) % 12
          onChange(`${pad(draft.pm === "pm" ? h12 + 12 : h12)}:${pad(Number(draft.m))}`)
          setOpen(false)
        }}
      >
        <WheelPicker options={options(range(1, 12))} value={draft.h12} onValueChange={(h12) => setDraft((d) => ({ ...d, h12 }))} infinite />
        <WheelPicker options={options(minutes, pad)} value={draft.m} onValueChange={(m) => setDraft((d) => ({ ...d, m }))} infinite />
        <WheelPicker
          options={[
            { value: "am", label: "am" },
            { value: "pm", label: "pm" },
          ]}
          value={draft.pm}
          onValueChange={(pm) => setDraft((d) => ({ ...d, pm }))}
        />
      </WheelSheet>
    </>
  )
}

/* ---------- Date ---------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DATE_WORDS = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

function dateText(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return DATE_WORDS.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))))
}

function DateField({
  fromYear,
  toYear,
  ...props
}: FieldProps & { fromYear?: number; toYear?: number; min?: string; max?: string }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState({ y: "2026", mo: "1", d: "1" })
  const { id, value, onChange, disabled, placeholder, className, min, max } = props

  if (!isMobile) {
    return (
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        min={min}
        max={max}
        {...ariaOf(props)}
      />
    )
  }

  const thisYear = new Date().getFullYear()
  const first = fromYear ?? (min ? Number(min.slice(0, 4)) : thisYear - 80)
  const last = toYear ?? (max ? Number(max.slice(0, 4)) : thisYear + 10)
  const startEditing = () => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    const now = new Date()
    setDraft(
      m
        ? { y: String(Number(m[1])), mo: String(Number(m[2])), d: String(Number(m[3])) }
        : { y: String(now.getFullYear()), mo: String(now.getMonth() + 1), d: String(now.getDate()) }
    )
    setOpen(true)
  }
  const dayCount = daysIn(Number(draft.y), Number(draft.mo))
  const day = Math.min(Number(draft.d), dayCount)

  return (
    <>
      <WheelTrigger
        id={id}
        shown={dateText(value)}
        placeholder={placeholder ?? "Choose a date"}
        icon={CalendarIcon}
        disabled={disabled}
        className={className}
        onOpen={startEditing}
        {...ariaOf(props)}
      />
      <WheelSheet
        open={open}
        onOpenChange={setOpen}
        title={titleOf(props, "Date")}
        onDone={() => {
          onChange(`${draft.y}-${pad(Number(draft.mo))}-${pad(day)}`)
          setOpen(false)
        }}
      >
        <WheelPicker options={options(range(1, dayCount))} value={String(day)} onValueChange={(d) => setDraft((x) => ({ ...x, d }))} infinite />
        <WheelPicker
          options={options(range(1, 12), (n) => MONTHS[n - 1]!)}
          value={draft.mo}
          onValueChange={(mo) => setDraft((x) => ({ ...x, mo }))}
          infinite
        />
        <WheelPicker options={options(range(first, last))} value={draft.y} onValueChange={(y) => setDraft((x) => ({ ...x, y }))} />
      </WheelSheet>
    </>
  )
}

/* ---------- A small count ---------- */

/** A whole number in a short, known range ("units picked, of 6"). Open-ended numbers keep the keyboard. */
function CountField({ min = 0, max, ...props }: FieldProps & { min?: number; max: number }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(String(min))
  const { id, value, onChange, disabled, placeholder, className } = props

  if (!isMobile) {
    return (
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        {...ariaOf(props)}
      />
    )
  }

  const n = Number.parseInt(value, 10)
  return (
    <>
      <WheelTrigger
        id={id}
        shown={Number.isFinite(n) ? String(n) : null}
        placeholder={placeholder ?? "Choose"}
        icon={ClockIcon}
        disabled={disabled}
        className={cn("justify-center [&>svg]:hidden", className)}
        onOpen={() => {
          setDraft(String(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min))
          setOpen(true)
        }}
        {...ariaOf(props)}
      />
      <WheelSheet
        open={open}
        onOpenChange={setOpen}
        title={titleOf(props, "Number")}
        onDone={() => {
          onChange(draft)
          setOpen(false)
        }}
      >
        <WheelPicker options={options(range(min, max))} value={draft} onValueChange={setDraft} />
      </WheelSheet>
    </>
  )
}

export { CountField, DateField, TimeField }
