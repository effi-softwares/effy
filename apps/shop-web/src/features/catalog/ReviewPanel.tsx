import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Button } from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { productMutationError } from "./errorText";
import type { ProductDetail } from "./model";
import { catalogSchemaQuery, useWithdrawReview } from "./queries";
import { proposedRows } from "./review";

/**
 * Where this product stands with Effy's review (067), in words, under the product's header.
 *
 * ⚠ THE PAGE BELOW THIS PANEL IS THE LIVE PRODUCT — what customers see and buy right now. A change
 * the shop has saved is NOT shown in those fields until Effy approves it; it is shown HERE, as
 * Now / Proposed. A page that showed the proposed name in the Name field would tell a shop its
 * storefront says something it does not.
 *
 * ⚠ THE REASON IS FROM EFFY, never from a named person: the contract carries no staff identity.
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

  return (
    <section
      aria-label="Review"
      className={
        "grid gap-3 rounded-lg border px-4 py-3.5 " +
        (sentBack ? "border-warning/40 bg-warning-soft" : "border-border bg-muted")
      }
    >
      <div className="grid gap-1">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <p className="text-muted-foreground text-[13px]">{body}</p>
      </div>

      {sentBack && detail.reviewReason ? (
        <div className="grid gap-1">
          <span className="text-[12px] font-medium">Why</span>
          {/* Rendered as text. `whitespace-pre-line` keeps the reviewer's line breaks. */}
          <p className="text-[13px] break-words whitespace-pre-line">{detail.reviewReason}</p>
        </div>
      ) : null}

      {isChange && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <table className="w-full text-[13px]">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Detail</th>
                <th className="px-3 py-2 font-medium">On sale now</th>
                <th className="px-3 py-2 font-medium">Your change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-border align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {r.label}
                  </th>
                  <td className="text-muted-foreground px-3 py-2 break-words whitespace-pre-line">
                    <span className="sr-only">on sale now: </span>
                    {r.now}
                  </td>
                  <td className="px-3 py-2 break-words whitespace-pre-line">
                    <span className="sr-only">your change: </span>
                    {r.proposed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* A never-approved product withdraws from the header's own button; a pending CHANGE has no
          header verb (the header's is Unpublish), so its way out lives here. */}
      {isChange ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" disabled={withdraw.isPending} onClick={discard}>
            Discard this change
          </Button>
          {error ? <span className="text-destructive text-[13px]">{error}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
