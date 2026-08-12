"use client"

import { useState } from "react"
import { ChevronRight } from "lucide-react"

import { FieldEditor } from "./FieldEditor"
import { updateProfile } from "./actions"

/**
 * Personal info as DETAIL ROWS (034 US1) — label, current value, chevron. No inputs on the screen.
 *
 * This replaces 012's inline two-field form. The old form put the values behind a load and offered a
 * Save for both names at once; a row shows the current value at rest and edits exactly one thing.
 *
 * ⚠ EMAIL IS SHOWN AND IS NOT EDITABLE (FR-022), and activating it EXPLAINS why rather than doing
 * nothing. A row that silently ignores a tap is indistinguishable from a broken one — the customer
 * taps twice, then reports a bug. Changing an email is an identity operation: someone who can rewrite
 * their own email can point it at a victim's address.
 *
 * ⚠ PHONE CARRIES NO VERIFIED INDICATOR (FR-060a). It is self-asserted and this feature never
 * verifies it, so a tick would be a claim the platform cannot support — and one the customer would
 * reasonably rely on.
 */
type Field = "given" | "family" | "phone" | null

export function PersonalInfo({
  givenName,
  familyName,
  phone,
  email,
}: {
  givenName: string | null
  familyName: string | null
  phone: string | null
  email: string
}) {
  const [editing, setEditing] = useState<Field>(null)
  const [emailNote, setEmailNote] = useState(false)

  async function save(patch: {
    givenName?: string | null
    familyName?: string | null
    phone?: string | null
  }): Promise<string | null> {
    const res = await updateProfile({
      givenName: patch.givenName !== undefined ? patch.givenName : givenName,
      familyName: patch.familyName !== undefined ? patch.familyName : familyName,
      // ⚠ `""` (not null) is what clears a phone — see actions.ts and the backend's normaliser.
      phone: patch.phone !== undefined ? patch.phone : (phone ?? ""),
    })
    return res.ok ? null : res.error
  }

  return (
    <section aria-labelledby="personal-info-heading">
      <h2 id="personal-info-heading" className="mb-4 text-xl font-semibold">
        Personal info
      </h2>

      <ul className="divide-y">
        <Row
          label="First name"
          value={givenName}
          onActivate={() => setEditing("given")}
          testId="row-given-name"
        />
        <Row
          label="Last name"
          value={familyName}
          onActivate={() => setEditing("family")}
          testId="row-family-name"
        />
        <Row
          label="Phone number"
          value={phone}
          onActivate={() => setEditing("phone")}
          testId="row-phone"
        />
        <Row
          label="Email"
          value={email}
          editable={false}
          onActivate={() => setEmailNote(true)}
          testId="row-email"
        />
      </ul>

      {emailNote && (
        <p role="status" data-testid="email-locked-note" className="mt-3 text-sm text-muted-foreground">
          Your email address is how you sign in, so it can&rsquo;t be changed here. Contact support if
          you need to move your account to a different address.
        </p>
      )}

      <FieldEditor
        open={editing === "given"}
        onOpenChange={(o) => setEditing(o ? "given" : null)}
        title="First name"
        label="First name"
        initialValue={givenName ?? ""}
        maxLength={60}
        autoComplete="given-name"
        onSave={(v) => save({ givenName: v })}
      />
      <FieldEditor
        open={editing === "family"}
        onOpenChange={(o) => setEditing(o ? "family" : null)}
        title="Last name"
        label="Last name"
        initialValue={familyName ?? ""}
        maxLength={60}
        autoComplete="family-name"
        onSave={(v) => save({ familyName: v })}
      />
      <FieldEditor
        open={editing === "phone"}
        onOpenChange={(o) => setEditing(o ? "phone" : null)}
        title="Phone number"
        description="We may use this to contact you about an order."
        label="Phone number"
        initialValue={phone ?? ""}
        maxLength={32}
        inputMode="tel"
        autoComplete="tel"
        onSave={(v) => save({ phone: v })}
      />
    </section>
  )
}

function Row({
  label,
  value,
  onActivate,
  editable = true,
  testId,
}: {
  label: string
  value: string | null
  onActivate: () => void
  editable?: boolean
  testId: string
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onActivate}
        data-testid={testId}
        // ⚠ 48px minimum activation area (FR-055), measured on the TARGET rather than the glyph.
        // Feature 033 shipped a 32dp control directly beneath a comment claiming it met the minimum,
        // which is why this feature states the number instead of gesturing at "the platform minimum".
        className="flex min-h-[48px] w-full items-center justify-between gap-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {value || <span className="italic">Not set</span>}
          </span>
        </span>
        {editable ? (
          <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">Can&rsquo;t be changed</span>
        )}
      </button>
    </li>
  )
}
