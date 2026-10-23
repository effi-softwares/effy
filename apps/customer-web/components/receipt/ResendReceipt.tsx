"use client"

import { useState } from "react"
import { Mail } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * "Send the receipt again", the receipt's one client component. It sends no address (the endpoint takes
 * the recipient from the session), and says every outcome, refusals included.
 */
type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string }

export function ResendReceipt({ orderId }: { orderId: string }) {
  const [state, setState] = useState<State>({ kind: "idle" })

  async function send() {
    setState({ kind: "sending" })
    try {
      // Dynamic import, like every other telemetry call site on this surface. 027 found a static
      // `import { capture }` in one cart component cost +1.0 KB on four guest routes and pushed two
      // over the bundle gate. This page is not gated, but the habit is what keeps that from recurring.
      const { capture } = await import("@/lib/telemetry")
      capture({ name: "receipt_resend_requested" })

      const res = await fetch(`/api/orders/${orderId}/receipt`, { method: "POST" })
      if (res.ok) {
        setState({ kind: "sent" })
        return
      }
      capture({
        name: "receipt_resend_refused",
        props: { reason: res.status === 429 ? "rate_limited" : res.status === 404 || res.status === 409 ? "unavailable" : "failed" },
      })
      // The proxy relays the server's problem detail under `error`, not `detail` — see
      // `lib/api/proxy.ts` `relayError`. Reading `detail` here would silently always fall through to
      // the generic copy and throw away the server's own, better-informed wording.
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setState({
        kind: "error",
        message:
          body?.error ??
          (res.status === 429
            ? "We've already sent this a few times recently. Check your inbox and spam folder, then try again later."
            : "We couldn't send it just now. Please try again."),
      })
    } catch {
      setState({ kind: "error", message: "We couldn't send it just now. Please try again." })
    }
  }

  if (state.kind === "sent") {
    return (
      <p className="inline-flex h-9 items-center text-sm text-muted-foreground" aria-live="polite">
        Sent — check your inbox.
      </p>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" onClick={send} disabled={state.kind === "sending"}>
        <Mail aria-hidden="true" />
        {state.kind === "sending" ? "Sending…" : "Send the receipt again"}
      </Button>
      {state.kind === "error" ? (
        <p className="max-w-xs text-right text-xs text-muted-foreground" aria-live="polite">
          {state.message}
        </p>
      ) : null}
    </div>
  )
}
