import { Input, Label } from "@effy/design-system/ui";

import { previewCustomerPrice, priceRange, type MarginEntry } from "./model";

/**
 * Effy's margin, as a reviewer enters it: a percentage of the shop's price or
 * a fixed amount, with the price customers will pay shown before anything is confirmed.
 *
 * Controlled — the entry lives with the decision it belongs to.
 *
 * One margin prices every size (variant) of the product; the preview says the range customers
 * will pay, and the sizes table beside it shows each size's own figure.
 */
export function MarginField({
  id,
  shopPrices,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  /** Every size's shop price — the sizes the decision will put on sale. */
  shopPrices: readonly string[];
  value: MarginEntry;
  onChange: (next: MarginEntry) => void;
  disabled?: boolean;
}) {
  const shop = priceRange(shopPrices);
  const previews = shopPrices.map((p) => previewCustomerPrice(p, value.kind, value.value));
  const preview = previews.every((p): p is string => p !== null) ? priceRange(previews) : null;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Effy margin</Label>
      <div className="flex items-center gap-2">
        <div role="group" aria-label="Margin type" className="flex rounded-md border border-border">
          {(["percent", "amount"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={value.kind === kind}
              disabled={disabled}
              onClick={() => onChange({ ...value, kind })}
              className={
                "h-9 px-3 text-sm first:rounded-l-md last:rounded-r-md " +
                (value.kind === kind ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")
              }
            >
              {kind === "percent" ? "Percent" : "Amount"}
            </button>
          ))}
        </div>
        <Input
          id={id}
          inputMode="decimal"
          className="w-28"
          placeholder={value.kind === "percent" ? "e.g. 15" : "e.g. 2.00"}
          value={value.value}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
      </div>
      {/* The number that matters to the reviewer: what a customer will actually be charged. */}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {shopPrices.length > 1 ? `${shopPrices.length} sizes · shop price ${shop}` : `Shop price ${shop}`}
        {preview ? (
          <>
            {" "}
            → customers pay <span className="font-medium text-foreground tabular-nums">{preview}</span>
          </>
        ) : (
          " — enter a margin to see what customers will pay"
        )}
      </p>
    </div>
  );
}
