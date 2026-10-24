import { useId, type ReactNode } from "react"

import { RadioGroup, RadioGroupItem } from "@effy/design-system/ui"

import { cn } from "@/lib/utils"

/**
 * One choice from a few, as full-width cards (Foundations — "a choice is a full-width card, not a bare
 * radio"): the whole card is the target, the chosen one is ringed in blue. A heading names the group
 * and is its accessible label.
 */
export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: ReactNode
  value: T
  options: readonly { value: T; label: ReactNode; description?: ReactNode }[]
  onChange: (value: T) => void
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn("grid gap-2", className)}>
      <div id={id} className="text-[15px] font-medium">
        {label}
      </div>
      <RadioGroup aria-labelledby={id} value={value} onValueChange={(v) => onChange(v as T)} className="grid gap-2">
        {options.map((o) => (
          <label key={o.value} className={cn("bo-choice-card", o.value === value && "is-checked")}>
            <RadioGroupItem value={o.value} />
            <span className="grid gap-0.5">
              <span className="font-medium">{o.label}</span>
              {o.description ? <span className="text-sm text-muted-foreground">{o.description}</span> : null}
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}
