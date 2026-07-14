"use client"

import { useState, useTransition } from "react"

import { updateProfile } from "./actions"

export function ProfileForm({ displayName }: { displayName: string | null }) {
  const [name, setName] = useState(displayName ?? "")
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        setStatus(null)
        start(async () => {
          const res = await updateProfile({ displayName: name })
          setStatus(
            res.ok
              ? { ok: true, msg: "Saved." }
              : { ok: false, msg: res.error },
          )
        })
      }}
    >
      <div className="space-y-2">
        <label htmlFor="displayName" className="text-sm font-medium">
          Display name
        </label>
        <input
          id="displayName"
          name="displayName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          data-testid="display-name"
          className="h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          What we call you around the store. Optional.
        </p>
      </div>

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
