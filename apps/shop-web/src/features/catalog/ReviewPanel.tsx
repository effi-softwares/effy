import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import { ArrowRight, CircleAlert, Hand, Hourglass } from "lucide-react"

import {
  Button,
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
import { Banner, BannerQuote } from "@effy/web-kit/patterns"

import { cn } from "@/lib/utils"
import { track } from "@/lib/telemetry"

import { productMutationError } from "./errorText"
import type { ProductDetail } from "./model"
import { taxonomyQuery, useWithdrawReview } from "./queries"
import { proposedRows } from "./review"

/**
 * Where the product stands with Effy, as one strip under the page head: Effy's hold first (102) — it decides whether
 * the product sells, whatever review says — then the review. A change names what it changes, each a jump to where the
 * page marks it; the side-by-side lives in a dialog.
 */
export function ReviewPanel({ detail }: { detail: ProductDetail }) {
  return (
    <>
      {detail.hold ? (
        <Banner tone="problem" icon={Hand} role="region" label="Held by Effy" title="Held by Effy">
          <p>
            Effy has taken it off sale. Customers can't find or buy it until Effy releases it. You can still edit it —
            changes go to Effy for review as usual.
          </p>
          <BannerQuote>{detail.hold.reason}</BannerQuote>
        </Banner>
      ) : null}
      <ReviewState detail={detail} />
    </>
  )
}

const TITLE = {
  effy_setup: "Effy is setting this product up",
  in_review: "Waiting for Effy to review it",
  sent_back: "Effy sent it back",
  live_change_pending: "Your change is with Effy",
  live_change_sent_back: "Effy sent your change back",
} as const

const BODY = {
  effy_setup: "It goes on sale by itself once it is complete, and from then on it is yours to change.",
  in_review: "It goes on sale when Effy approves it. You can still edit it and adjust its stock while you wait.",
  sent_back: "It is not on sale. Fix what Effy describes, then submit it again.",
  live_change_pending: "Shoppers keep seeing it as it is on sale until Effy approves. Another edit joins this change.",
  live_change_sent_back: "Nothing changed for shoppers. Edit it to send the change again, or discard it.",
} as const

/** Where on the page a changed detail is marked; facts and the category sit in the side panel. */
function sectionOf(label: string): string | null {
  if (["Name", "Brand", "Short description", "Long description"].includes(label)) return "about"
  if (label === "Images") return "pictures"
  if (label === "Details") return "details"
  if (["Category", "Storage", "GST", "18+"].includes(label)) return null
  return "sizes"
}

/** A changed detail's name on its chip: "750 mL price", "Pictures". */
function chipOf(label: string): string {
  if (label === "Images") return "Pictures"
  if (sectionOf(label) !== "sizes" || label === "Unit pricing" || label === "A new size" || label === "Price")
    return label
  if (label.endsWith(" codes") || label.endsWith("(removed)")) return label
  return `${label} price`
}

function ReviewState({ detail }: { detail: ProductDetail }) {
  const taxonomy = useQuery(taxonomyQuery)
  const withdraw = useWithdrawReview(detail.id)
  const [error, setError] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)

  const state = detail.reviewState
  if (!state || state === "draft" || state === "live") return null

  const rows = proposedRows(detail, taxonomy.data?.categories)
  const isChange = state === "live_change_pending" || state === "live_change_sent_back"
  const sentBack = state === "sent_back" || state === "live_change_sent_back"

  function discard() {
    setError(null)
    withdraw.mutate(undefined, {
      onSuccess: () => track({ name: "product_review_withdrawn", productId: detail.id }),
      onError: (err) =>
        setError(productMutationError(err, "This change has already been decided. Reload to see where it stands.")),
    })
  }

  return (
    <Banner
      tone={sentBack ? "problem" : "info"}
      icon={sentBack ? CircleAlert : Hourglass}
      role="region"
      label="Review"
      title={TITLE[state]}
      actionsBelow
      actions={
        isChange
          ? [
              ...(rows.length > 0 ? [{ label: "Compare", primary: true, onClick: () => setComparing(true) }] : []),
              { label: "Discard change", disabled: withdraw.isPending, onClick: discard },
            ]
          : undefined
      }
    >
      <p>{BODY[state]}</p>
      {sentBack && detail.reviewReason ? <BannerQuote>{detail.reviewReason}</BannerQuote> : null}
      {error ? (
        <p role="alert" className="mt-2 font-medium">
          {error}
        </p>
      ) : null}

      <ResponsiveModal open={comparing} onOpenChange={setComparing}>
        <ResponsiveModalContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <ResponsiveModalHeader>
            <ResponsiveModalTitle>Your change, beside what is on sale</ResponsiveModalTitle>
            <ResponsiveModalDescription>
              Shoppers see the left until Effy approves the change. Prices are what you are paid. Choose a detail to see
              it on the page.
            </ResponsiveModalDescription>
          </ResponsiveModalHeader>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Detail</TableHead>
                  <TableHead>On sale now</TableHead>
                  <TableHead>Your change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const section = sectionOf(r.label)
                  const go = section
                    ? () => {
                        setComparing(false)
                        document.getElementById(section)?.scrollIntoView({ block: "start" })
                      }
                    : undefined
                  return (
                    <TableRow key={r.label} className={cn("align-top", go && "cursor-pointer")} onClick={go}>
                      <TableHead scope="row" className="h-auto py-3 font-medium text-foreground">
                        {go ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              go()
                            }}
                            className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            {chipOf(r.label)}
                            <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                            <span className="sr-only">— go to it on the page</span>
                          </button>
                        ) : (
                          chipOf(r.label)
                        )}
                      </TableHead>
                      <TableCell className="break-words whitespace-pre-line text-muted-foreground">
                        <span className="sr-only">on sale now: </span>
                        {r.now}
                      </TableCell>
                      <TableCell className="font-medium break-words whitespace-pre-line">
                        <span className="sr-only">your change: </span>
                        {r.proposed}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <ResponsiveModalFooter>
            <Button variant="outline" onClick={() => setComparing(false)}>
              Close
            </Button>
          </ResponsiveModalFooter>
        </ResponsiveModalContent>
      </ResponsiveModal>
    </Banner>
  )
}
