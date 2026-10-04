import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import type { ReviewImageDTO, ReviewItemDetailDTO } from "@effy/shared-types";
import { Badge, Button, Label, Textarea } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { track } from "@/lib/telemetry";

import { canDecideReview } from "./access";
import { reviewActionError } from "./errorText";
import { MarginField } from "./MarginField";
import { KIND_LABEL, marginLabel, toMargin, type MarginEntry } from "./model";
import { reviewItemQuery, useApprove, useSendBack } from "./queries";

/**
 * One review item (067): everything the shop entered, what it is asking to change, and the decision.
 *
 * ⚠ A REVIEWER DECIDES ON WHAT THEY SEE. The item carries a version; the decision sends it back. If
 * the shop edits the item meanwhile, or a colleague decides it, the server refuses and this page
 * reloads — nothing is ever approved that nobody looked at (FR-014).
 *
 * ⚠ EVERYTHING HERE IS SHOP-AUTHORED TEXT shown inside an internal console. It is rendered as text
 * nodes only; a product name containing markup is a product name containing markup.
 */
export function ReviewItemScreen({ productId }: { productId: string }) {
  const item = useQuery(reviewItemQuery(productId));

  if (item.isError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState error={item.error} onRetry={() => void item.refetch()} />
      </div>
    );
  }
  if (item.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  // Keyed on the version: a reload after a conflict resets the form to what is now true.
  return <ReviewItem key={item.data.version} item={item.data} onChanged={() => void item.refetch()} />;
}

function BackLink() {
  return (
    <Link to="/product-review" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
      ← Product review
    </Link>
  );
}

function ReviewItem({ item, onChanged }: { item: ReviewItemDetailDTO; onChanged: () => void }) {
  const navigate = useNavigate();
  const canDecide = canDecideReview(useSessionRoles());
  const approve = useApprove(item.productId);
  const sendBack = useSendBack(item.productId);

  // Start from the margin the product already carries, so confirming it is one click (FR-031).
  const [entry, setEntry] = useState<MarginEntry>(
    item.currentMargin ?? { kind: "percent", value: "" },
  );
  const [reason, setReason] = useState("");
  const [sendingBack, setSendingBack] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const margin = toMargin(entry);
  const busy = approve.isPending || sendBack.isPending;

  async function run(decision: "approved" | "sent_back", action: () => Promise<unknown>) {
    setMessage(null);
    try {
      await action();
      track({
        name: "product_review_decided",
        productId: item.productId,
        kind: item.kind,
        decision,
        marginSet: decision === "approved" && margin !== null,
      });
      await navigate({ to: "/product-review" });
    } catch (err) {
      setMessage(reviewActionError(err));
      onChanged(); // show the reviewer what it is NOW
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <BackLink />
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{item.productName}</h1>
          <Badge variant="outline">{KIND_LABEL[item.kind]}</Badge>
        </header>
        <p className="text-sm text-muted-foreground">
          {item.shop.name}
          {item.shop.status !== "active" ? ` · this shop is ${item.shop.status}` : ""}
        </p>
      </div>

      {item.kind === "change" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">What the shop is changing</h2>
          {item.changes.length === 0 && !item.images.proposed ? (
            <p className="text-sm text-muted-foreground">No details differ from the live product.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Detail</th>
                    <th className="px-3 py-2 font-medium">Now</th>
                    <th className="px-3 py-2 font-medium">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {item.changes.map((c) => (
                    <tr key={c.field} className="border-t border-border align-top">
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {c.label}
                      </th>
                      {/* Read aloud as "Name — was X — proposed Y": the column headers alone are
                          announced once, three rows up, which is not where a listener needs them. */}
                      <td className="whitespace-pre-line break-words px-3 py-2 text-muted-foreground">
                        <span className="sr-only">was </span>
                        {c.before ?? "nothing"}
                      </td>
                      <td className="whitespace-pre-line break-words px-3 py-2">
                        <span className="sr-only">proposed </span>
                        {c.after ?? "nothing"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {item.images.proposed ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Images title="Images now" images={item.images.current} />
              <Images title="Images proposed" images={item.images.proposed} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">
          {item.kind === "change" ? "The product as it is live" : "What the shop submitted"}
        </h2>
        <dl className="grid grid-cols-[minmax(8rem,14rem)_1fr] gap-x-6 gap-y-2 text-sm">
          {item.details.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="whitespace-pre-line break-words">{row.value ?? "—"}</dd>
            </div>
          ))}
        </dl>
        {item.kind === "new_product" ? <Images title="Images" images={item.images.current} /> : null}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <h2 className="text-sm font-medium">Decision</h2>
        {!canDecide ? (
          <p className="text-sm text-muted-foreground">
            You can read this. Approving or sending it back needs a manager or an administrator.
          </p>
        ) : (
          <>
            <MarginField
              id="review-margin"
              shopPriceAmount={item.shopPriceAmount}
              value={entry}
              onChange={setEntry}
              disabled={busy}
            />
            <p className="text-sm text-muted-foreground">
              {item.currentMargin
                ? `Current margin: ${marginLabel(item.currentMargin)}.`
                : "No margin has been set for this product."}
              {item.marginRequired ? " A margin must be confirmed to approve this." : ""}
            </p>

            {message ? (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            ) : null}

            {!sendingBack ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || (item.marginRequired && !margin)}
                  onClick={() =>
                    void run("approved", () =>
                      approve.mutateAsync({ version: item.version, ...(margin ? { margin } : {}) }),
                    )
                  }
                >
                  {item.kind === "change" ? "Approve change" : "Approve and put on sale"}
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setSendingBack(true)}>
                  Send back…
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="send-back-reason">Why is this being sent back?</Label>
                <Textarea
                  id="send-back-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="The shop sees this, from Effy — not from you by name."
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={busy || reason.trim() === ""}
                    onClick={() =>
                      void run("sent_back", () => sendBack.mutateAsync({ version: item.version, reason: reason.trim() }))
                    }
                  >
                    Send back to shop
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setSendingBack(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Images({ title, images }: { title: string; images: ReviewImageDTO[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm text-muted-foreground">{title}</h3>
      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">No images.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {images.map((img) => (
            <li key={img.url} className="space-y-1">
              <img
                src={img.url}
                alt={img.altText ?? ""}
                className="size-28 rounded-md border border-border object-cover"
              />
              {/* Said in words: which image leads, and which are being added. */}
              <p className="text-xs text-muted-foreground">
                {[img.isPrimary ? "Main image" : null, img.isNew ? "New" : null].filter(Boolean).join(" · ") || " "}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
