import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@effy/design-system";
import { Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui";
import { unitPriceText } from "@effy/shared-types";

import { STOCK_STATE_WORDS, stockState, weightText, type SizeView } from "./model";
import { SizeMark } from "./SizesFocus";

/** The cells a shop types into. */
export type SheetField = "price" | "sku" | "gtin" | "weight";
export type SheetRow = Record<SheetField, string>;

export interface SheetEditing {
  /** The values as typed, by size id. */
  value: Readonly<Record<string, SheetRow>>;
  /** The values the sheet started from, so a changed cell is marked. */
  initial: Readonly<Record<string, SheetRow>>;
  onChange: (sizeId: string, field: SheetField, value: string) => void;
  /** A cell's refusal, by `sizeId:field`. */
  errors?: Readonly<Record<string, string>>;
  disabled?: boolean;
}

const COLUMNS: readonly SheetField[] = ["price", "sku", "gtin", "weight"];

/**
 * Every size in one table: what it costs, its codes and weight, its stock and whether it is on sale. With `editing`
 * the price, codes and weight are typed straight into the cells - Tab moves across, Enter down - and a changed cell
 * is tinted until it is saved; without it the sheet only reads.
 */
export function SizesSheet({
  sizes,
  money,
  priceLabel,
  codeLabel,
  editing,
  onSaleControl,
  stockAction,
}: {
  sizes: readonly SizeView[];
  money: (amount: string) => string;
  priceLabel: string;
  codeLabel: string;
  editing?: SheetEditing;
  onSaleControl?: (s: SizeView) => ReactNode;
  stockAction?: (s: SizeView) => ReactNode;
}) {
  const ref = useRef<HTMLTableElement>(null);

  function onKey(e: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = ref.current?.querySelector<HTMLInputElement>(`[data-cell="${row + (e.shiftKey ? -1 : 1)}:${col}"]`);
    next?.focus();
    next?.select();
  }

  const cell = (s: SizeView, row: number, field: SheetField, shown: ReactNode, label: string, mono = false) => {
    if (!editing) return <TableCell className={cn(field !== "sku" && field !== "gtin" && "text-right", mono && "font-mono text-[13px]")}>{shown}</TableCell>;
    const value = editing.value[s.id]?.[field] ?? "";
    const changed = value !== (editing.initial[s.id]?.[field] ?? "");
    const error = editing.errors?.[`${s.id}:${field}`];
    return (
      <TableCell className={cn("p-1.5 transition-colors", changed && "bg-primary-muted")}>
        <Input
          data-cell={`${row}:${COLUMNS.indexOf(field)}`}
          value={value}
          aria-label={`${label} for ${s.label}`}
          aria-invalid={error ? true : undefined}
          placeholder={field === "weight" && s.weightAssumed ? `${s.weightGrams} assumed` : undefined}
          title={error}
          inputMode={field === "price" || field === "weight" ? "decimal" : undefined}
          disabled={editing.disabled}
          onChange={(e) => editing.onChange(s.id, field, e.target.value)}
          onKeyDown={(e) => onKey(e, row, COLUMNS.indexOf(field))}
          className={cn(
            "min-w-24",
            (field === "price" || field === "weight") && "text-right tabular-nums",
            mono && "min-w-40 font-mono text-[13px]",
            changed && "font-semibold",
          )}
        />
      </TableCell>
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table ref={ref} className="min-w-[1040px]">
        <TableHeader>
          <TableRow>
            <TableHead>Size</TableHead>
            <TableHead numeric>{priceLabel}</TableHead>
            <TableHead numeric>Customers pay</TableHead>
            <TableHead numeric>Unit price</TableHead>
            <TableHead>{codeLabel}</TableHead>
            <TableHead>Barcode</TableHead>
            <TableHead numeric>Weight, g</TableHead>
            <TableHead numeric>In stock</TableHead>
            {onSaleControl ? <TableHead>On sale</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sizes.map((s, row) => {
            const st = stockState(s.stock);
            const typed = editing?.value[s.id]?.price;
            return (
              <TableRow key={s.id} className={cn(!s.onSale && "[&>td:first-child]:opacity-60")}>
                <TableCell>
                  <span className="flex items-center gap-3 whitespace-nowrap">
                    <SizeMark size={s} />
                    <span>
                      <b className="block font-semibold">{s.label}</b>
                      <span className="block font-mono text-xs text-muted-foreground">{s.code ?? "New"}</span>
                    </span>
                  </span>
                </TableCell>
                {cell(
                  s,
                  row,
                  "price",
                  s.pendingShopPrice ? (
                    <span className="whitespace-nowrap">
                      <s className="mr-1.5 text-muted-foreground">{money(s.shopPrice)}</s>
                      {money(s.pendingShopPrice)}
                    </span>
                  ) : (
                    money(s.shopPrice)
                  ),
                  priceLabel,
                )}
                <TableCell numeric className="font-semibold">
                  {s.customerPrice ? money(s.customerPrice) : <span className="font-normal text-muted-foreground">-</span>}
                  {editing && typed !== undefined && typed !== editing.initial[s.id]?.price ? (
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">set by Effy on review</span>
                  ) : null}
                </TableCell>
                <TableCell numeric className="text-muted-foreground">
                  {s.unitPrice ? unitPriceText(s.unitPrice) : "-"}
                </TableCell>
                {cell(s, row, "sku", s.sku ?? "-", codeLabel, true)}
                {cell(s, row, "gtin", s.gtin ?? "-", "Barcode", true)}
                {cell(s, row, "weight", weightText(s.weightGrams), "Packed weight in grams")}
                <TableCell numeric className="whitespace-nowrap">
                  {s.stock.tracked ? (
                    <span className={cn("font-semibold", st === "low" && "text-accent2", st === "out" && "text-destructive")}>
                      {s.stock.onHand ?? 0}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{STOCK_STATE_WORDS.untracked}</span>
                  )}
                  {stockAction ? <span className="ml-1.5 inline-flex align-middle">{stockAction(s)}</span> : null}
                </TableCell>
                {onSaleControl ? <TableCell>{onSaleControl(s)}</TableCell> : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
