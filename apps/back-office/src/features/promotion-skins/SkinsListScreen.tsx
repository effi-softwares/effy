import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Palette, Plus } from "lucide-react"

import { Button } from "@effy/design-system/ui"
import { CAPPED_SET_LIMIT, defaultSize, listFullSentence, type AdminSkinListItemDTO } from "@effy/shared-types"
import { ErrorState } from "@effy/web-kit/console"
import { SearchBox, StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"

import {
  Bone,
  EmptyState,
  Loading,
  PageHeader,
  StatusWord,
} from "@effy/web-kit/patterns"
import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { canManagePromotions } from "@/features/promotions/access"

import { promotionSkinsQuery } from "./queries"
import { LAYOUT_WORD, SAMPLES, SkinPreviewItem } from "./SkinPreview"

export function SkinsListScreen() {
  const canManage = canManagePromotions(useSessionRoles())
  const { data, error, isPending, isError, refetch } = useQuery(promotionSkinsQuery())
  const [q, setQ] = useState("")
  // The whole set is here (capped at 500, 103 FR-024): searched and sorted in the browser.
  const rows = useMemo(() => {
    const w = q.trim().toLowerCase()
    return (data ?? []).filter((s) => !w || s.name.toLowerCase().includes(w))
  }, [data, q])

  return (
    <>
      <PageHeader
        back={{ label: "Promotions", link: { to: "/promotions" } }}
        title="Skins"
        description="Reusable designs that control how promotions look wherever they are shown to customers."
        actions={
          canManage ? (
            <Button asChild>
              <Link to="/promotions/skins/new">
                <Plus aria-hidden="true" />
                New skin
              </Link>
            </Button>
          ) : undefined
        }
      />
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Loading>
          <div className="flex flex-wrap items-center gap-2">
            <Bone kind="control" className="w-72 max-w-full" />
          </div>
          <StaticTable label="Skins" columns={SKIN_COLUMNS} rows={[]} getRowId={(s) => s.id} loading />
        </Loading>
      ) : data.length === 0 ? (
        <EmptyState icon={Palette} title="No skins yet." description="Create one to give promotions their own look." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox label="Search skins" placeholder="Skin name…" value={q} onChange={setQ} />
          </div>
          <StaticTable label="Skins" columns={SKIN_COLUMNS} rows={rows} getRowId={(s) => s.id} empty="No skin matches." />
          {data.length >= CAPPED_SET_LIMIT ? (
            <p className="text-sm text-muted-foreground">{listFullSentence(CAPPED_SET_LIMIT)}</p>
          ) : null}
        </>
      )}
    </>
  )
}

function SkinSample({ skin }: { skin: AdminSkinListItemDTO }) {
  const sample = SAMPLES[0]!
  return (
    <div className="pointer-events-none relative h-28 w-52 overflow-hidden rounded-md" aria-hidden="true" inert>
      <div style={{ width: 520, transform: "scale(0.4)", transformOrigin: "top left" }}>
        <SkinPreviewItem
          promotion={sample}
          skin={
            skin.builtIn || !skin.settings
              ? undefined
              : {
                  id: skin.id,
                  version: skin.version,
                  layout: skin.layout,
                  size: defaultSize(skin.layout as never),
                  settings: skin.settings,
                }
          }
        />
      </div>
    </div>
  )
}

const SKIN_COLUMNS: EffyColumnDef<AdminSkinListItemDTO>[] = [
  {
    id: "looks",
    header: "Looks like",
    enableSorting: false,
    cell: ({ row }) => <SkinSample skin={row.original} />,
    meta: { label: "Looks like", phone: "full", className: "w-56" },
  },
  {
    id: "skin",
    accessorFn: (s) => s.name.toLowerCase(),
    header: "Skin",
    cell: ({ row }) => (
      <>
        <Link to="/promotions/skins/$skinId" params={{ skinId: row.original.id }} className="link">
          {row.original.name}
        </Link>
        {row.original.builtIn ? (
          <div className="mt-1">
            <StatusWord tone="quiet">Built in</StatusWord>
          </div>
        ) : null}
      </>
    ),
    meta: { label: "Skin", identifying: true, phone: "primary" },
  },
  {
    id: "layout",
    accessorFn: (s) => LAYOUT_WORD[s.layout],
    header: "Layout",
    cell: ({ row }) => LAYOUT_WORD[row.original.layout],
    meta: { label: "Layout" },
  },
  {
    id: "usedIn",
    accessorFn: (s) => s.usageCount,
    sortDescFirst: true,
    header: "Used in",
    cell: ({ row }) =>
      row.original.usageCount === 0 ? (
        <span className="text-muted-foreground">Not used</span>
      ) : (
        `${row.original.usageCount} ${row.original.usageCount === 1 ? "place" : "places"}`
      ),
    meta: { label: "Used in", align: "numeric", phone: "trail" },
  },
]
