import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import { CircleAlert, Hourglass } from "lucide-react"

import { Alert, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { productMutationError } from "./errorText"
import type { ProductDetail } from "./model"
import { taxonomyQuery, useWithdrawReview } from "./queries"
import { proposedRows } from "./review"

/** Effy's hold first (102): it decides whether the product sells, whatever review says. */
export function ReviewPanel({ detail }: { detail: ProductDetail }) {
  return (
    <>
      {detail.hold ? (
        <Alert role="region" aria-label="Held by Effy" variant="destructive" className="gap-y-3">
          <CircleAlert aria-hidden="true" />
          <div className="grid gap-1">
            <h2 className="font-semibold">Held by Effy</h2>
            <p className="text-muted-foreground">
              Effy has taken this product off sale. Customers cannot find or buy it, and it cannot go back on sale until
              Effy releases it. You can still edit it — changes go to Effy for review as usual.
            </p>
          </div>
          <div className="col-start-2 grid gap-1">
            <span className="text-sm font-medium">Why</span>
            <p className="break-words whitespace-pre-line">{detail.hold.reason}</p>
          </div>
        </Alert>
      ) : null}
      <ReviewState detail={detail} />
    </>
  )
}

function ReviewState({ detail }: { detail: ProductDetail }) {
  const taxonomy = useQuery(taxonomyQuery)
  const withdraw = useWithdrawReview(detail.id)
  const [error, setError] = useState<string | null>(null)

  const state = detail.reviewState
  if (!state || state === "draft" || state === "live") return null

  const rows = proposedRows(detail, taxonomy.data?.categories)
  const isChange = state === "live_change_pending" || state === "live_change_sent_back"
  const sentBack = state === "sent_back" || state === "live_change_sent_back"

  const title = {
    effy_setup: "Effy is setting this product up",
    in_review: "Waiting for Effy to review",
    sent_back: "Effy sent this back",
    live_change_pending: "Your change is waiting for Effy to review",
    live_change_sent_back: "Effy sent your change back",
  }[state]

  const body = {
    effy_setup:
      "Effy added this product for you and is finishing it. It goes on sale by itself once it is complete, and from then on it is yours to change like any other product.",
    in_review:
      "This product is not on sale yet. It goes on sale when Effy approves it. You can still edit it and adjust its stock while you wait.",
    sent_back: "It is not on sale. Fix what is described below, then submit it again.",
    live_change_pending:
      "Customers keep seeing and buying the product as it is below until Effy approves the change. Saving another edit updates this same change.",
    live_change_sent_back:
      "Nothing changed for customers — the product is still on sale as it is below. Edit it to send the change again, or discard it.",
  }[state]

  function discard() {
    setError(null)
    withdraw.mutate(undefined, {
      onSuccess: () => track({ name: "product_review_withdrawn", productId: detail.id }),
      onError: (err) =>
        setError(productMutationError(err, "This change has already been decided. Reload to see where it stands.")),
    })
  }

  const Icon = sentBack ? CircleAlert : Hourglass
  return (
    <Alert role="region" aria-label="Review" variant={sentBack ? "destructive" : "info"} className="gap-y-3">
      <Icon aria-hidden="true" />
      <div className="grid gap-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-muted-foreground">{body}</p>
      </div>

      {sentBack && detail.reviewReason ? (
        <div className="col-start-2 grid gap-1">
          <span className="text-sm font-medium">Why</span>
          <p className="break-words whitespace-pre-line">{detail.reviewReason}</p>
        </div>
      ) : null}

      {isChange && rows.length > 0 ? (
        <div className="col-start-2 overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Detail</TableHead>
                <TableHead>On sale now</TableHead>
                <TableHead>Your change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label} className="align-top">
                  <TableHead scope="row" className="h-auto py-3 font-medium text-foreground">
                    {r.label}
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
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {isChange ? (
        <div className="col-start-2 flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={withdraw.isPending} onClick={discard}>
            Discard this change
          </Button>
          {error ? (
            <span role="alert" className="text-sm font-medium">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}
    </Alert>
  )
}
