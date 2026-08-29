import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import type { LowStockRowDTO } from "@effy/shared-types";
import {
  Button,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { shopLowStockQuery, useSetShopStockSettings } from "./stockQueries";

/**
 * The assisted stock view (054 US4) on a shop's detail page.
 *
 * ⚠ WHAT THIS IS FOR: a shop rings support because they cannot get to a tablet, or because a count is
 * wrong and they need it fixed now. Until 054 there was no way to help them — nobody at Effy could
 * see a shop's stock, because no shop had any.
 *
 * ⚠ READ is open to any active staff INCLUDING csa (triage is CSA work); WRITING is admin/manager,
 * decided by the server from `admin.staff` and mirrored here only so the UI does not dangle a dead
 * control. The server is authoritative — this is a courtesy, exactly as `canManageShops` is used
 * elsewhere on this screen.
 *
 * ⚠ A TABLE, not cards (Principle V / DOCTRINE-2), and "Out of stock" / "Low" are carried by words,
 * never a hue: 041 removed the last non-monochrome warning colour from these consoles.
 */
export function ShopStockPanel({ shopId, canManage }: { shopId: string; canManage: boolean }) {
  const { data, error, isPending, isError, refetch } = useQuery(shopLowStockQuery(shopId));

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading stock…</p>;

  return (
    <div className="space-y-6">
      {canManage ? <ShopDefaultThreshold shopId={shopId} /> : null}
      <LowStockTable rows={data} />
    </div>
  );
}

function LowStockTable({ rows }: { rows: LowStockRowDTO[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing needs restocking. Products this shop does not track never appear here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>In stock</TableHead>
            <TableHead>Threshold</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.productId}>
              <TableCell>{row.name}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {row.sku ?? "—"}
              </TableCell>
              <TableCell className="tabular-nums">{row.onHand}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {row.effectiveThreshold ?? "—"}
              </TableCell>
              {/* ⚠ Words and weight, never colour — an empty shelf and a thin one are different
                  problems, and a state carried by a tint is invisible to a colour-blind operator
                  and to every assertion. */}
              <TableCell className={row.severity === "out" ? "font-semibold" : undefined}>
                {row.severity === "out" ? "Out of stock" : "Low"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ShopDefaultThreshold({ shopId }: { shopId: string }) {
  const setSettings = useSetShopStockSettings(shopId);
  const [value, setValue] = useState("");

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Shop default low-stock threshold</h3>
      <p className="text-sm text-muted-foreground">
        Applies to every tracked product that does not carry its own threshold. Leave blank to clear
        it — nothing is then reported as running low, though a product that reaches zero is still
        reported as out of stock.
      </p>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="shop-default-threshold">Threshold</Label>
          <Input
            id="shop-default-threshold"
            inputMode="numeric"
            className="w-32"
            placeholder="None"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={setSettings.isPending}
          onClick={() =>
            // ⚠ Blank clears to NULL, never zero. Zero would mean "warn me at zero", which would make
            // every product permanently low — a different instruction entirely.
            setSettings.mutate({ defaultThreshold: value.trim() === "" ? null : Number(value) })
          }
        >
          Save
        </Button>
      </div>
      {setSettings.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {stockRefusalText(setSettings.error)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * ⚠ The server's reason, in our words — never its raw `detail`.
 *
 * 053 found every console refusal on the order screen collapsing to one generic sentence, because it
 * tested `e instanceof Error` while the api client throws a PLAIN OBJECT. Keying off `status` and the
 * structured field names avoids both failure modes: no server prose is rendered, and the named
 * refusal is not discarded.
 */
function stockRefusalText(err: unknown): string {
  const e = err as { status?: number; kind?: string } | null;
  if (e?.status === 400 || e?.status === 422) {
    return "Enter a whole number, or leave it blank to clear the threshold.";
  }
  if (e?.kind === "forbidden") {
    return "You don't have permission to change this shop's stock settings.";
  }
  return "Something went wrong. Please try again.";
}
