"use client"

import { useId, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { PASSWORD_MIN_LENGTH } from "@effy/shared-types"

/**
 * A password input (012 FR-023).
 *
 * Everything about this component is a decision, and most of them are decisions NOT to do the
 * traditional thing:
 *
 * ⚠ NO `onPaste` HANDLER, AND THERE NEVER WILL BE. Blocking paste breaks password managers, which
 *   makes people pick weaker passwords they can type — the exact opposite of the intent. It also
 *   FAILS WCAG 2.2 SC 3.3.8 (Accessible Authentication) outright.
 *
 * ⚠ NO "CONFIRM PASSWORD" FIELD. GOV.UK removed theirs once they shipped a reveal toggle, and their
 *   research was blunt: "a second field is not helpful for users". A reveal toggle solves the typo
 *   problem the confirm field was invented for, and it solves it better — you can SEE the password
 *   rather than typing it twice and hoping you made the same mistake both times.
 *
 * ⚠ `autoComplete` IS SET PROPERLY (`new-password` / `current-password`) so password managers fill
 *   and save correctly. Getting this wrong is why managers offer to save the OLD password.
 *
 * ⚠ THE LENGTH RULE IS IMPORTED, not retyped. `PASSWORD_MIN_LENGTH` has ONE definition
 *   (@effy/shared-types), shared with the backend that ENFORCES it. A hardcoded "12" here would
 *   drift from the real rule the first time it changed, and the customer would be told something
 *   false.
 *
 * ⚠ And what is shown here is a COURTESY, not a control. The backend re-checks the length and
 *   additionally screens the password against known breach corpora — which the browser never does,
 *   precisely so a crafted request cannot skip it.
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
          className="h-11 w-full rounded-md border bg-background px-3 pr-12 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          // The toggle's accessible name must be DISTINCT per field — two fields on one page whose
          // toggles are both called "Show password" are indistinguishable to a screen-reader user.
          aria-label={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={revealed}
          // 44px target — the platform's fat-finger rule, stricter than WCAG 2.2's 24px minimum.
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
          className={tooShort ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          At least {PASSWORD_MIN_LENGTH} characters. Use anything you like — no special characters
          required.
        </p>
      )}
    </div>
  )
}
