"use client"

import { useState } from "react"

import { ChangePasswordDialog } from "./ChangePasswordDialog"
import { SetPasswordDialog } from "./SetPasswordDialog"

/**
 * The password card. It branches on `hasPassword` only, never on how the customer signed in (a Google
 * customer is a linked native user and can hold a password). Having no password is presented as a
 * complete state, not a deficiency: signing in with an emailed code is the safer route.
 */
export function PasswordCard({
  hasPassword,
  passwordUpdatedAt,
}: {
  hasPassword: boolean
  passwordUpdatedAt: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <section
      aria-labelledby="password-heading"
      data-testid="password-card"
      data-has-password={hasPassword}
    >
      {hasPassword ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="password-heading" className="text-lg font-medium">
              Password
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span aria-hidden="true">••••••••••••</span>
              <span className="sr-only">A password is set on this account.</span>
              {passwordUpdatedAt && (
                <span className="ml-3">
                  Last changed{" "}
                  {new Date(passwordUpdatedAt).toLocaleDateString("en-AU", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="change-password"
            className="h-11 shrink-0 rounded-md border px-6 text-sm font-medium hover:bg-accent"
          >
            Change password
          </button>
          <ChangePasswordDialog open={open} onOpenChange={setOpen} />
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-prose">
            <h2 id="password-heading" className="text-lg font-medium">
              Password
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You sign in with a code we email you — there&rsquo;s no password on this account. You
              can add one if you&rsquo;d prefer to sign in that way.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="set-password"
            className="h-11 shrink-0 rounded-md border px-6 text-sm font-medium hover:bg-accent"
          >
            Set a password
          </button>
          <SetPasswordDialog open={open} onOpenChange={setOpen} />
        </div>
      )}
    </section>
  )
}
