import type { ReactNode } from "react";

import { Copy } from "lucide-react";

import { cn } from "@effy/design-system";
import { Badge, Button, toast } from "@effy/design-system/ui";
import { unitPriceText } from "@effy/shared-types";

import {
  gaugeShare,
  STOCK_STATE_WORDS,
  stockState,
  unitLadder,
  weightText,
  type SizeView,
  type StockState,
} from "./model";

const STOCK_TEXT: Record<StockState, string> = {
  untracked: "text-muted-foreground",
  ok: "text-success",
  low: "text-accent2",
  out: "text-destructive",
};
const STOCK_FILL: Record<StockState, string> = {
  untracked: "bg-muted",
  ok: "bg-success",
  low: "bg-accent2",
  out: "bg-destructive",
};

interface Props {
  sizes: readonly SizeView[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** How an amount is written in this console ("AUD 16.00"). */
  money: (amount: string) => string;
  /** Whose price the shop price is: "Your price" to a shop, "Shop price" to staff. */
  priceLabel: string;
  /** The shop's own code's name: "Your code" to a shop, "Shop code" to staff. */
  codeLabel: string;
  /** Staff only: the margin's name ("Effy's margin · 10%") — its amount is shown between the two prices. */
  marginLabel?: string;
  /** What customers pay says before the product is first approved. */
  unsetCustomerPrice?: string;
  /** The word on a price waiting for Effy ("In review", "Sent back"). */
  pendingWord?: string;
  onSaleControl?: (s: SizeView) => ReactNode;
  stockActions?: (s: SizeView) => ReactNode;
  /** Under everything about the size: its removal, say. */
  footer?: (s: SizeView) => ReactNode;
  /** Under the list: adding a size. */
  addSize?: ReactNode;
}

/**
 * A product's sizes one at a time: the list on the left, and everything about the chosen size on the right — its
 * price from the shop's to the customer's with the unit price across sizes, its stock and its codes.
 */
export function SizesFocus({
  sizes,
  selectedId,
  onSelect,
  money,
  priceLabel,
  codeLabel,
  marginLabel,
  unsetCustomerPrice = "Set when approved",
  pendingWord = "In review",
  onSaleControl,
  stockActions,
  footer,
  addSize,
}: Props) {
  const size = sizes.find((s) => s.id === selectedId) ?? sizes[0];
  if (!size) return null;
  const ladder = unitLadder(sizes);
  const best = ladder ? ladder.reduce((a, b) => (b.share < a.share ? b : a)) : null;

  return (
    <div className="grid overflow-hidden rounded-lg border md:grid-cols-[288px_minmax(0,1fr)]">
      <div
        className="flex gap-1 border-b bg-sidebar p-2.5 max-md:overflow-x-auto md:flex-col md:border-r md:border-b-0"
        aria-label="Sizes"
        role="group"
      >
        {sizes.map((s) => {
          const st = stockState(s.stock);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-current={s.id === size.id ? "true" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-md border border-transparent p-3 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 md:w-full",
                s.id === size.id && "border-border bg-background hover:bg-background",
              )}
            >
              <SizeMark size={s} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.label}</span>
                <span className={cn("block text-[13px]", s.onSale ? STOCK_TEXT[st] : "text-muted-foreground")}>
                  {s.onSale
                    ? `${STOCK_STATE_WORDS[st]}${s.stock.tracked ? ` · ${s.stock.onHand ?? 0}` : ""}`
                    : "Off sale"}
                </span>
              </span>
              <span className="text-right font-semibold tabular-nums max-md:hidden">
                {s.customerPrice ? money(s.customerPrice) : money(s.pendingShopPrice ?? s.shopPrice)}
                {s.unitPrice ? (
                  <span className="block text-xs font-normal text-muted-foreground">{unitPriceText(s.unitPrice)}</span>
                ) : null}
              </span>
            </button>
          );
        })}
        {addSize ? <div className="shrink-0 md:mt-1.5">{addSize}</div> : null}
      </div>

      <div key={size.id} className="grid min-w-0 content-start gap-10 p-8 max-md:p-5" style={{ animation: "effy-fade 200ms ease-out" }}>
        <div className="flex flex-wrap items-center gap-4">
          <SizeMark size={size} large />
          <div className="min-w-0">
            <h3 className="text-xl leading-7 font-semibold tracking-[-0.02em]">{size.label}</h3>
            {size.code ? <CodeChip code={size.code} /> : <span className="text-sm text-muted-foreground">New size — its code comes on approval</span>}
          </div>
          {onSaleControl ? <div className="ml-auto flex items-center gap-3 text-sm font-medium">{onSaleControl(size)}</div> : null}
        </div>

        <Block title="Price">
          <div className="flex flex-wrap items-stretch gap-3">
            <PriceBox label={priceLabel}>
              {size.pendingShopPrice ? (
                <>
                  <s className="text-sm font-normal text-muted-foreground">{money(size.shopPrice)}</s>
                  {money(size.pendingShopPrice)}
                </>
              ) : (
                money(size.shopPrice)
              )}
              {size.pendingShopPrice ? (
                <Badge variant="default" className="basis-full">
                  {pendingWord}
                </Badge>
              ) : null}
            </PriceBox>
            {marginLabel && size.customerPrice ? (
              <>
                <Operator>+</Operator>
                <PriceBox label={marginLabel} muted>
                  {money((Number(size.customerPrice) - Number(size.shopPrice)).toFixed(2))}
                </PriceBox>
                <Operator>=</Operator>
              </>
            ) : (
              <Operator>→</Operator>
            )}
            <PriceBox label="Customers pay" result>
              {size.customerPrice ? (
                money(size.customerPrice)
              ) : (
                <span className="text-sm font-normal text-muted-foreground">{unsetCustomerPrice}</span>
              )}
            </PriceBox>
          </div>
          {ladder ? (
            <div className="mt-6 grid max-w-[640px] gap-2.5">
              <p className="text-xs text-muted-foreground">
                What each size costs a customer {ladder[0]!.unit.basis === "each" ? "per item" : "for the same amount"}
                {best && best.id === size.id ? ` — ${size.label} is the best value` : ""}
              </p>
              {ladder.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    "grid grid-cols-[80px_minmax(0,1fr)_120px] items-center gap-3.5 text-[13px]",
                    row.id === size.id && "font-semibold",
                  )}
                >
                  <span className="truncate">{row.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <i
                      className={cn(
                        "block h-full rounded-full transition-[width] duration-500",
                        row.id === size.id ? "bg-primary-fill" : "bg-muted-foreground/45",
                      )}
                      style={{ width: `${row.share}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums">{unitPriceText(row.unit)}</span>
                </div>
              ))}
            </div>
          ) : size.unitPrice ? (
            <p className="mt-3 text-sm text-muted-foreground tabular-nums">{unitPriceText(size.unitPrice)}</p>
          ) : null}
        </Block>

        <Block title="Stock">
          <SizeStockView size={size} actions={stockActions?.(size)} />
        </Block>

        <Block title="Codes and shipping">
          <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-8 gap-y-5">
            <Fact label="Effy code" mono>
              {size.code ?? "—"}
            </Fact>
            <Fact label={codeLabel} mono>
              {size.sku ?? "—"}
            </Fact>
            <Fact label="Barcode" mono={!!size.gtin}>
              {size.gtin ?? <span className="text-muted-foreground">None</span>}
            </Fact>
            <Fact label="Packed weight">
              {weightText(size.weightGrams)}
              {size.weightAssumed ? <span className="ml-1.5 text-muted-foreground">assumed</span> : null}
            </Fact>
            <Fact label="Net quantity">
              {size.quantity ? `${size.quantity.amount} ${size.quantity.unit}` : <span className="text-muted-foreground">—</span>}
            </Fact>
          </dl>
        </Block>

        {footer ? <div>{footer(size)}</div> : null}
      </div>
    </div>
  );
}

/** A size's count, its gauge with the alert level marked, and what to do about it. */
export function SizeStockView({ size, actions }: { size: SizeView; actions?: ReactNode }) {
  const st = stockState(size.stock);
  const { fill, mark } = gaugeShare(size.stock);
  return (
    <div className="grid max-w-[520px] gap-3">
      {size.stock.tracked ? (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[34px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{size.stock.onHand ?? 0}</span>
            <span className={cn("text-sm font-medium", STOCK_TEXT[st])}>{STOCK_STATE_WORDS[st]}</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-muted" role="img" aria-label={`${size.stock.onHand ?? 0} on hand`}>
            <i className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", STOCK_FILL[st])} style={{ width: `${fill}%` }} />
            {mark !== null ? (
              <u className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-muted-foreground/60" style={{ left: `${mark}%` }} />
            ) : null}
          </div>
          <p className="text-[13px] text-muted-foreground">
            {size.stock.alertAt !== null ? `Alert at ${size.stock.alertAt} or fewer` : "No low-stock alert"}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Not counted, so it never runs out. Enter a count to start keeping one, with its history.
        </p>
      )}
      {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** A size's mark: its net quantity over its unit ("750" / "mL"), or its name when it has none. */
export function SizeMark({ size, large = false }: { size: Pick<SizeView, "label" | "quantity">; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-content-center rounded-md border bg-background text-center leading-none",
        large ? "size-15" : "size-11",
      )}
    >
      <b className={cn("font-semibold tracking-[-0.02em] tabular-nums", large ? "text-xl" : "text-[15px]")}>
        {size.quantity ? size.quantity.amount : size.label.slice(0, 4)}
      </b>
      {size.quantity ? (
        <i className={cn("mt-0.5 not-italic text-muted-foreground", large ? "text-xs" : "text-[10.5px]")}>{size.quantity.unit}</i>
      ) : null}
    </span>
  );
}

export function CodeChip({ code }: { code: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className="mt-1.5 font-mono"
      onClick={() => {
        void navigator.clipboard?.writeText(code).then(
          () => toast(`Copied ${code}`),
          () => undefined,
        );
      }}
      aria-label={`Copy Effy code ${code}`}
    >
      {code}
      <Copy aria-hidden="true" />
    </Button>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-4 text-[13px] font-semibold">{title}</h4>
      {children}
    </section>
  );
}

function PriceBox({ label, muted, result, children }: { label: string; muted?: boolean; result?: boolean; children: ReactNode }) {
  return (
    <div className={cn("min-w-40 rounded-md border px-[18px] py-4", result && "border-transparent bg-muted")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1.5 flex flex-wrap items-baseline gap-2 text-xl font-semibold tracking-[-0.01em] tabular-nums", muted && "text-muted-foreground")}>
        {children}
      </div>
    </div>
  );
}

function Operator({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="grid place-items-center text-lg text-muted-foreground">
      {children}
    </span>
  );
}

function Fact({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("m-0 mt-1 tabular-nums", mono && "font-mono text-[13px]")}>{children}</dd>
    </div>
  );
}
