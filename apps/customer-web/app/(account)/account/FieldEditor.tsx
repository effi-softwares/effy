"use client"

import { useEffect, useRef, useState, useTransition } from "react"

import {
  Button,
  Input,
  Label,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@effy/design-system/ui"

/**
 * ONE FIELD, ONE EDITOR (034 US1).
 *
 * The screen behind shows label/value/chevron rows and holds no inputs at all; activating a row opens
 * this. Built on the EXISTING `ResponsiveModal` from the design system — a centred Dialog at/above
 * the mobile breakpoint and a bottom Drawer below it — so the web surface reuses the container
 * feature 022 already introduced rather than growing a second overlay (Principle II).
 *
 * ⚠ WHY A DISPLAY ROW RATHER THAN AN INLINE INPUT, since that is the actual argument:
 * a row with a live input in it cannot also show a verified state, a "managed by Google" state, or a
 * pending-change state without becoming cramped. A value-and-chevron row is a DISPLAY surface, so it
 * can carry status; an input row is an ENTRY surface and cannot.
 *
 * ── The dirty-check is mandatory, not a nicety (FR-018 / FR-019) ──────────────────────────────
 *
 * A changed value must never be discarded silently. On the web there are FOUR ways out — the close
 * control, Escape, a backdrop click, and browser back — and a single `onOpenChange` guard cannot tell
 * a deliberate Save-driven close from an accidental one. So every dismissal route funnels through
 * `attemptClose`, which compares against the value the editor OPENED with.
 *
 * ⚠ And the confirmation is an `confirm()`-style alert, NOT a second overlay: stacking a sheet on a
 * sheet is exactly what FR-023 forbids, and FR-023a records this exemption explicitly.
 */
export function FieldEditor({
  open,
  onOpenChange,
  title,
  description,
  label,
  initialValue,
  maxLength,
  inputMode,
  autoComplete,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  label: string
  initialValue: string
  maxLength: number
  inputMode?: "text" | "tel"
  autoComplete?: string
  /** Returns an error message, or null on success. */
  onSave: (value: string) => Promise<string | null>
}) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  // Re-seed whenever the editor opens, so it always reflects what the server last told us rather
  // than whatever was typed and abandoned last time.
  useEffect(() => {
    if (open) {
      setValue(initialValue)
      setError(null)
      // FR-013 — focused without further interaction. The timeout lets the overlay finish mounting;
      // focusing during the same tick lands on a node that is about to be replaced.
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open, initialValue])

  const dirty = value !== initialValue

  /** Every dismissal route funnels through here (FR-018). */
  function attemptClose() {
    if (
      dirty &&
      !window.confirm("Discard your changes?\n\nWhat you typed here will not be saved.")
    ) {
      return
    }
    onOpenChange(false)
  }

  function submit() {
    setError(null)
    start(async () => {
      const err = await onSave(value)
      if (err) {
        // ⚠ The editor STAYS OPEN and the typed value survives (FR-020 / FR-021). Losing what
        // someone just typed because the network hiccuped is the most infuriating form bug there is.
        setError(err)
        return
      }
      onOpenChange(false)
    })
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        // Radix reports both opening and closing here. Only closing needs the guard, and it must run
        // for Escape and backdrop clicks as well as the close control.
        if (!next) attemptClose()
        else onOpenChange(true)
      }}
    >
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>{title}</ResponsiveModalTitle>
          {description ? (
            <ResponsiveModalDescription>{description}</ResponsiveModalDescription>
          ) : null}
        </ResponsiveModalHeader>

        <form
          className="space-y-2 px-4 sm:px-0"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {/* Label ABOVE the field, never a placeholder standing in for one — a placeholder vanishes
              the moment someone types, in the one container with no surrounding context to recover
              the meaning from. */}
          <Label htmlFor="field-editor-input">{label}</Label>
          <Input
            id="field-editor-input"
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={maxLength}
            inputMode={inputMode}
            autoComplete={autoComplete}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "field-editor-error" : undefined}
            data-testid="field-editor-input"
          />
          {error ? (
            <p
              id="field-editor-error"
              role="alert"
              data-testid="field-editor-error"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </form>

        {/* ⚠ Save first, Cancel BELOW it and DE-WEIGHTED (FR-014 / FR-015).
            Not decoration: Cancel sits directly under the thumb's resting position on a phone, so
            two equally-weighted filled buttons turn a mis-tap into silent data loss. Save is the
            action ~95% of opens end in; Cancel is a text action. */}
        <ResponsiveModalFooter className="flex flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            onClick={submit}
            disabled={pending}
            aria-busy={pending}
            data-testid="field-editor-save"
            className="w-full"
          >
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={attemptClose}
            disabled={pending}
            data-testid="field-editor-cancel"
            className="w-full"
          >
            Cancel
          </Button>
        </ResponsiveModalFooter>
      </ResponsiveModalContent>
    </ResponsiveModal>
  )
}
