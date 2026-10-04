"use client"

import { useId } from "react"

import { Label, Textarea } from "@effy/design-system/ui"

import {
  clampNote,
  HANDOVER_CHOICES,
  remainingCharacters,
  type InstructionsDraft,
} from "@/lib/delivery-instructions"

/**
 * Delivery instructions (066): how the shopper wants the order handed over, and a short note for
 * the driver. Optional — an untouched control sends nothing, and nothing is then shown anywhere.
 *
 * A CONTROLLED section, like the billing one beside it: the draft lives in the parent so it survives
 * the move to the payment step and a failed payment (FR-006), and so the address book's form can
 * reuse this exact control for an address's saved default.
 *
 * ⚠ THE NOTE IS PLAIN TEXT, END TO END. It goes into a `<textarea>` and comes back out through
 * React text nodes; nothing here or downstream parses it. A shopper who types `<b>` gets `<b>`.
 *
 * ⚠ The two choices are buttons that can be switched OFF again (`aria-pressed`), not radios: "no
 * preference" is a real answer and a radio group, once touched, has no way back to it.
 */
export function DeliveryInstructions({
  value,
  onChange,
  disabled = false,
  heading = "Delivery instructions",
  hint = "Optional. Your driver sees this when they deliver.",
  children,
}: {
  value: InstructionsDraft
  onChange: (next: InstructionsDraft) => void
  disabled?: boolean
  heading?: string
  hint?: string
  /** Rendered under the note — checkout puts its "save to this address" choice here. */
  children?: React.ReactNode
}) {
  const noteId = useId()
  const hintId = useId()
  const countId = useId()
  const remaining = remainingCharacters(value.note)

  return (
    <section aria-label={heading}>
      <h3 className="text-sm font-medium">{heading}</h3>
      <p id={hintId} className="mt-1 text-sm text-muted-foreground">
        {hint}
      </p>

      <div role="group" aria-label="How should we hand it over?" className="mt-3 flex flex-wrap gap-2">
        {HANDOVER_CHOICES.map((choice) => {
          const pressed = value.handover === choice.value
          return (
            <button
              key={choice.value}
              type="button"
              aria-pressed={pressed}
              disabled={disabled}
              onClick={() => onChange({ ...value, handover: pressed ? null : choice.value })}
              className={
                "min-h-11 rounded-md border px-3 text-sm font-medium transition-colors " +
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                "disabled:cursor-not-allowed disabled:opacity-50 " +
                (pressed
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted")
              }
            >
              {choice.label}
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        <Label htmlFor={noteId} className="text-sm">
          Note for the driver
        </Label>
        <Textarea
          id={noteId}
          value={value.note}
          disabled={disabled}
          rows={3}
          placeholder="Gate code, which door, where to leave it"
          aria-describedby={`${hintId} ${countId}`}
          onChange={(e) => onChange({ ...value, note: clampNote(e.target.value) })}
          className="mt-1"
        />
        {/* `polite`, so a screen reader hears the count settle rather than every keystroke. */}
        <p id={countId} aria-live="polite" className="mt-1 text-xs text-muted-foreground">
          {remaining} characters left
        </p>
      </div>

      {children}
    </section>
  )
}
