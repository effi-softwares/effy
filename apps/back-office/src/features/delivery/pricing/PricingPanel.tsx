import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { StaticTable, type EffyColumnDef as ColumnDef } from "@effy/web-kit/data-table"
import { Plus } from "lucide-react"

import { CAPPED_SET_LIMIT, listFullSentence, type FeePlanKind, type FeePlanDTO } from "@effy/shared-types"
import { Badge, Button, Tabs, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { plansQuery } from "../queries"
import { ActivateDialog } from "./ActivateDialog"
import { FeeSimulator } from "./FeeSimulator"
import { PlanEditor } from "./PlanEditor"

export function PricingPanel({ canManage }: { canManage: boolean }) {
  const [kind, setKind] = useState<FeePlanKind>("effy")
  const plans = useQuery(plansQuery(kind))
  const [editing, setEditing] = useState<{ plan: FeePlanDTO | null; copy: boolean } | null>(null)
  const [activating, setActivating] = useState<FeePlanDTO | null>(null)

  const active = plans.data?.find((p) => p.state === "active") ?? null

  const columns: ColumnDef<FeePlanDTO>[] = [
    {
      id: "name",
      accessorFn: (p) => p.name.toLowerCase(),
      header: "Plan",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      meta: { label: "Plan", identifying: true, phone: "primary" },
    },
    {
      id: "state",
      accessorFn: (p) => (p.state === "active" ? 0 : p.state === "draft" ? 1 : 2),
      header: "State",
      cell: ({ row }) =>
        row.original.state === "active" ? (
          <Badge>Active</Badge>
        ) : row.original.state === "draft" ? (
          <Badge variant="secondary">Draft</Badge>
        ) : (
          <Badge variant="outline">Retired</Badge>
        ),
      meta: { label: "State", phone: "badge" },
    },
    {
      id: "gaps",
      header: "Ready",
      cell: ({ row }) => {
        if (row.original.state !== "draft") return null
        const n = row.original.gaps.filter((g) => g.blocking).length
        return n === 0 ? (
          <span className="text-muted-foreground">Ready to activate</span>
        ) : (
          <span className="text-warning">{n} to fix</span>
        )
      },
      meta: { label: "Ready" },
    },
    {
      id: "activated",
      accessorFn: (p) => p.activatedAt ?? "",
      sortDescFirst: true,
      header: "Activated",
      cell: ({ row }) =>
        row.original.activatedAt ? (
          <span className="text-muted-foreground">
            {new Date(row.original.activatedAt).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        ) : null,
      meta: { label: "Activated", priority: 2, phone: "trail" },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const p = row.original
        return (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing({ plan: p, copy: false })}>
              {p.state === "draft" && canManage ? "Edit" : "Open"}
            </Button>
            {canManage ? (
              <Button variant="ghost" size="sm" onClick={() => setEditing({ plan: p, copy: true })}>
                Copy to new draft
              </Button>
            ) : null}
            {canManage && p.state === "draft" ? (
              <Button variant="outline" size="sm" onClick={() => setActivating(p)}>
                Activate
              </Button>
            ) : null}
          </div>
        )
      },
      meta: { label: "Actions", phone: "full" },
    },
  ]

  return (
    <div className="flex flex-col gap-6">
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
            {/* Every plan of the kind (capped at 500, 103 FR-024): sorted in the browser, newest active first. */}
            <StaticTable
              label={kind === "courier" ? "Courier tables" : "Fee plans"}
              columns={columns}
              rows={plans.data}
              getRowId={(p) => p.id}
              initialSort={{ id: "state" }}
              empty={kind === "courier" ? "No courier tables yet." : "No fee plans yet."}
            />
            {plans.data.length >= CAPPED_SET_LIMIT ? (
              <p className="text-sm text-muted-foreground">{listFullSentence(CAPPED_SET_LIMIT)}</p>
            ) : null}
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
  )
}
