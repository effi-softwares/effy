"use client"

import { useState, useTransition } from "react"

import { updateProfile } from "./actions"

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

  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        setStatus(null)
        start(async () => {
          const res = await updateProfile({
            givenName: given,
            familyName: family,
          })
          setStatus(
            res.ok
              ? { ok: true, msg: "Saved." }
              : { ok: false, msg: res.error },
          )
        })
      }}
    >
      <div className="grid grid-cols-2 gap-3">
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
            data-testid="family-name"
            className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      {/* The EMAIL is deliberately not here. Changing it is an identity operation, not a profile
          edit — and Cognito will not move the sign-in identity until the NEW address is verified. */}

      {status && (
        <p
          role="status"
          data-testid="profile-status"
          className={
            status.ok
              ? "text-sm text-muted-foreground"
              : "text-sm text-destructive"
          }
        >
          {status.msg}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        data-testid="save-profile"
        className="h-11 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  )
}
