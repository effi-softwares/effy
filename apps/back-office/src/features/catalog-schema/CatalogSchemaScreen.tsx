import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { cn } from "@effy/design-system";

import { PageHeader } from "@effy/web-kit/patterns";
import { sessionQuery } from "@/features/auth/queries";

import { canManageCatalog } from "./access";
import { AttributesTab } from "./components/AttributesTab";
import { CategoriesTab } from "./components/CategoriesTab";
import { ProductTypesTab } from "./components/ProductTypesTab";
import { attributesQuery, categoriesQuery, productTypesQuery } from "./queries";

type View = "types" | "attributes" | "categories";

// The catalog schema authority (016, US1; redesign, boards "Schema — …"). One page with three views
// — Product types, Attributes, Categories — each a table (no cards). Read access is open to every
// back-office role; the mutating controls inside each view are revealed only for admin/manager
// (backend authoritative).
export function CatalogSchemaScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageCatalog(roles);
  const [view, setView] = useState<View>("types");
  const types = useQuery(productTypesQuery());
  const attributes = useQuery(attributesQuery());
  const categories = useQuery(categoriesQuery());

  const views: readonly { key: View; label: string; count?: number }[] = [
    { key: "types", label: "Product types", count: types.data?.length },
    { key: "attributes", label: "Attributes", count: attributes.data?.length },
    { key: "categories", label: "Categories", count: categories.data?.length },
  ];

  return (
    <>
      <PageHeader title="Catalogue schema" description="The schema that drives every product: types, their attributes, and the category taxonomy." />
      <div className="space-y-4">
        <nav className="bo-tabs" aria-label="Schema views">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-current={v.key === view ? "page" : undefined}
              className={cn("bo-tabs__tab", v.key === view && "is-active")}
              onClick={() => setView(v.key)}
            >
              {v.label}
              {v.count !== undefined ? <span className="bo-tabs__count">{v.count}</span> : null}
            </button>
          ))}
        </nav>
        {view === "types" ? (
          <ProductTypesTab canManage={canManage} />
        ) : view === "attributes" ? (
          <AttributesTab canManage={canManage} />
        ) : (
          <CategoriesTab canManage={canManage} />
        )}
      </div>
    </>
  );
}
