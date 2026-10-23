"use client"

import * as React from "react"

import { updateProfile } from "@/app/(account)/account/actions"
import { capture } from "@/lib/telemetry"

import { ensureCustomerRecord } from "../_lib/seed-actions"
import { useFieldValidation, type FieldConfig } from "../_lib/validation"
import { ErrorNote, Field, StepShell, Submit, TextAction } from "./AuthKit"

/**
 * The last step of registration: the account already exists, so this completes a profile and never
 * gates access (abandoning it locks nobody out; they are asked again next time). It ensures the
 * customer record first (`GET /customer/v1/me`; a PATCH without one answers like a barred account),
 * then writes through the account page's `updateProfile`, which refreshes the token for the header.
 * Its messages never imply the account is broken.
 */
const FIELDS = {
  given: {
    id: "given-name",
    rules: [{ kind: "required", message: "Enter your first name." }],
  },
  family: {
    id: "family-name",
    rules: [{ kind: "required", message: "Enter your last name." }],
  },
} satisfies Record<string, FieldConfig>

export function NameStep({
  onDone,
  route,
}: {
  onDone: () => void
  route: "otp" | "password" | "google"
}) {
  const [given, setGiven] = React.useState("")
  const [family, setFamily] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const validation = useFieldValidation(FIELDS)
  // Preserved, not cleared: `updateProfile` writes all three fields, and a `null` phone would wipe a saved one.
  const [phone, setPhone] = React.useState<string | null>(null)

  React.useEffect(() => {
    capture({ name: "auth_name_step_shown", props: { route } })
    let cancelled = false
    void ensureCustomerRecord().then((customer) => {
      if (cancelled || !customer) return
      setPhone(customer.phone ?? null)
      // A returning shopper sees the name they already gave.
      setGiven((v) => v || customer.givenName || "")
      setFamily((v) => v || customer.familyName || "")
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    // A whitespace-only name is empty (the browser's `required` accepts a space).
    if (!validation.check([["given", given], ["family", family]])) return
    setError(null)
    setPending(true)
    try {
      // Ensure the record once more right before writing (the effect may not have finished).
      await ensureCustomerRecord()
      const result = await updateProfile({
        givenName: given.trim(),
        familyName: family.trim(),
        phone,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      capture({ name: "auth_name_step_completed", props: { route } })
      onDone()
    } catch {
      setError("We couldn't save that. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <StepShell
      title="What should we call you?"
      subtitle="We use your name on deliveries and receipts."
    >
      <form id="name-step-form" className="space-y-4" noValidate onSubmit={submit}>
        {error && <ErrorNote>{error}</ErrorNote>}
        {/* Stacked on a phone; two columns from 360px. */}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <Field
            label="First name"
            id="given-name"
            value={given}
            onChange={setGiven}
            onBlur={() => validation.blur("given", given)}
            error={validation.show("given", given)}
            autoComplete="given-name"
            maxLength={60}
            autoFocus
            required
          />
          <Field
            label="Last name"
            id="family-name"
            value={family}
            onChange={setFamily}
            onBlur={() => validation.blur("family", family)}
            error={validation.show("family", family)}
            autoComplete="family-name"
            maxLength={60}
            required
          />
        </div>
        <Submit pending={pending} label="Create account" testId="submit-name" />
        {/*
          A way past, since this step must never gate access: a subordinate text action calling the same
          `onDone`, so the cart and saved merges still run; it skips only the profile write.
        */}
        <TextAction
          tone="subtle"
          testId="skip-name"
          onClick={() => {
            capture({ name: "auth_name_step_skipped", props: { route } })
            onDone()
          }}
        >
          I&apos;ll do this later
        </TextAction>
      </form>
    </StepShell>
  )
}
