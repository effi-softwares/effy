import { useState } from "react";

import { Badge, Button, Input, Label, toast } from "@effy/design-system/ui";

import { DetailSection, Segmented, TableFrame, Td, Th } from "@/components/console/primitives";
import { track } from "@/lib/telemetry";

import type { ProductDetail } from "./model";
import { stockErrorText } from "./stockErrorText";
import { useRefreshStock } from "./stockQueries";
import { adjustStock, setStockCount, setStockTracking } from "./stockRepo";
import { planRow, planTable, type StockMode } from "./stockPlan";

/**
 * Stock for every size at once — a table like the sizes editor: one row per size, one number per
 * row, one Save. "Add received" adds a delivery to each shelf; "Set count" records a stocktake.
 *
 * It writes through the same per-size routes as the dialogs, one size after another, so every change
 * is the same recorded movement it always was. A size that fails keeps its number and says why; sizes
 * that saved are cleared — so pressing Save again can never add a delivery twice.
 */
export function StockTable({
  detail,
  onRules,
  onHistory,
}: {
  detail: ProductDetail;
  /** Open the counting rules (tracking, low-stock level) for one size. */
  onRules: (variantId: string) => void;
  /** Show one size's movements below. */
  onHistory: (variantId: string) => void;
}) {
  const sizes = detail.variants.filter((v) => v.state !== "removed");
  const named = sizes.length > 1;
  const [mode, setMode] = useState<StockMode>("receive");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const refresh = useRefreshStock();

  const { writes, invalid } = planTable(sizes, inputs, mode);

  function setInput(id: string, value: string) {
    setInputs((s) => ({ ...s, [id]: value }));
    setErrors((e) => {
      if (!(id in e)) return e;
      const { [id]: _gone, ...rest } = e;
      return rest;
    });
  }

  async function save() {
    if (saving || writes.length === 0 || invalid > 0) return;
    setSaving(true);
    const failed: Record<string, string> = {};
    const reason = mode === "receive" ? "received" : "correction";
    const extra = note.trim() === "" ? {} : { note: note.trim() };
    // One size after another: each is its own recorded movement, and a refusal is one size's, not all.
    for (const { row, plan } of writes) {
      try {
        if (plan.kind === "start") await setStockTracking(row.id, { tracked: true, onHand: plan.onHand });
        else if (plan.kind === "adjust") await adjustStock(row.id, { delta: plan.delta, reason, ...extra });
        else await setStockCount(row.id, { onHand: plan.onHand, reason, ...extra });
      } catch (err) {
        failed[row.id] = stockErrorText(err);
      }
    }
    const saved = writes.length - Object.keys(failed).length;
    // Saved rows are cleared; failed rows keep their number to fix and save again.
    setInputs((s) => Object.fromEntries(Object.entries(s).filter(([id]) => id in failed)));
    setErrors(failed);
    if (Object.keys(failed).length === 0) setNote("");
    setSaving(false);
    refresh();
    track({ name: "stock_table_saved", productId: detail.id, mode, sizes: saved });
    if (saved > 0) toast(`Stock saved for ${saved} ${saved === 1 ? "size" : "sizes"}`);
  }

  return (
    <DetailSection
      title="Stock"
      subtitle={
        mode === "receive"
          ? "A delivery came in: enter how many of each size arrived. They are added to what is on the shelf."
          : "A stocktake: enter how many of each size are on the shelf now. The count is replaced."
      }
      action={
        <Segmented
          ariaLabel="What the numbers mean"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setInputs({});
            setErrors({});
          }}
          options={[
            { value: "receive", label: "Add received" },
            { value: "count", label: "Set count" },
          ]}
        />
      }
    >
      <div className="grid gap-3 pt-[18px]">
        <TableFrame>
          <thead className="bg-muted">
            <tr>
              <Th>{named ? "Size" : "Item"}</Th>
              <Th>Effy code</Th>
              <Th align="right">On hand</Th>
              <Th>Status</Th>
              <Th align="right">Low at</Th>
              <Th width="150px">{mode === "receive" ? "Received" : "Counted"}</Th>
              <Th align="right">After</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {sizes.map((v) => {
              const plan = planRow(v.stock, inputs[v.id] ?? "", mode);
              const after = plan.kind === "adjust" || plan.kind === "set" || plan.kind === "start" ? plan.after : null;
              const label = v.label ?? detail.name;
              return (
                <tr key={v.id} className="border-border border-t align-top">
                  <Td>
                    <span className="font-medium">{label}</span>
                    {v.state === "inactive" ? <span className="text-muted-foreground block text-[12px]">Off sale</span> : null}
                  </Td>
                  <Td className="font-mono text-[12.5px]">{v.code}</Td>
                  <Td align="right" className="tabular-nums">
                    {v.stock.tracked ? (v.stock.onHand ?? 0) : "—"}
                  </Td>
                  <Td>
                    <StockBadge stock={v.stock} />
                  </Td>
                  <Td align="right" className="text-muted-foreground tabular-nums">
                    {v.stock.tracked ? (v.stock.effectiveThreshold ?? "—") : "—"}
                  </Td>
                  <Td>
                    <Input
                      aria-label={`${mode === "receive" ? "Units received" : "Units counted"} for ${label}`}
                      inputMode="numeric"
                      placeholder={mode === "receive" ? "0" : String(v.stock.onHand ?? 0)}
                      value={inputs[v.id] ?? ""}
                      disabled={saving}
                      aria-invalid={plan.kind === "invalid" || v.id in errors}
                      onChange={(e) => setInput(v.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void save();
                      }}
                    />
                    {plan.kind === "invalid" ? <p className="text-destructive mt-1 text-[11.5px]">Enter {plan.message}</p> : null}
                    {errors[v.id] ? <p role="alert" className="text-destructive mt-1 text-[11.5px] leading-tight">{errors[v.id]}</p> : null}
                    {!v.stock.tracked && after !== null ? (
                      <p className="text-muted-foreground mt-1 text-[11.5px]">Starts counting this size</p>
                    ) : null}
                  </Td>
                  <Td align="right" className="font-medium tabular-nums">
                    {after ?? ""}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => onRules(v.id)}>
                        Rules
                      </Button>
                      {v.stock.tracked ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => onHistory(v.id)}>
                          History
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid min-w-[260px] flex-1 gap-1.5">
            <Label htmlFor="stock-note">Note (optional)</Label>
            <Input
              id="stock-note"
              placeholder={mode === "receive" ? "e.g. Delivery from the wholesaler" : "e.g. Monthly stocktake"}
              value={note}
              disabled={saving}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            {sizes.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving || (inputs[sizes[0]!.id] ?? "").trim() === ""}
                onClick={() => {
                  const first = inputs[sizes[0]!.id] ?? "";
                  setInputs(Object.fromEntries(sizes.map((v) => [v.id, first])));
                }}
              >
                Use first row for all
              </Button>
            ) : null}
            <Button type="button" disabled={saving || writes.length === 0 || invalid > 0} onClick={() => void save()}>
              {saving
                ? "Saving…"
                : writes.length === 0
                  ? "Save stock"
                  : `Save stock for ${writes.length} ${writes.length === 1 ? "size" : "sizes"}`}
            </Button>
          </div>
        </div>
      </div>
    </DetailSection>
  );
}

/** In words, never by colour alone: an empty shelf, a thin one, a healthy one, or not counted. */
function StockBadge({ stock }: { stock: ProductDetail["variants"][number]["stock"] }) {
  if (!stock.tracked) return <Badge variant="muted">Not counted</Badge>;
  if (stock.outOfStock) return <Badge variant="destructive">Out of stock</Badge>;
  if (stock.low) return <Badge variant="warning">Low</Badge>;
  return <Badge variant="success">In stock</Badge>;
}
