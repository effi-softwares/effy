import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useHotkey } from "@tanstack/react-hotkeys";
import { ArrowLeft, Store } from "lucide-react";

import type { ReviewImageDTO, ReviewItemDetailDTO } from "@effy/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { Kbd } from "@/components/patterns/Kbd";
import { PageHeader } from "@/components/patterns/Page";
import { DetailRows, Panel } from "@/components/patterns/Panel";
import { StatusWord } from "@/components/patterns/StatusWord";

import { useHeaderDetail } from "@/components/shell/SiteHeader";
import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { track } from "@/lib/telemetry";

import { canDecideReview } from "./access";
import { reviewActionError } from "./errorText";
import { MarginField } from "./MarginField";
import { ReviewVariants } from "./ReviewVariants";
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
  if (item.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60" />
      </div>
    );
  }
  // Keyed on the version: a reload after a conflict resets the form to what is now true.
  return <ReviewItem key={item.data.version} item={item.data} onChanged={() => void item.refetch()} />;
}

function BackLink() {
  return (
    <Link to="/product-review" className="bo-back">
      <ArrowLeft aria-hidden="true" />
      Product review
    </Link>
  );
}

function ReviewItem({ item, onChanged }: { item: ReviewItemDetailDTO; onChanged: () => void }) {
  const navigate = useNavigate();
  useHeaderDetail(item.productName);
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

  useHotkey("A", () => {
    if (canDecide && !busy && !(item.marginRequired && !margin)) void doApprove();
  }, { ignoreInputs: true });
  useHotkey("R", () => {
    if (canDecide && !busy) setSendingBack(true);
  }, { ignoreInputs: true });

  function doApprove() {
    return run("approved", () => approve.mutateAsync({ version: item.version, ...(margin ? { margin } : {}) }));
  }

  return (
    <>
      <PageHeader
        back={{ label: "Product review", link: { to: "/product-review" } }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {item.productName}
            <StatusWord tone={item.kind === "new_product" ? "info" : "waiting"}>{KIND_LABEL[item.kind]}</StatusWord>
          </span>
        }
        meta={
          <span>
            <Store aria-hidden="true" />
            {item.shop.name}
            {item.shop.status !== "active" ? ` · this shop is ${item.shop.status}` : ""}
          </span>
        }
      />

      <div className="bo-detail">
        <div className="bo-detail__main">
          <Tabs defaultValue={item.kind === "change" ? "changes" : "details"}>
            <div className="bo-tabsbar">
              <div className="bo-tabsbar__list">
                <TabsList aria-label="Review sections">
                  {item.kind === "change" ? (
                    <TabsTrigger value="changes">
                      Changes
                      <TabsCount>{item.changes.length + (item.images.proposed ? 1 : 0)}</TabsCount>
                    </TabsTrigger>
                  ) : null}
                  <TabsTrigger value="details">{item.kind === "change" ? "Live product" : "Details"}</TabsTrigger>
                  <TabsTrigger value="images">
                    Images
                    <TabsCount>{(item.images.proposed ?? item.images.current).length}</TabsCount>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            {item.kind === "change" ? (
              <TabsContent value="changes" className="bo-tabpanel">
                <Panel
                  title="What the shop is changing"
                  description={
                    item.changes.length === 0
                      ? undefined
                      : `${item.changes.length} ${item.changes.length === 1 ? "detail differs" : "details differ"} from the live product.`
                  }
                  flush
                >
                  {item.changes.length === 0 && !item.images.proposed ? (
                    <p className="px-5 py-4 text-sm text-muted-foreground">No details differ from the live product.</p>
                  ) : (
                    <div className="bo-table-scroll">
                      <table className="bo-table">
                        <thead>
                          <tr>
                            <th>Detail</th>
                            <th>Now</th>
                            <th>Proposed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.changes.map((c) => (
                            <tr key={c.field} className="align-top">
                              <th scope="row" className="text-left font-medium">
                                {c.label}
                              </th>
                              {/* Read aloud as "Name — was X — proposed Y". */}
                              <td className="whitespace-pre-line break-words text-muted-foreground line-through decoration-muted-foreground/40">
                                <span className="sr-only">was </span>
                                {c.before ?? "nothing"}
                              </td>
                              <td className="whitespace-pre-line break-words font-medium">
                                <span className="sr-only">proposed </span>
                                {c.after ?? "nothing"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </TabsContent>
            ) : null}

            <TabsContent value="details" className="bo-tabpanel">
              <Panel title={item.kind === "change" ? "The product as it is live" : "What the shop submitted"}>
                <DetailRows
                  rows={item.details.map((row) => ({
                    key: row.label,
                    label: row.label,
                    value: <span className="whitespace-pre-line break-words">{row.value ?? "—"}</span>,
                  }))}
                />
              </Panel>
            </TabsContent>

            <TabsContent value="images" className="bo-tabpanel">
              <Panel title="Images">
                {item.images.proposed ? (
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Images title="Now" images={item.images.current} />
                    <Images title="Proposed" images={item.images.proposed} />
                  </div>
                ) : (
                  <Images title="Submitted" images={item.images.current} />
                )}
              </Panel>
            </TabsContent>
          </Tabs>
          {/* 098 — every size the decision puts on sale, priced under the margin being typed. */}
          <ReviewVariants variants={item.variants} entry={entry} />
        </div>

        <aside className="bo-detail__aside is-first">
          <Panel title="Decision">
            {!canDecide ? (
              <p className="text-sm text-muted-foreground">You can read this. Approving or sending it back needs a manager or an administrator.</p>
            ) : (
              <div className="space-y-4">
                <MarginField id="review-margin" shopPrices={item.variants.filter((v) => v.change !== "removed").map((v) => v.shopPriceAmount)} value={entry} onChange={setEntry} disabled={busy} />
                <p className="bo-sub">
                  {item.currentMargin ? `Current margin: ${marginLabel(item.currentMargin)}.` : "No margin has been set for this product."}
                  {item.marginRequired ? " A margin must be confirmed to approve this." : ""}
                </p>
                {message ? (
                  <p role="alert" className="text-sm font-medium">
                    {message}
                  </p>
                ) : null}
                <div className="grid gap-2">
                  <Button disabled={busy || (item.marginRequired && !margin)} onClick={() => void doApprove()}>
                    {item.kind === "change" ? "Approve change" : "Approve and put on sale"}
                    <Kbd className="ml-auto max-md:hidden">A</Kbd>
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => setSendingBack(true)}>
                    Send back…
                    <Kbd className="ml-auto max-md:hidden">R</Kbd>
                  </Button>
                </div>
                <p className="bo-sub">Approving publishes {item.kind === "change" ? "the change" : "the product"} to customers at once.</p>
              </div>
            )}
          </Panel>
        </aside>
      </div>

      <Dialog open={sendingBack} onOpenChange={(o) => (busy ? null : setSendingBack(o))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back to {item.shop.name}?</DialogTitle>
            <DialogDescription>
              {item.kind === "change" ? "The live product stays as it is." : "The product stays off sale."} The shop can fix it and submit again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="send-back-reason">Why is this being sent back?</Label>
            <Textarea
              id="send-back-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. The main image is a stock photo — use a photo of the product itself."
            />
            <p className="bo-sub">The shop sees this, from Effy — not from you by name.</p>
          </div>
          {message ? (
            <p role="alert" className="text-sm font-medium">
              {message}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setSendingBack(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || reason.trim() === ""}
              onClick={() => void run("sent_back", () => sendBack.mutateAsync({ version: item.version, reason: reason.trim() }))}
            >
              Send back to shop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Images({ title, images }: { title: string; images: ReviewImageDTO[] }) {
  return (
    <div className="space-y-2">
      <h3 className="bo-sub font-medium">{title}</h3>
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
