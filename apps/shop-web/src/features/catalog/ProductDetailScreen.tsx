import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Pencil } from "lucide-react";

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { ProductStatusBadge } from "./components/ProductStatusBadge";
import { formatAttributeValue, formatMoney } from "./detailFormat";
import { LifecycleControls } from "./LifecycleControls";
import { MediaGallery } from "./MediaGallery";
import type { ProductDetail } from "./model";
import {
  AttributesEditDialog,
  BasicsEditDialog,
  CategorizationEditDialog,
  PricingEditDialog,
} from "./ProductEditDialogs";
import { productDetailQuery } from "./queries";
import { SectionAssignment } from "./SectionAssignment";

type EditTarget = "basics" | "pricing" | "categorization" | "attributes" | null;

/**
 * The product detail page (US4/US5). A sectioned/tabbed layout — Overview · Attributes · Media ·
 * Pricing · Categorization · Inventory — of `<dl>` detail rows, NEVER cards (DOCTRINE-2). Each editable
 * section has a pencil that opens a small focused-edit dialog scoped to that group. A non-blocking
 * banner surfaces `missingMandatoryAttributes` (FR-020a) without ever hiding the product. Lifecycle
 * controls (status menu + archive/delete) sit in the header.
 */
export function ProductDetailScreen({ productId }: { productId: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(productDetailQuery(productId));
  const [editing, setEditing] = useState<EditTarget>(null);

  if (isError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (isPending) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const detail: ProductDetail = data;

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{detail.name}</h1>
            <ProductStatusBadge status={detail.status} />
          </div>
          {detail.brand ? <p className="text-muted-foreground">{detail.brand}</p> : null}
        </div>
        <LifecycleControls detail={detail} onDeleted={() => void refetch()} />
      </div>

      {detail.missingMandatoryAttributes.length > 0 ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium">Missing required details</p>
            <p className="text-muted-foreground">
              This product's type now requires attributes it doesn't have:{" "}
              {detail.missingMandatoryAttributes.join(", ")}. It stays visible — add them from the
              Attributes tab to keep it complete.
            </p>
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attributes">Attributes</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="categorization">Categorization</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <Section title="Basics" onEdit={() => setEditing("basics")}>
            <DetailList
              rows={[
                ["Name", detail.name],
                ["Brand", detail.brand ?? "—"],
                ["SKU", detail.sku ?? "—"],
                ["GTIN", detail.gtin ?? "—"],
                ["Type", detail.typeName],
                ["Category", detail.categoryName],
                ["Short description", detail.shortDescription],
                ["Long description", detail.longDescription ?? "—"],
              ]}
            />
          </Section>
        </TabsContent>

        <TabsContent value="attributes" className="pt-4">
          <Section title="Attributes" onEdit={() => setEditing("attributes")}>
            {detail.attributes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This product's type has no extra attributes.
              </p>
            ) : (
              <DetailList
                rows={detail.attributes.map((a) => [
                  a.unit ? `${a.name} (${a.unit})` : a.name,
                  formatAttributeValue(a),
                ])}
              />
            )}
          </Section>
        </TabsContent>

        <TabsContent value="media" className="pt-4">
          <MediaGallery detail={detail} />
        </TabsContent>

        <TabsContent value="pricing" className="pt-4">
          <Section title="Pricing" onEdit={() => setEditing("pricing")}>
            <DetailList
              rows={[
                ["Price", formatMoney(detail.priceAmount, detail.currency)],
                ["Compare-at", formatMoney(detail.compareAtAmount, detail.currency)],
              ]}
            />
          </Section>
        </TabsContent>

        <TabsContent value="categorization" className="space-y-6 pt-4">
          <Section title="Classification" onEdit={() => setEditing("categorization")}>
            <DetailList
              rows={[
                ["Type", detail.typeName],
                ["Category", detail.categoryName],
              ]}
            />
          </Section>
          <Section title="Sections">
            <SectionAssignment detail={detail} />
          </Section>
        </TabsContent>

        <TabsContent value="inventory" className="pt-4">
          <div className="rounded-md border border-dashed px-4 py-8 text-center">
            <p className="font-medium">Inventory — coming soon</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Stock tracking for this product will live here in a later release.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Focused-edit dialogs (one open at a time) */}
      <BasicsEditDialog
        detail={detail}
        open={editing === "basics"}
        onOpenChange={(o) => setEditing(o ? "basics" : null)}
      />
      <PricingEditDialog
        detail={detail}
        open={editing === "pricing"}
        onOpenChange={(o) => setEditing(o ? "pricing" : null)}
      />
      <CategorizationEditDialog
        detail={detail}
        open={editing === "categorization"}
        onOpenChange={(o) => setEditing(o ? "categorization" : null)}
      />
      <AttributesEditDialog
        detail={detail}
        open={editing === "attributes"}
        onOpenChange={(o) => setEditing(o ? "attributes" : null)}
      />
    </div>
  );
}

// ── Layout helpers (no cards — sectioned dl rows) ─────────────────────────────────────────────────

function BackLink() {
  return (
    <Link to="/catalog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      Back to catalog
    </Link>
  );
}

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {onEdit ? (
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
            <Pencil />
            Edit
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function DetailList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
