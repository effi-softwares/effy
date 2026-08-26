"use client"

import { useState } from "react"

/**
 * "Send the receipt again" (052 US4, FR-027).
 *
 * ⚠ THE ONLY CLIENT COMPONENT ON THE RECEIPT. Everything else on this page is a server component
 * rendering server-fetched data; this one needs a click and a result, so it is the single boundary.
 *
 * ⚠ IT SENDS NO ADDRESS. The endpoint resolves the recipient from the authenticated session — an
 * `email` in the body would make it an open relay for a document carrying a person's name, address
 * and purchase history.
 *
 * ⚠ EVERY OUTCOME IS SAID OUT LOUD, including the refusals. A rate-limited request that silently does
 * nothing is indistinguishable from a broken button, which is the failure 033 recorded when a guest
 * cap refused without telling anyone.
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
      // ⚠ DYNAMIC import, like every other telemetry call site on this surface. 027 found a STATIC
      // `import { capture }` in one cart component cost +1.0 KB on four GUEST routes and pushed two
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
      // ⚠ The proxy relays the server's problem detail under `error`, NOT `detail` — see
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
      // aria-live so the outcome is ANNOUNCED, not merely displayed (SC-009).
      <p className="text-[13px] text-muted-foreground" aria-live="polite">
        Sent — check your inbox.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={send}
        disabled={state.kind === "sending"}
        className="self-start text-[13px] font-medium text-primary hover:underline disabled:opacity-60"
      >
        {state.kind === "sending" ? "Sending…" : "Send the receipt again"}
      </button>
      {state.kind === "error" ? (
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {state.message}
        </p>
      ) : null}
    </div>
  )
}
