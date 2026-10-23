"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"

import { resetCart } from "@/lib/cart-store"
import { resetSaved } from "@/lib/saved-store"

/**
 * The guest's way to delete their data, on the public page (everything else in the account area needs a
 * session). A guest has no platform record: their saved list and cart live in `localStorage`, so the copy
 * says nothing is erased on a server.
 */
export function GuestDataControl() {
  const [cleared, setCleared] = useState(false)

  return (
    <div className="border-t pt-8">
      <h2 className="text-xl font-semibold">Don&rsquo;t have an account?</h2>
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
