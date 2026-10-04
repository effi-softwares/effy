import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { MarginNotSetItemDTO, ReviewKind } from "@effy/shared-types";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { shopListQuery } from "@/features/shops/queries";
import { track } from "@/lib/telemetry";

import { canDecideReview } from "./access";
import { reviewActionError } from "./errorText";
import { MarginField } from "./MarginField";
import { KIND_LABEL, toMargin, waitingLabel, type MarginEntry } from "./model";
import { marginNotSetQuery, reviewQueueQuery, useSetMargin } from "./queries";

const ALL_SHOPS = "all";

/**
 * Product review (067) — what is waiting on Effy.
 *
 * Shops no longer publish. A new product, and every change to one already on sale, waits here until
 * an admin approves it or sends it back. Nothing on this screen resolves itself: an item nobody
 * opens is a shop that cannot sell it.
 *
 * ⚠ ONE QUEUE, OLDEST FIRST (FR-006). New products and changes are stored differently and listed
 * together, because a reviewer working down the page should not have to know that.
 * ⚠ A TABLE, NOT CARDS (Principle V): these are things to work through, not figures to admire.
 */
export function ReviewQueueScreen() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<ReviewKind | null>(null);
  const [shopId, setShopId] = useState<string>(ALL_SHOPS);
  // Keyset paging (FR-006): the cursors of the pages walked so far. Empty = the first page, which
  // is where the longest-waiting items are.
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1] ?? null;
  const queue = useQuery(
    reviewQueueQuery({ q, kind, shopId: shopId === ALL_SHOPS ? null : shopId, cursor }),
  );
  // The filter's options. ⚠ A failed or slow shop list must not take the queue down with it: the
  // select simply offers "All shops" until it lands.
  const shops = useQuery(shopListQuery({ page: 1, pageSize: 100 }));

  /** Any filter change starts again from the oldest item. */
  function filter<T>(set: (v: T) => void, value: T) {
    set(value);
    setCursors([]);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Product review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          New products and changes from shops. A product is not on sale, and a change is not visible to
          customers, until it is approved here.
        </p>
      </header>

      <Tabs defaultValue="waiting">
        <TabsList>
          <TabsTrigger value="waiting">Waiting for review</TabsTrigger>
          <TabsTrigger value="margin">Margin not set</TabsTrigger>
        </TabsList>

        <TabsContent value="waiting" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-64"
              placeholder="Search by product name"
              aria-label="Search by product name"
              value={q}
              onChange={(e) => filter(setQ, e.target.value)}
            />
            <Select value={shopId} onValueChange={(v) => filter(setShopId, v)}>
              <SelectTrigger className="w-56" aria-label="Shop">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SHOPS}>All shops</SelectItem>
                {(shops.data?.items ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div role="group" aria-label="Kind" className="flex gap-1">
              {([null, "new_product", "change"] as const).map((k) => (
                <Button
                  key={k ?? "all"}
                  size="sm"
                  variant={kind === k ? "default" : "outline"}
                  aria-pressed={kind === k}
                  onClick={() => filter(setKind, k)}
                >
                  {k ? KIND_LABEL[k] : "All"}
                </Button>
              ))}
            </div>
          </div>

          {queue.isError ? (
            <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
          ) : queue.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : queue.data.items.length === 0 ? (
            /* ⚠ A STATED FACT, not blank space: an empty region is indistinguishable from a screen
               that did not load. */
            <section className="rounded-lg border border-border p-6">
              <h2 className="text-base font-medium">Nothing is waiting</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every product and change a shop has submitted has been decided.
              </p>
            </section>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Shop</th>
                    <th className="px-3 py-2 font-medium">Kind</th>
                    <th className="px-3 py-2 font-medium">Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.items.map((i) => (
                    <tr key={`${i.kind}-${i.productId}`} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Link
                          to="/product-review/$productId"
                          params={{ productId: i.productId }}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {i.productName}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{i.shopName}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{KIND_LABEL[i.kind]}</Badge>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{waitingLabel(i.waitingHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {queue.data && (cursors.length > 0 || queue.data.nextCursor) ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={cursors.length === 0} onClick={() => setCursors([])}>
                Back to the oldest
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!queue.data.nextCursor}
                onClick={() => queue.data.nextCursor && setCursors([...cursors, queue.data.nextCursor])}
              >
                Next page
              </Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="margin">
          <MarginNotSet />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Approved products with no margin (067 FR-008): they sell at the shop's own price until one is set.
 * Every product that was on sale before review existed starts here.
 */
function MarginNotSet() {
  // Every product that was on sale before review existed starts on this list, so it is paged.
  const [cursors, setCursors] = useState<string[]>([]);
  const list = useQuery(marginNotSetQuery(cursors[cursors.length - 1] ?? null));
  const canDecide = canDecideReview(useSessionRoles());

  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (list.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (list.data.items.length === 0 && cursors.length > 0) {
    // The last product on a later page was just given a margin. "Every product has a margin" would
    // be untrue — earlier pages still hold some.
    return (
      <Button size="sm" variant="outline" onClick={() => setCursors([])}>
        Back to the first page
      </Button>
    );
  }
  if (list.data.items.length === 0) {
    return (
      <section className="rounded-lg border border-border p-6">
        <h2 className="text-base font-medium">Every product has a margin</h2>
        <p className="mt-1 text-sm text-muted-foreground">Nothing on sale is selling at the shop's own price.</p>
      </section>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        These are on sale at the shop's own price. Setting a margin changes what customers pay straight away.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Shop</th>
              <th className="px-3 py-2 font-medium">Shop price</th>
              <th className="px-3 py-2 font-medium">{canDecide ? "Set margin" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {list.data.items.map((p) => (
              <MarginNotSetRow key={p.productId} product={p} canDecide={canDecide} />
            ))}
          </tbody>
        </table>
      </div>
      {cursors.length > 0 || list.data.nextCursor ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={cursors.length === 0} onClick={() => setCursors([])}>
            First page
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!list.data.nextCursor}
            onClick={() => list.data.nextCursor && setCursors([...cursors, list.data.nextCursor])}
          >
            Next page
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MarginNotSetRow({ product, canDecide }: { product: MarginNotSetItemDTO; canDecide: boolean }) {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<MarginEntry>({ kind: "percent", value: "" });
  const [message, setMessage] = useState<string | null>(null);
  const setMargin = useSetMargin();
  const margin = toMargin(entry);

  async function save() {
    if (!margin) return;
    setMessage(null);
    try {
      await setMargin.mutateAsync({ productId: product.productId, body: { margin, expectedCurrent: null } });
      track({ name: "product_margin_set", productId: product.productId });
    } catch (err) {
      setMessage(reviewActionError(err));
    }
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2 font-medium">{product.productName}</td>
      <td className="px-3 py-2">{product.shopName}</td>
      <td className="px-3 py-2 tabular-nums">{product.shopPriceAmount}</td>
      <td className="px-3 py-2">
        {!canDecide ? null : !open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Set margin
          </Button>
        ) : (
          <div className="space-y-2">
            <MarginField
              id={`margin-${product.productId}`}
              shopPriceAmount={product.shopPriceAmount}
              value={entry}
              onChange={setEntry}
              disabled={setMargin.isPending}
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={!margin || setMargin.isPending} onClick={() => void save()}>
                Save margin
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
            {message ? <p className="text-sm text-destructive">{message}</p> : null}
          </div>
        )}
      </td>
    </tr>
  );
}
