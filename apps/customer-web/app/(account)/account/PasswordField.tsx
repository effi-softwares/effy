"use client"

import { useId, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { PASSWORD_MIN_LENGTH } from "@effy/shared-types"

/**
 * A password input. No `onPaste` handler (blocking paste breaks password managers and fails WCAG 2.2
 * SC 3.3.8), no "CONFIRM PASSWORD" field (the reveal toggle does that job better), and a proper
 * `autoComplete`. `PASSWORD_MIN_LENGTH` comes from @effy/shared-types; the backend enforces it and
 * also screens against breach corpora, so what is shown here is a courtesy.
 */
export function PasswordField({
  name,
  label,
  autoComplete,
  value,
  onChange,
  describedBy,
}: {
  name: string
  label: string
  autoComplete: "new-password" | "current-password"
  value: string
  onChange: (v: string) => void
  describedBy?: string
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const [revealed, setRevealed] = useState(false)

  const isNew = autoComplete === "new-password"
  const tooShort = isNew && value.length > 0 && value.length < PASSWORD_MIN_LENGTH

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={revealed ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={[isNew ? hintId : null, describedBy].filter(Boolean).join(" ") || undefined}
          aria-invalid={tooShort || undefined}
          data-testid={name}
          className="h-10 w-full rounded-md border border-input bg-background px-3 pr-12 text-base shadow-xs outline-none focus-visible:border-ring md:h-9 md:text-sm"
        />

        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          // A distinct accessible name per field, or two "Show password" toggles are indistinguishable.
          aria-label={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={revealed}
          // A 44px target.
          className="absolute inset-y-0 right-0 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          {revealed ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {isNew && (
        <p
          id={hintId}
          className={tooShort ? "text-sm text-destructive" : "text-sm text-foreground/80"}
        >
          At least {PASSWORD_MIN_LENGTH} characters. Use anything you like — no special characters
          required.
        </p>
      )}
    </div>
  )
}
