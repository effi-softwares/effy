"use client"

import { useEffect, useRef, useState } from "react"

import { MARKETING_CONSENT } from "@effy/legal-content/consent"

import { btnClass } from "@/components/storefront/actions"
import { capture } from "@/lib/telemetry"

/**
 * The one-time offers ask on the website (111 US2): an inline panel on the order confirmation, never a modal (so it
 * costs a guest route nothing). Both answers look the same and nothing is pre-chosen; either is recorded for offers
 * and news with where it was given and the wording shown, then the panel says what happened.
 */
export function OffersAsk() {
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null)
  const [saving, setSaving] = useState(false)
  const shown = useRef(false)

  useEffect(() => {
    if (shown.current) return
    shown.current = true
    capture({ name: "offers_ask_shown", props: { surface: "web" } })
  }, [])

  async function answer(yes: boolean) {
    setSaving(true)
    capture({ name: "offers_ask_answered", props: { answer: yes ? "yes" : "no", surface: "web" } })
    const res = await fetch("/api/notification-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consent: { offers: yes, news: yes }, via: "prompt", wordingVersion: MARKETING_CONSENT.version }),
    }).catch(() => null)
    setSaving(false)
    // Not recorded: nothing is assumed, and the ask comes back on a later confirmation.
    setAnswered(res?.ok ? (yes ? "yes" : "no") : null)
  }

  if (answered) {
    return (
      <section aria-live="polite" className="rounded-lg border p-6 text-sm">
        {answered === "yes"
          ? "Thanks - we'll let you know about offers and new products. You can change this in Notification settings."
          : "No problem - we won't send you offers. You can change this in Notification settings."}
      </section>
    )
  }

  return (
    <section aria-labelledby="offers-ask-heading" className="flex flex-col gap-3 rounded-lg border p-6">
      <h2 id="offers-ask-heading" className="font-semibold">
        {MARKETING_CONSENT.heading}
      </h2>
      <p className="text-sm text-muted-foreground">{MARKETING_CONSENT.body}</p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={saving} onClick={() => void answer(false)} className={btnClass("outline", "md", "w-full")}>
          {MARKETING_CONSENT.no}
        </button>
        <button type="button" disabled={saving} onClick={() => void answer(true)} className={btnClass("outline", "md", "w-full")}>
          {MARKETING_CONSENT.yes}
        </button>
      </div>
    </section>
  )
}
