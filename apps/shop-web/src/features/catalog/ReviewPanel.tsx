import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { CircleAlert, Hourglass } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import { cn } from "@/lib/utils";

import { track } from "@/lib/telemetry";

import { productMutationError } from "./errorText";
import type { ProductDetail } from "./model";
import { catalogSchemaQuery, useWithdrawReview } from "./queries";
import { proposedRows } from "./review";

/**
 * Where this product stands with Effy's review, in words, under the product's header.
 *
 * The page below this panel is the live product — what customers see and buy right now. A change
 * the shop has saved is not shown in those fields until Effy approves it; it is shown here, as
 * Now / Proposed. A page that showed the proposed name in the Name field would tell a shop its
 * storefront says something it does not.
 *
 * The reason is from Effy, never from a named person: the contract carries no staff identity.
 */
export function ReviewPanel({ detail }: { detail: ProductDetail }) {
  const schema = useQuery(catalogSchemaQuery);
  const withdraw = useWithdrawReview(detail.id);
  const [error, setError] = useState<string | null>(null);

  const state = detail.reviewState;
  if (!state || state === "draft" || state === "live") return null;

  const rows = proposedRows(detail, schema.data);
  const isChange = state === "live_change_pending" || state === "live_change_sent_back";
  const sentBack = state === "sent_back" || state === "live_change_sent_back";

  const title = {
    in_review: "Waiting for Effy to review",
    sent_back: "Effy sent this back",
    live_change_pending: "Your change is waiting for Effy to review",
    live_change_sent_back: "Effy sent your change back",
  }[state];

  const body = {
    in_review:
      "This product is not on sale yet. It goes on sale when Effy approves it. You can still edit it and adjust its stock while you wait.",
    sent_back: "It is not on sale. Fix what is described below, then submit it again.",
    live_change_pending:
      "Customers keep seeing and buying the product as it is below until Effy approves the change. Saving another edit updates this same change.",
    live_change_sent_back:
      "Nothing changed for customers — the product is still on sale as it is below. Edit it to send the change again, or discard it.",
  }[state];

  function discard() {
    setError(null);
    withdraw.mutate(undefined, {
      onSuccess: () => track({ name: "product_review_withdrawn", productId: detail.id }),
      onError: (err) =>
        setError(productMutationError(err, "This change has already been decided. Reload to see where it stands.")),
    });
  }

  // Waiting on Effy is in progress (blue); sent back is a problem — the foreground edge with its icon.
  const Icon = sentBack ? CircleAlert : Hourglass;
  return (
    <section aria-label="Review" className={cn("bo-alert gap-y-3!", sentBack ? "bo-alert--destructive" : "bo-alert--info")}>
      <Icon aria-hidden="true" className="mt-0.5" />
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground">{body}</p>
      </div>

      {sentBack && detail.reviewReason ? (
        <div className="col-start-2 grid gap-1">
          <span className="text-sm font-medium">Why</span>
          {/* Rendered as text. `whitespace-pre-line` keeps the reviewer's line breaks. */}
          <p className="break-words whitespace-pre-line">{detail.reviewReason}</p>
        </div>
      ) : null}

      {isChange && rows.length > 0 ? (
        <div className="bo-table-wrap col-start-2">
          <div className="bo-table-scroll">
            <table className="bo-table bo-table--compact">
              <thead>
                <tr>
                  <th>Detail</th>
                  <th>On sale now</th>
                  <th>Your change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="align-top">
                    <th scope="row" className="h-auto! py-2.5! text-left font-medium text-foreground">
                      {r.label}
                    </th>
                    <td className="break-words whitespace-pre-line text-muted-foreground">
                      <span className="sr-only">on sale now: </span>
                      {r.now}
                    </td>
                    <td className="font-medium break-words whitespace-pre-line">
                      <span className="sr-only">your change: </span>
                      {r.proposed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* A never-approved product withdraws from the header's own button; a pending change has no
          header verb (the header's is Unpublish), so its way out lives here. */}
      {isChange ? (
        <div className="col-start-2 flex flex-wrap items-center gap-3">
          <Button variant="outline" disabled={withdraw.isPending} onClick={discard}>
            Discard this change
          </Button>
          {error ? <span role="alert" className="text-sm font-medium">{error}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
