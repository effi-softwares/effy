import type { Metadata } from "next"
import Link from "next/link"
import { History, Trash2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { sellerIdentity } from "@effy/legal-content"

import { ActionLink } from "@/components/storefront/actions"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/misc"

import { GuestDataControl } from "./GuestDataControl"

export const metadata: Metadata = {
  title: "Delete your Effy account",
  description:
    "How to permanently delete your Effy account and the personal data associated with it.",
}

/**
 * How to delete an Effy account, and what happens to the data (reference: Help & info · Deleting
 * your account).
 *
 * ⚠ THIS PAGE IS PUBLIC AND MUST STAY REACHABLE WITHOUT THE APP OR A SIGN-IN: the app stores link
 * to it as the account-deletion address, and someone who cannot sign in still has to be able to read
 * it and reach us.
 *
 * ⚠ The contact address is the business's own, read from `@effy/legal-content` — never typed here.
 */
export default function DeleteAccountPage() {
  const { supportEmail } = sellerIdentity()
  return (
    <div className="container py-10">
      <Breadcrumb
        className="mb-6"
        items={[{ label: "Home", href: "/" }, { label: "Legal", href: "/legal" }, { label: "Deleting your account" }]}
      />
      <article className="mx-auto max-w-[760px] space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">Delete your Effy account</h1>
          <p className="text-base text-muted-foreground">
            You can permanently delete your Effy account and the personal data that goes with it. You don&apos;t need
            the Effy app installed to do this.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Kept icon={Trash2} title="Deleted straight away">
            <li>Your sign-in and profile</li>
            <li>Saved items and lists</li>
            <li>Addresses</li>
            <li>Unused Effy points</li>
            <li>Saved cards</li>
          </Kept>
          <Kept icon={History} title="Kept for the time the law requires">
            <li>Order and payment records</li>
            <li>Receipts and refunds</li>
            <li>Fraud and security records that protect other customers</li>
          </Kept>
        </div>
        <p className="text-sm text-muted-foreground">
          What we keep, and for how long, is set out in our{" "}
          <Link href="/legal/privacy-policy" className="text-foreground underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">How to delete your account</h2>
          <ol className="space-y-3 text-sm">
            <Step n={1}>Sign in and go to Account → Privacy &amp; data.</Step>
            <Step n={2}>Select Delete account. We&apos;ll email you a 6-digit code.</Step>
            {/* The wait for an order in progress is the platform's rule; it is stated, not numbered. */}
            <Step n={3}>Enter the code to confirm. You can&apos;t delete while an order is in progress.</Step>
          </ol>
        </section>

        <div className="flex flex-wrap gap-2">
          <ActionLink href="/account/privacy">Go to Privacy &amp; data</ActionLink>
          <ActionLink href={`mailto:${supportEmail}`} variant="outline">
            Ask us instead
          </ActionLink>
        </div>

        <GuestDataControl />
      </article>
    </div>
  )
}

function Kept({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-xs">
      <div className="flex flex-col gap-1.5">
        <Icon aria-hidden="true" className="size-5" />
        <h2 className="leading-tight font-semibold">{title}</h2>
      </div>
      <ul className="space-y-2 text-sm text-muted-foreground">{children}</ul>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <Badge variant="dark" aria-hidden="true">
        {n}
      </Badge>
      <span>{children}</span>
    </li>
  )
}
