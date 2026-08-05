"use client"

import * as React from "react"

import { updateProfile } from "@/app/(account)/account/actions"
import { capture } from "@/lib/telemetry"

import { ensureCustomerRecord } from "../_lib/seed-actions"
import { ErrorNote, Field, StepShell, Submit } from "./AuthKit"

/**
 * The LAST step of registration, on every route (036 FR-032 … FR-035a).
 *
 * ⚠ THE ACCOUNT ALREADY EXISTS BY THE TIME THIS RENDERS, and that is the whole design. Before 036 the
 * first thing a stranger was asked for was their first and last name — above the email field, before
 * they had any reason to trust the form. Now they give one thing, get in, and are asked who they are
 * once they are already a customer. The step completes a profile; it does not gate access (FR-034).
 *
 * ⚠ IT IS REQUIRED, BUT ABANDONING IT MUST NEVER LOCK ANYONE OUT (FR-035a). Someone who closes the tab
 * here has a working, signed-in account. On their next arrival they are asked again — and are shown
 * nothing suggesting the account is broken or half-made, because it is neither.
 *
 * ⚠ READ BEFORE WRITE. `PATCH /customer/v1/me` answers a missing record with `403 "this account
 * cannot be used"` — the same wording a BARRED customer sees. The record is created only by
 * `GET /customer/v1/me`, and web has two silent paths that can skip it (`seedCredentialRoute`'s
 * catch, and the Google callback, which never seeded at all). So this step ensures the record itself
 * rather than trusting that something upstream did.
 *
 * ⚠ NO NEW ENDPOINT. It writes through the SAME `updateProfile` server action the account page uses,
 * which also forces the token refresh that carries the new `given_name` claim to the header. That
 * refresh only became meaningful in this slice — see `customer-me-v1-patch.ts`, where `updateName()`
 * finally got a caller.
 */
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
  // Preserved rather than cleared: `updateProfile` writes all three fields, and passing `null` for a
  // phone the customer already has would silently wipe it on a return visit to this step.
  const [phone, setPhone] = React.useState<string | null>(null)

  React.useEffect(() => {
    capture({ name: "auth_name_step_shown", props: { route } })
    let cancelled = false
    void ensureCustomerRecord().then((customer) => {
      if (cancelled || !customer) return
      setPhone(customer.phone ?? null)
      // A returning shopper who already gave a name (they came back to this step) sees it, rather
      // than an empty form implying nothing was saved.
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
    setError(null)
    setPending(true)
    try {
      // ⚠ Ensure the record one more time, immediately before writing. The effect above may not have
      // completed, and this is the call that turns a 403-with-barred-wording into an ordinary save.
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

  const complete = given.trim().length > 0 && family.trim().length > 0

  return (
    <StepShell
      title="What should we call you?"
      subtitle="We'll use this when we say hello and when we hand over your order."
      bottom={
        <Submit
          pending={pending}
          label="Finish"
          testId="submit-name"
          disabled={!complete}
          form="name-step-form"
        />
      }
    >
      <form id="name-step-form" className="space-y-4" onSubmit={submit}>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="First name"
            id="given-name"
            value={given}
            onChange={setGiven}
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
            autoComplete="family-name"
            maxLength={60}
            required
          />
        </div>
      </form>
    </StepShell>
  )
}
