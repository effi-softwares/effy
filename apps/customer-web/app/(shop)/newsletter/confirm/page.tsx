import type { Metadata } from "next"
import { Suspense } from "react"

import type { NewsletterConfirmResult } from "@effy/shared-types"

import { CircleCheck, Clock, Loader } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { NewsletterForm } from "@/app/(shop)/_components/NewsletterForm"
import { ActionLink } from "@/components/storefront/kit"
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
    <div className="container py-10">
      <div className="mx-auto max-w-[480px] py-12">
        <Suspense fallback={<Outcome icon={Loader} title="Confirming…" body="One moment." />}>
          <ConfirmOutcome searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  )
}

/**
 * What following the link in the confirmation email did (reference: Help & info · Newsletter —
 * confirmed / expired).
 *
 * ⚠ AN EXPIRED LINK IS NOT A DEAD END: the same subscribe form is right there, and it sends a fresh
 * link. ⚠ The address is never shown back — this page is reached from a link that can be forwarded.
 */
async function ConfirmOutcome({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const status = token ? await confirmToken(token) : "expired"

  return status === "confirmed" ? (
    <Outcome
      icon={CircleCheck}
      title="You're subscribed"
      body="Thanks for confirming. We'll be in touch when there's something worth sending."
      action={{ label: "Start shopping", href: "/", primary: true }}
    />
  ) : (
    <Outcome
      icon={Clock}
      title="That link has expired"
      body="Confirmation links last a short while and can only be used once. Enter your email and we'll send a new one."
      action={{ label: "Start shopping", href: "/", primary: false }}
    >
      <NewsletterForm />
    </Outcome>
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
  icon: Icon,
  title,
  body,
  action,
  children,
}: {
  icon: LucideIcon
  title: string
  body: string
  action?: { label: string; href: string; primary: boolean }
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-lg border bg-card p-6 text-center shadow-xs">
      <div className="flex flex-col items-center gap-1.5">
        <span className="mb-2 grid size-12 place-items-center rounded-lg bg-muted">
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {children && <div className="w-full text-left">{children}</div>}
      {action && (
        <ActionLink href={action.href} size="md" variant={action.primary ? "primary" : "ghost"}>
          {action.label}
        </ActionLink>
      )}
    </div>
  )
}
