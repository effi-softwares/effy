import type { Metadata } from "next"
import { Suspense } from "react"

import { coreApi, uncached } from "@/lib/api/core"
import { getSession, requireCustomer } from "@/lib/dal"

export const metadata: Metadata = {
  title: "Hot path",
  robots: { index: false, follow: false },
}

interface PingDTO {
  audience: string
  subject: string
  message: string
}

/**
 * THE HOT-PATH PROVING READ (FR-028, FR-029).
 *
 * This page demonstrates, live, the routing law every later customer slice inherits:
 *
 *     product · catalog · search · cart · order · payment   →   core-api  (Go, hot path)
 *     customer profile / account management                 →   edge-api  (serverless, cold path)
 *
 * It calls `core-api`'s existing `GET /v1/customer/ping`, which is gated by the CUSTOMER pool's
 * verifier — so a token from any other audience dies in the middleware before the handler runs
 * (Principle IV). It proves the hot path accepts the customer credential, and that the storefront
 * can reach it.
 *
 * ⚠ `core-api` is LOCAL-DOCKER-ONLY in this slice (operator decision, 2026-07-14): it has no cloud
 * deployment. Run `make core-run` to see this work. Its address is CONFIGURATION
 * (`NEXT_PUBLIC_CORE_API_BASE_URL`), never a literal, so the go-live slice repoints it with an env
 * change and no code edit — which is the whole of FR-029, proven here rather than promised.
 */
export default function HotPathPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Hot path</h1>
      <p className="mt-3 text-muted-foreground">
        Product, search, cart, order and payment are served by the low-latency Go backend. This
        proves the storefront can reach it with your customer credential.
      </p>

      <Suspense fallback={<PingSkeleton />}>
        <HotPathPing />
      </Suspense>
    </div>
  )
}

async function HotPathPing() {
  await requireCustomer("/account/hot-path")
  const session = await getSession()

  let ping: PingDTO | null = null
  let error: string | null = null

  try {
    ping = await coreApi(session!.idToken).get<PingDTO>("/v1/customer/ping", uncached())
  } catch {
    // FR-030 — degrade to something clear and recoverable, never a broken page.
    error =
      "The hot path isn't answering. It runs in local Docker for now — start it with `make core-run`."
  }

  if (!ping) {
    return (
      <p
        className="mt-8 rounded-lg border border-dashed p-6 text-sm text-muted-foreground"
        data-testid="hot-path-degraded"
      >
        {error}
      </p>
    )
  }

  return (
    <dl className="mt-8 divide-y rounded-lg border" data-testid="hot-path-ok">
      <Row label="Audience" value={ping.audience} />
      <Row label="Verified subject" value={ping.subject} />
      <Row label="Response" value={ping.message} />
    </dl>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm">{value}</dd>
    </div>
  )
}

function PingSkeleton() {
  return <div className="mt-8 h-40 w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />
}
