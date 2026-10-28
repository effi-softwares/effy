import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Palette, Plus } from "lucide-react"

import { Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"
import { defaultSize, type AdminSkinListItemDTO } from "@effy/shared-types"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader, EmptyState, StatusWord } from "@effy/web-kit/patterns"
import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { canManagePromotions } from "@/features/promotions/access"

import { promotionSkinsQuery } from "./queries"
import { LAYOUT_WORD, SAMPLES, SkinPreviewItem } from "./SkinPreview"

export function SkinsListScreen() {
  const canManage = canManagePromotions(useSessionRoles())
  const { data, error, isPending, isError, refetch } = useQuery(promotionSkinsQuery())

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
        <Skeleton className="h-40" aria-busy="true" />
      ) : data.length === 0 ? (
        <EmptyState icon={Palette} title="No skins yet." description="Create one to give promotions their own look." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="min-w-0">
            <Table className="ef-rtable">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-56">Looks like</TableHead>
                  <TableHead>Skin</TableHead>
                  <TableHead>Layout</TableHead>
                  <TableHead className="text-right">Used in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s) => (
                  <SkinRow key={s.id} skin={s} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  )
}

function SkinRow({ skin }: { skin: AdminSkinListItemDTO }) {
  const sample = SAMPLES[0]!
  return (
    <TableRow>
      <TableCell data-m="media">
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
      </TableCell>
      <TableCell data-m="primary">
        <Link to="/promotions/skins/$skinId" params={{ skinId: skin.id }} className="link">
          {skin.name}
        </Link>
        {skin.builtIn ? (
          <div className="mt-1">
            <StatusWord tone="quiet">Built in</StatusWord>
          </div>
        ) : null}
      </TableCell>
      <TableCell data-m="meta">{LAYOUT_WORD[skin.layout]}</TableCell>
      <TableCell data-m="trail" className="text-right tabular-nums">
        {skin.usageCount === 0 ? (
          <span className="text-muted-foreground">Not used</span>
        ) : (
          `${skin.usageCount} ${skin.usageCount === 1 ? "place" : "places"}`
        )}
      </TableCell>
    </TableRow>
  )
}
