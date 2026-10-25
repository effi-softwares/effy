import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Palette, Plus } from "lucide-react";

import { Button, Skeleton } from "@effy/design-system/ui";
import { defaultSize, type AdminSkinListItemDTO } from "@effy/shared-types";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@effy/web-kit/patterns";
import { EmptyState } from "@effy/web-kit/patterns";
import { StatusWord } from "@effy/web-kit/patterns";
import { useSessionRoles } from "@/features/auth/useSessionRoles";
import { canManagePromotions } from "@/features/promotions/access";

import { promotionSkinsQuery } from "./queries";
import { LAYOUT_WORD, SAMPLES, SkinPreviewItem } from "./SkinPreview";

/**
 * Promotion skins: how promotions look. A skin is chosen per place in a display group; each
 * group has a default. Classic is built in — each place as it always looked.
 */
export function SkinsListScreen() {
  const canManage = canManagePromotions(useSessionRoles());
  const { data, error, isPending, isError, refetch } = useQuery(promotionSkinsQuery());

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
        <div className="bo-table-wrap">
          <div className="bo-table-scroll">
            <table className="bo-table bo-rtable">
              <thead>
                <tr>
                  <th className="w-56">Looks like</th>
                  <th>Skin</th>
                  <th>Layout</th>
                  <th className="text-right">Used in</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <SkinRow key={s.id} skin={s} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function SkinRow({ skin }: { skin: AdminSkinListItemDTO }) {
  const sample = SAMPLES[0]!;
  return (
    <tr>
      <td data-m="media">
        {/* A thumbnail: the real skin at 520px, drawn at 40%. */}
        <div className="pointer-events-none relative h-28 w-52 overflow-hidden rounded-md" aria-hidden="true" inert>
          <div style={{ width: 520, transform: "scale(0.4)", transformOrigin: "top left" }}>
          <SkinPreviewItem
            promotion={sample}
            skin={skin.builtIn || !skin.settings ? undefined : { id: skin.id, version: skin.version, layout: skin.layout, size: defaultSize(skin.layout as never), settings: skin.settings }}
          />
          </div>
        </div>
      </td>
      <td data-m="primary">
        <Link to="/promotions/skins/$skinId" params={{ skinId: skin.id }} className="bo-link">
          {skin.name}
        </Link>
        {skin.builtIn ? (
          <div className="mt-1">
            <StatusWord tone="quiet">Built in</StatusWord>
          </div>
        ) : null}
      </td>
      <td data-m="meta">{LAYOUT_WORD[skin.layout]}</td>
      <td data-m="trail" className="text-right tabular-nums">
        {skin.usageCount === 0 ? <span className="text-muted-foreground">Not used</span> : `${skin.usageCount} ${skin.usageCount === 1 ? "place" : "places"}`}
      </td>
    </tr>
  );
}
