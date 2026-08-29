import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { OperatorStockReason, ProductStockDTO } from "@effy/shared-types";
import { OPERATOR_STOCK_REASONS } from "@effy/shared-types";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { stockErrorText } from "./stockErrorText";
import {
  productStockQuery,
  useAdjustStock,
  useSetStockCount,
  useSetStockThreshold,
  useSetStockTracking,
} from "./stockQueries";
import { StockHistory } from "./StockHistory";

/**
 * The Inventory tab (054 US1). Replaces the "Inventory — coming soon" placeholder this tab has
 * carried since 016.
 *
 * ⚠ DETAIL ROWS AND A TABLE, NEVER CARDS (Principle V / DOCTRINE-2), matching the Overview tab
 * exactly — this is one more section of a product, not a dashboard.
 *
 * ⚠ AND NO COLOUR. "Out of stock" and "Low" are carried by WEIGHT AND WORDS, not a hue. 041
 * specifically removed an amber "warning" colour from shop-web's fulfilment and catalog screens;
 * reintroducing one here would undo that, and the platform has exactly two semantic colours neither
 * of which means "running low".
 */
export function StockPanel({ productId }: { productId: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(productStockQuery(productId));

  if (isError) {
    return (
      <ErrorState
        error={error}
        onRetry={() => void refetch()}
        forbiddenMessage="You don't have permission to see stock for this product."
      />
    );
  }
  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading stock…</p>;
  }

  return (
    <div className="space-y-8">
      <TrackingSection productId={productId} stock={data.stock} />
      {data.stock.tracked ? (
        <>
          <CountSection productId={productId} stock={data.stock} />
          <ThresholdSection productId={productId} stock={data.stock} />
        </>
      ) : null}
      <StockHistory movements={data.movements} />
    </div>
  );
}

/** The one-line answer to "what does this screen say about this product right now". */
function stockSummary(stock: ProductStockDTO): string {
  if (!stock.tracked) return "Not tracked — this product can be bought without limit.";
  if (stock.outOfStock) return "Out of stock — shoppers cannot buy this right now.";
  if (stock.low) return `Running low — ${stock.onHand} left.`;
  return `${stock.onHand} in stock.`;
}

function TrackingSection({ productId, stock }: { productId: string; stock: ProductStockDTO }) {
  const setTracking = useSetStockTracking(productId);
  const [openingCount, setOpeningCount] = useState("");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <h3 className="text-sm font-semibold">Stock tracking</h3>
        <Switch
          checked={stock.tracked}
          aria-label="Track stock for this product"
          disabled={setTracking.isPending || (!stock.tracked && openingCount.trim() === "")}
          onCheckedChange={(tracked) =>
            setTracking.mutate(
              tracked ? { tracked, onHand: Number(openingCount) } : { tracked },
              { onSuccess: () => setOpeningCount("") },
            )
          }
        />
      </div>

      <p className={stock.outOfStock ? "text-sm font-semibold" : "text-sm"}>{stockSummary(stock)}</p>

      {!stock.tracked ? (
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="opening-count">Opening count</Label>
            <Input
              id="opening-count"
              inputMode="numeric"
              className="w-32"
              value={openingCount}
              onChange={(e) => setOpeningCount(e.target.value)}
            />
          </div>
          {/* ⚠ The switch stays disabled until a number is entered. FR-003: turning tracking on
              without a count would make the product instantly unbuyable with no operator intent
              behind it — a state the shop would hear about from a customer, not from their own
              action. The server refuses it too; this just stops the round trip. */}
          <p className="pb-2 text-sm text-muted-foreground">
            Enter how many you have, then switch tracking on.
          </p>
        </div>
      ) : null}

      {setTracking.isError ? <Refusal error={setTracking.error} /> : null}
    </section>
  );
}

function CountSection({ productId, stock }: { productId: string; stock: ProductStockDTO }) {
  const setCount = useSetStockCount(productId);
  const adjust = useAdjustStock(productId);

  const [mode, setMode] = useState<"adjust" | "set">("adjust");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<OperatorStockReason>("received");

  const pending = setCount.isPending || adjust.isPending;
  const failure = setCount.error ?? adjust.error;

  function submit() {
    const n = Number(value);
    const done = { onSuccess: () => setValue("") };
    if (mode === "set") setCount.mutate({ onHand: n, reason }, done);
    else adjust.mutate({ delta: n, reason }, done);
  }

  return (
    <section className="space-y-3">
      <div className="border-b pb-2">
        <h3 className="text-sm font-semibold">Update the count</h3>
      </div>

      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">In stock</dt>
        <dd className={stock.outOfStock ? "font-semibold" : undefined}>{stock.onHand}</dd>
      </dl>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="stock-mode">Change</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as "adjust" | "set")}>
            <SelectTrigger id="stock-mode" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="adjust">Add or remove</SelectItem>
              <SelectItem value="set">Set exact count</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="stock-value">{mode === "set" ? "New count" : "Change by"}</Label>
          <Input
            id="stock-value"
            inputMode="numeric"
            className="w-32"
            placeholder={mode === "set" ? "0" : "e.g. 24 or -3"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="stock-reason">Reason</Label>
          <Select value={reason} onValueChange={(v) => setReason(v as OperatorStockReason)}>
            <SelectTrigger id="stock-reason" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATOR_STOCK_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {REASON_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={submit} disabled={pending || value.trim() === ""}>
          {pending ? "Saving…" : "Record"}
        </Button>
      </div>

      {failure ? <Refusal error={failure} /> : null}
    </section>
  );
}

function ThresholdSection({ productId, stock }: { productId: string; stock: ProductStockDTO }) {
  const setThreshold = useSetStockThreshold(productId);
  const [value, setValue] = useState(stock.threshold === null ? "" : String(stock.threshold));

  const usingShopDefault = stock.threshold === null;

  return (
    <section className="space-y-3">
      <div className="border-b pb-2">
        <h3 className="text-sm font-semibold">Low-stock threshold</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        {usingShopDefault
          ? stock.effectiveThreshold === null
            ? "No threshold set for this product or for the shop, so nothing is reported as running low. A product that reaches zero is still reported as out of stock."
            : `Using the shop default of ${stock.effectiveThreshold}.`
          : `This product has its own threshold of ${stock.threshold}, which overrides the shop default.`}
      </p>

      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="stock-threshold">Threshold</Label>
          <Input
            id="stock-threshold"
            inputMode="numeric"
            className="w-32"
            placeholder="Shop default"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={setThreshold.isPending}
          onClick={() =>
            setThreshold.mutate({ threshold: value.trim() === "" ? null : Number(value) })
          }
        >
          Save
        </Button>
        {!usingShopDefault ? (
          <Button
            variant="ghost"
            disabled={setThreshold.isPending}
            onClick={() => {
              setValue("");
              setThreshold.mutate({ threshold: null });
            }}
          >
            Use shop default
          </Button>
        ) : null}
      </div>

      {setThreshold.isError ? <Refusal error={setThreshold.error} /> : null}
    </section>
  );
}

const REASON_LABELS: Record<OperatorStockReason, string> = {
  received: "Stock received",
  correction: "Correction",
  damage: "Damaged",
  expiry: "Expired",
};

/**
 * ⚠ The server's own words, never a generic sentence.
 *
 * 053 found that every console refusal collapsed to one useless line because the screen tested
 * `e instanceof Error` while the api client throws a PLAIN OBJECT — so the named refusal the server
 * had gone to the trouble of producing was thrown away at the last step. `stockErrorText` exists so
 * that cannot happen here.
 */
function Refusal({ error }: { error: unknown }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {stockErrorText(error)}
    </p>
  );
}
