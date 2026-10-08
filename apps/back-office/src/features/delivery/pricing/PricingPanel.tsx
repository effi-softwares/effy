import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";

import type { FeePlanKind, FeePlanDTO } from "@effy/shared-types";
import { Badge, Button, Tabs, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { plansQuery } from "../queries";
import { ActivateDialog } from "./ActivateDialog";
import { FeeSimulator } from "./FeeSimulator";
import { PlanEditor } from "./PlanEditor";

/**
 * Delivery pricing (077): the fee plans for "Delivered by Effy" and the courier fee table.
 *
 * ⚠ A TABLE, not cards (Principle V). The state is a pill — active → brand, draft and retired →
 * muted — and the number of things a draft is missing is a column on its own row.
 *
 * ⚠ AN ACTIVE PLAN IS A RECORD. It opens read-only; changing prices means copying it to a draft and
 * activating that, so what was charged on any day can always be read back.
 */
export function PricingPanel({ canManage }: { canManage: boolean }) {
  const [kind, setKind] = useState<FeePlanKind>("effy");
  const plans = useQuery(plansQuery(kind));
  const [editing, setEditing] = useState<{ plan: FeePlanDTO | null; copy: boolean } | null>(null);
  const [activating, setActivating] = useState<FeePlanDTO | null>(null);

  const active = plans.data?.find((p) => p.state === "active") ?? null;

  const columns: ColumnDef<FeePlanDTO>[] = [
    { accessorKey: "name", header: "Plan", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    {
      accessorKey: "state",
      header: "State",
      cell: ({ row }) =>
        row.original.state === "active" ? <Badge>Active</Badge>
        : row.original.state === "draft" ? <Badge variant="secondary">Draft</Badge>
        : <Badge variant="outline">Retired</Badge>,
    },
    {
      id: "gaps",
      header: "Ready",
      cell: ({ row }) => {
        if (row.original.state !== "draft") return null;
        const n = row.original.gaps.filter((g) => g.blocking).length;
        return n === 0 ? <span className="text-muted-foreground">Ready to activate</span> : <span className="text-warning">{n} to fix</span>;
      },
    },
    {
      id: "activated",
      header: "Activated",
      cell: ({ row }) =>
        row.original.activatedAt ? (
          <span className="text-muted-foreground">
            {new Date(row.original.activatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        ) : null,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing({ plan: p, copy: false })}>
              {p.state === "draft" && canManage ? "Edit" : "Open"}
            </Button>
            {canManage ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing({ plan: p, copy: true })}>Copy to new draft</Button>
            ) : null}
            {canManage && p.state === "draft" ? (
              <Button variant="outline" size="sm" onClick={() => setActivating(p)}>Activate</Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={kind} onValueChange={(v) => setKind(v as FeePlanKind)}>
            <TabsList>
              <TabsTrigger value="effy">Delivered by Effy</TabsTrigger>
              <TabsTrigger value="courier">Courier</TabsTrigger>
            </TabsList>
          </Tabs>
          {canManage ? (
            <Button onClick={() => setEditing({ plan: null, copy: false })}>
              <Plus /> New {kind === "courier" ? "courier table" : "plan"}
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {kind === "effy"
            ? "One delivery fee per order, from the distance band, the weight band, the basket's value and the chosen window. Exactly one plan is in force; a plan goes live only when it can price every distance and every weight. Orders already placed keep the fee they were sold."
            : "A flat amount per order plus the weight band. Nothing is charged from it until customers can place courier orders, but courier delivery cannot be switched on without one in force."}
        </p>
        {plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : plans.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {kind === "courier" && !active ? <p className="text-sm">No courier table is active.</p> : null}
            <DataTable columns={columns} data={plans.data} emptyMessage={kind === "courier" ? "No courier tables yet." : "No fee plans yet."} />
          </>
        )}
      </section>

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-base font-semibold">Try a plan</h2>
        <FeeSimulator plans={plans.data ?? []} kind={kind} />
      </section>

      {editing ? (
        <PlanEditor
          kind={kind}
          source={editing.plan}
          copy={editing.copy}
          canManage={canManage}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {activating ? <ActivateDialog plan={activating} retiring={active} onClose={() => setActivating(null)} /> : null}
    </div>
  );
}
