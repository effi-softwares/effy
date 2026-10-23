import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";

import { GST_STATUS_WORDS, type GstStatus } from "@effy/shared-types";
import { Button, Checkbox, toast } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { EmptyState } from "@/components/patterns/States";
import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { canDecideReview } from "./access";
import { gstMissingQuery, useSetGstBulk } from "./queries";

/**
 * Live products nobody has classified as taxable or GST-free. Tax invoices stay off
 * until this list is empty: an unclassified product's invoice could not say how much GST it carried.
 * Tick several and set them at once; each change is recorded against the product.
 */
export function GstMissing() {
  const list = useQuery(gstMissingQuery());
  const canDecide = canDecideReview(useSessionRoles());
  const setBulk = useSetGstBulk();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (list.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (list.data.items.length === 0) {
    return <EmptyState icon={CircleCheck} title="Every live product has a GST status" description="Tax invoices can be turned on in Settings → Tax." />;
  }
  const items = list.data.items;
  const all = items.every((p) => picked.has(p.productId));
  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const apply = (status: GstStatus) =>
    setBulk.mutate(
      { productIds: [...picked], gstStatus: status },
      {
        onSuccess: (r) => {
          toast.success(`${r.changed} product${r.changed === 1 ? "" : "s"} set to ${GST_STATUS_WORDS[status]}`);
          setPicked(new Set());
        },
        onError: () => toast.error("That didn't save. Reload and try again."),
      },
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {list.data.total} live product{list.data.total === 1 ? " has" : "s have"} no GST status. Tax invoices stay off until
        every one is set.
      </p>
      {canDecide ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{picked.size} selected</span>
          <Button size="sm" disabled={picked.size === 0 || setBulk.isPending} onClick={() => apply("gst_free")}>
            Set {GST_STATUS_WORDS.gst_free}
          </Button>
          <Button size="sm" variant="outline" disabled={picked.size === 0 || setBulk.isPending} onClick={() => apply("taxable")}>
            Set {GST_STATUS_WORDS.taxable}
          </Button>
        </div>
      ) : null}
      <div className="bo-table-wrap">
        <div className="bo-table-scroll">
          <table className="bo-table" aria-label="Products with no GST status">
            <thead>
              <tr>
                {canDecide ? (
                  <th className="w-10">
                    <Checkbox
                      aria-label="Select all"
                      checked={all}
                      onCheckedChange={(v) => setPicked(v === true ? new Set(items.map((p) => p.productId)) : new Set())}
                    />
                  </th>
                ) : null}
                <th>Product</th>
                <th>Shop</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.productId}>
                  {canDecide ? (
                    <td>
                      <Checkbox aria-label={`Select ${p.name}`} checked={picked.has(p.productId)} onCheckedChange={() => toggle(p.productId)} />
                    </td>
                  ) : null}
                  <td>{p.name}</td>
                  <td>{p.shopName}</td>
                  <td>{p.categoryName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {list.data.total > items.length ? (
        <p className="text-sm text-muted-foreground">Showing the first {items.length}; set these and the rest appear.</p>
      ) : null}
    </div>
  );
}
