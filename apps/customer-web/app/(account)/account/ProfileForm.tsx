"use client"

import { useState, useTransition } from "react"

import { updateProfile } from "./actions"

/**
 * Name editing (012 FR-007 … FR-012).
 *
 * ⚠ NO OPTIMISTIC UPDATE, DELIBERATELY.
 *
 * Optimistic UI is for high-frequency, low-consequence, near-always-succeeds actions. This is none of
 * those: it is a server-validated write against the record that also carries the barred-customer
 * refusal. A name that appears instantly and then silently reverts is worse than a button that says
 * "Saving…" for 300ms — and it is far worse as a BUG, because the customer walks away believing they
 * saved something they did not.
 *
 * ⚠ THE SAVE BUTTON IS INERT UNTIL SOMETHING ACTUALLY CHANGED (FR-011). A form that invites a write
 * which would change nothing is teaching the customer that our buttons do nothing.
 *
 * ⚠ FAILURE PRESERVES WHAT THEY TYPED (FR-010) — the single most infuriating form bug there is.
 */
export function ProfileForm({
  givenName,
  familyName,
}: {
  givenName: string | null
  familyName: string | null
}) {
  const [given, setGiven] = useState(givenName ?? "")
  const [family, setFamily] = useState(familyName ?? "")
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pending, start] = useTransition()

  // FR-011. Compared against what the SERVER last told us (the props), not a snapshot taken at
  // mount — the page revalidates after a save, so the props are the truth and "dirty" settles back
  // to false on its own.
  const dirty = given !== (givenName ?? "") || family !== (familyName ?? "")

  return (
    <section aria-labelledby="profile-heading" className="rounded-lg border p-6">
      <h2 id="profile-heading" className="text-lg font-medium">
        Your name
      </h2>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setStatus(null)
          start(async () => {
            const res = await updateProfile({ givenName: given, familyName: family })
            // ⚠ On failure we set a message and DO NOT touch `given`/`family`. The customer's typed
            // input survives, and they can simply press Save again.
            setStatus(res.ok ? { ok: true, msg: "Saved." } : { ok: false, msg: res.error })
          })
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="givenName" className="text-sm font-medium">
              First name
            </label>
            <input
              id="givenName"
              name="givenName"
              value={given}
              onChange={(e) => setGiven(e.target.value)}
              maxLength={60}
              autoComplete="given-name"
              data-testid="given-name"
              className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="familyName" className="text-sm font-medium">
              Last name
            </label>
            <input
              id="familyName"
              name="familyName"
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              maxLength={60}
              autoComplete="family-name"
              data-testid="family-name"
              className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* The EMAIL is deliberately not here. Changing it is an identity operation, not a profile
            edit — and a customer who can rewrite their own email can point it at someone else's.
            Cognito refuses the write too; this is defence in depth, not either/or. */}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={pending || !dirty}
            aria-busy={pending}
            data-testid="save-profile"
            className="h-11 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>

          {/* Confirmation AT THE POINT OF ACTION. The customer is looking straight at this button —
              a toast in the far corner is the wrong place to tell them what it just did. */}
          {status && (
            <p
              role="status"
              data-testid="profile-status"
              className={status.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}
            >
              {status.msg}
            </p>
          )}
        </div>
      </form>
    </section>
  )
}
