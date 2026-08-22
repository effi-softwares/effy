import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@effy/design-system/ui";

import { shopListQuery } from "@/features/shops/queries";

import { deliveryMutationError } from "../errorText";
import { exceptionsQuery, useDeleteException, usePutException } from "../queries";

// Per-(shop, zone) same-day exceptions (047 US3). Back-office only (FR-045). The zone default applies to
// every shop unless an exception forces it on or off here. Shops are chosen by name from the register.
export function SameDayExceptionsDialog({
  zoneId, zoneName, zoneEligible, open, onOpenChange,
}: {
  zoneId: string;
  zoneName: string;
  zoneEligible: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const exceptions = useQuery(exceptionsQuery(zoneId));
  const shops = useQuery(shopListQuery({ page: 1, pageSize: 200 }));
  const put = usePutException();
  const del = useDeleteException();
  const [error, setError] = useState<string | null>(null);

  const shopName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of shops.data?.items ?? []) m.set(s.id, `${s.name} (${s.code})`);
    return (id: string) => m.get(id) ?? id;
  }, [shops.data]);

  async function set(shopId: string, mode: "on" | "off") {
    setError(null);
    try {
      await put.mutateAsync({ zoneId, shopId, mode });
    } catch (err) {
      setError(deliveryMutationError(err));
    }
  }

  async function clear(shopId: string) {
    setError(null);
    try {
      await del.mutateAsync({ zoneId, shopId });
    } catch (err) {
      setError(deliveryMutationError(err));
    }
  }

  const existing = exceptions.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Same-day exceptions — {zoneName}</DialogTitle>
          <DialogDescription>
            By default this zone is {zoneEligible ? "same-day eligible for every shop" : "not same-day eligible"}.
            Override a specific shop below; everything else follows the zone default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {existing.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {existing.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{shopName(e.shopId)}</span>
                  <span className={e.mode === "on" ? "font-medium" : "font-medium text-muted-foreground"}>
                    forced {e.mode}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void clear(e.shopId)}>Reset</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No exceptions — every shop follows the zone default.</p>
          )}

          <AddException
            shops={(shops.data?.items ?? []).map((s) => ({ id: s.id, label: `${s.name} (${s.code})` }))}
            onAdd={set}
            busy={put.isPending}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddException({
  shops, onAdd, busy,
}: {
  shops: { id: string; label: string }[];
  onAdd: (shopId: string, mode: "on" | "off") => void;
  busy: boolean;
}) {
  const [shopId, setShopId] = useState("");
  const [mode, setMode] = useState<"on" | "off">("off");
  return (
    <div className="flex items-end gap-2 border-t pt-4">
      <div className="flex-1">
        <Select value={shopId} onValueChange={setShopId}>
          <SelectTrigger><SelectValue placeholder="Choose a shop" /></SelectTrigger>
          <SelectContent>
            {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Select value={mode} onValueChange={(v) => setMode(v as "on" | "off")}>
        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="off">Force off</SelectItem>
          <SelectItem value="on">Force on</SelectItem>
        </SelectContent>
      </Select>
      <Button disabled={!shopId || busy} onClick={() => onAdd(shopId, mode)}>Set</Button>
    </div>
  );
}
