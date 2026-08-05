"use client"

import { useState } from "react"

import { Button } from "@effy/design-system/ui"

import { resetCart } from "@/lib/cart-store"
import { resetSaved } from "@/lib/saved-store"

/**
 * The GUEST's route to deleting their own data (034 FR-046).
 *
 * ⚠ THIS LIVES ON THE PUBLIC PAGE ON PURPOSE. Everything else in the account area sits behind a
 * session, so a control built anywhere else would be unreachable by exactly the people who need it —
 * which is how this requirement nearly shipped as decorative. Apple's FAQ names guest accounts
 * explicitly: *"Users should have the option to delete automatically generated accounts (sometimes
 * called 'guest' accounts) and the data associated with those accounts."*
 *
 * ⚠ THERE IS NOTHING SERVER-SIDE TO ERASE, and the copy says so rather than implying otherwise. An
 * Effy guest has no platform record: the saved list and cart mirror live in `localStorage` and only
 * become platform data on sign-in. Claiming a server-side deletion here would be the inverse of the
 * problem the deletion disclosure exists to avoid — describing work that does not happen.
 */
export function GuestDataControl() {
  const [cleared, setCleared] = useState(false)

  return (
    <div className="mt-8 border-t pt-6">
      <h2 className="text-lg font-medium">Don&rsquo;t have an account?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        If you&rsquo;ve been browsing without signing in, we don&rsquo;t hold an account for you —
        your saved items and basket are stored only in this browser. You can clear them here.
      </p>

      <Button
        type="button"
        variant="outline"
        className="mt-4"
        data-testid="guest-clear-data"
        onClick={() => {
          resetSaved()
          resetCart()
          setCleared(true)
        }}
      >
        Clear data in this browser
      </Button>

      {cleared && (
        <p role="status" data-testid="guest-cleared" className="mt-3 text-sm text-muted-foreground">
          Cleared. Your saved items and basket in this browser are gone.
        </p>
      )}
    </div>
  )
}
