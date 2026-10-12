"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"

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
type Editing = "name" | "phone" | null

/**
 * Personal info (reference: Account · Personal info): what Effy calls the customer and how to reach
 * them, each on a row with its own way to change it.
 *
 * ⚠ THE NAME IS ONE THING TO THE CUSTOMER, so it is one row and one dialog — first and last name
 * are saved together.
 *
 * ⚠ THE PHONE CARRIES NO "VERIFIED" MARK (034 FR-060a). It is what the customer typed; the platform
 * has never checked it, and a tick would be a claim it cannot support.
 *
 * ⚠ THE EMAIL SAYS WHY IT HAS NO BUTTON (FR-022). It is how the customer signs in; a row that simply
 * could not be changed would read as broken.
 */
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
  const [editing, setEditing] = useState<Editing>(null)

  async function save(patch: { givenName?: string | null; familyName?: string | null; phone?: string | null }): Promise<string | null> {
    const res = await updateProfile({
      givenName: patch.givenName !== undefined ? patch.givenName : givenName,
      familyName: patch.familyName !== undefined ? patch.familyName : familyName,
      // ⚠ "" clears the phone; `null` would mean "leave it" to the action.
      phone: patch.phone !== undefined ? patch.phone : (phone ?? ""),
    })
    return res.ok ? null : res.error
  }

  const name = [givenName, familyName].filter(Boolean).join(" ")

  return (
    <section aria-label="Personal info" className="rounded-lg border bg-card shadow-xs">
      <ul className="divide-y">
        <Row label="Name" value={name || null} testId="row-name">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing("name")} data-testid="edit-name">
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        </Row>
        <Row
          label="Mobile number"
          value={phone}
          note="Your driver may call this number about a delivery."
          testId="row-phone"
        >
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing("phone")} data-testid="edit-phone">
            <Pencil aria-hidden="true" />
            {phone ? "Change" : "Add"}
          </Button>
        </Row>
        <Row
          label="Email"
          value={email}
          note={<span data-testid="email-locked-note">This is how you sign in. To change it, contact us.</span>}
          testId="row-email"
        />
      </ul>

      <FieldEditor
        open={editing === "name"}
        onOpenChange={(o) => setEditing(o ? "name" : null)}
        title="Edit name"
        description="We use your name on deliveries and receipts."
        fields={[
          { name: "given", label: "First name", initialValue: givenName ?? "", maxLength: 60, autoComplete: "given-name" },
          { name: "family", label: "Last name", initialValue: familyName ?? "", maxLength: 60, autoComplete: "family-name" },
        ]}
        onSave={(v) => save({ givenName: v.given ?? "", familyName: v.family ?? "" })}
      />
      <FieldEditor
        open={editing === "phone"}
        onOpenChange={(o) => setEditing(o ? "phone" : null)}
        title={phone ? "Change mobile number" : "Add a mobile number"}
        description="We may use this to contact you about an order."
        fields={[{ name: "phone", label: "Mobile number", initialValue: phone ?? "", maxLength: 32, inputMode: "tel", autoComplete: "tel" }]}
        onSave={(v) => save({ phone: v.phone ?? "" })}
      />
    </section>
  )
}

function Row({
  label,
  value,
  note,
  testId,
  children,
}: {
  label: string
  value: string | null
  note?: React.ReactNode
  testId: string
  /** The row's own action. A row without one says why in its note. */
  children?: React.ReactNode
}) {
  return (
    <li data-testid={testId} className="flex items-center justify-between gap-4 px-6 py-4">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="truncate font-medium">{value || <span className="font-normal text-muted-foreground italic">Not set</span>}</p>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
      {children}
    </li>
  )
}
