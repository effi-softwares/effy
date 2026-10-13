"use client"

import { useId } from "react"

import { Label, Textarea } from "@/components/ui/form"

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
  step,
  children,
}: {
  value: InstructionsDraft
  onChange: (next: InstructionsDraft) => void
  disabled?: boolean
  heading?: string
  hint?: string
  /** Its place in a numbered flow (checkout's third step). Absent anywhere it is not one of a sequence. */
  step?: number
  /** Rendered under the note — checkout puts its "save to this address" choice here. */
  children?: React.ReactNode
}) {
  const noteId = useId()
  const hintId = useId()
  const countId = useId()
  const remaining = remainingCharacters(value.note)

  return (
    <section aria-label={heading}>
      <h2 className={step ? "text-lg font-semibold" : "text-sm leading-none font-medium"}>
        {step ? <span aria-hidden="true">{step}. </span> : null}
        {heading}
      </h2>
      <p id={hintId} className="mt-1 text-sm text-muted-foreground">
        {hint}
      </p>

      <div role="group" aria-label="How should we hand it over?" className="mt-4 inline-flex max-w-full overflow-hidden rounded-md border border-input shadow-xs">
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
                "min-h-11 min-w-0 border-l border-input px-4 text-sm font-medium transition-colors first:border-l-0 " +
                "disabled:cursor-not-allowed disabled:opacity-50 " +
                (pressed ? "bg-accent text-foreground" : "bg-background hover:bg-accent")
              }
            >
              {choice.label}
            </button>
          )
        })}
      </div>

      <div className="mt-4">
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
          className="mt-2"
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
