import type { Metadata } from "next"
import { Suspense } from "react"

import type { NewsletterConfirmResult } from "@effy/shared-types"

import { ActionLink, Display } from "@/components/storefront/kit"
import { edgeApiPublic, perCustomer } from "@/lib/api/edge"

/**
 * `/newsletter/confirm` — the destination of the double opt-in link (039 US6).
 *
 * ⚠ ZERO CLIENT JS. Nothing here is interactive: it reads a token, calls the confirm endpoint
 * server-side, and renders one of two outcomes with a link back to the store.
 *
 * ⚠ NOINDEX. Every URL of this page carries a live single-use token. A crawler that indexed one would
 * publish a working confirmation link, and following it would burn a real subscriber's token before
 * they ever saw the email.
 *
 * ⚠ The token is read inside a `<Suspense>` boundary so the page keeps a STATIC SHELL under PPR —
 * touching `searchParams` at the top level would make the whole route dynamic.
 */
export const metadata: Metadata = {
  title: "Confirm your subscription — Effy",
  robots: { index: false, follow: false },
}

export default function NewsletterConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  return (
    <div className="container py-20">
      <Suspense fallback={<Outcome title="Confirming…" body="One moment." />}>
        <ConfirmOutcome searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

/**
 * ⚠ THE TOKEN APPEARS IN THIS PAGE'S RSC PAYLOAD, AND THAT IS ACCEPTED — with the reasoning recorded,
 * because it looks alarming and a later reader will want to know it was considered.
 *
 * Next serialises a page's `searchParams` into the flight payload whether or not anything renders them,
 * so `?token=…` shows up in the served HTML three times even though nothing here prints it.
 *
 * A confirm-then-redirect was built to remove it and **reverted**, for two reasons:
 *
 *   1. It did not work. `redirect()` inside a streamed `<Suspense>` boundary does not produce an HTTP
 *      3xx — the response is still 200 with the shell, and the redirect resolves on the client. The
 *      token stayed in the payload of that first response regardless.
 *   2. It broke the page without JavaScript. A client that does not run the redirect sits on
 *      "Confirming…" forever, which is a real regression traded for a theoretical gain.
 *
 * ⚠ The decisive point is that **the token is already spent by the time this HTML exists**. The confirm
 * call happens before render, the token is single-use, and the row's hash is cleared — so what appears
 * in the payload is a dead credential, on a `noindex` page, in the browser of the one person who held
 * it. Removing it properly needs a Route Handler that redirects before any HTML is produced; that is
 * recorded as an option, not built, because the exposure does not justify a second route.
 */
async function ConfirmOutcome({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams

  // ⚠ A missing token takes the SAME path as a dead one. There is nothing useful to say differently,
  // and distinguishing them would confirm that some tokens are recognised.
  const status = token ? await confirmToken(token) : "expired"

  return status === "confirmed" ? (
    <Outcome
      title="You're subscribed"
      body="Thanks — we'll be in touch when there's something worth sending."
      action={{ label: "Start shopping", href: "/" }}
    />
  ) : (
    <Outcome
      title="This link has expired"
      body="Confirmation links last a short while and can only be used once. Subscribe again from the
            home page and we'll send a fresh one."
      action={{ label: "Back to the store", href: "/" }}
    />
  )
}

async function confirmToken(token: string): Promise<NewsletterConfirmResult["status"]> {
  try {
    const result = await edgeApiPublic().get<NewsletterConfirmResult>(
      `/customer/v1/newsletter/confirm?token=${encodeURIComponent(token)}`,
      perCustomer,
    )
    return result.status
  } catch {
    // ⚠ A backend failure renders "expired" rather than an error page. The subscriber can only retry
    // the same link either way, and "this link has expired, subscribe again" is a usable instruction
    // where a 500 is a dead end. The real failure is logged on the backend, where it can be acted on.
    return "expired"
  }
}

function Outcome({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="mx-auto max-w-md text-center">
      <Display as="h1" size="page">
        {title}
      </Display>
      <p className="mx-auto mt-4 text-sm text-muted-foreground sm:text-base">{body}</p>
      {action && (
        <ActionLink href={action.href} size="lg" className="mt-8">
          {action.label}
        </ActionLink>
      )}
    </div>
  )
}
