import type { Metadata } from "next"
import { Suspense } from "react"

import { requireCustomer } from "@/lib/dal"
import { PasswordCard } from "../PasswordCard"
import { SessionCard } from "../SessionCard"

export const metadata: Metadata = {
  title: "Security",
  robots: { index: false, follow: false },
}

/**
 * Security (034 US4) — how you sign in, and the controls that end your sessions.
 *
 * ⚠ COMPOSED FROM THE CREDENTIALS THE ACCOUNT ACTUALLY HOLDS (FR-025), never a fixed row list.
 * Effy's customer pool has three credential routes (email+password, email OTP, Google), so a screen
 * that always offers "Change password" is wrong for a large share of customers — the presentation
 * half of the defect feature 012 found in Cognito's own semantics. `PasswordCard` already branches on
 * the platform-owned `hasPassword`, never on how the customer signed in.
 *
 * ⚠ SIGN OUT LIVES HERE NOW (FR-028), off the account root where a stray tap could reach it while
 * browsing. `SessionCard` keeps its NON-destructive styling deliberately (FR-030): signing out is
 * trivially reversible, and destructive styling is now reserved for account deletion — the first
 * genuinely irreversible action this area has ever had.
 */
export default function SecurityPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Security</h1>
      <Suspense fallback={<p className="mt-8 text-sm text-muted-foreground">Loading…</p>}>
        <SecurityDetails />
      </Suspense>
    </div>
  )
}

async function SecurityDetails() {
  const customer = await requireCustomer("/account/security")
  return (
    <div className="mt-8 space-y-6">
      <PasswordCard
        hasPassword={customer.hasPassword}
        passwordUpdatedAt={customer.passwordUpdatedAt}
      />
      <SessionCard />
    </div>
  )
}
