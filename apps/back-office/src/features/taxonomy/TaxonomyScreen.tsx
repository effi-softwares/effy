import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"

import { Tabs, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { PageHeader } from "@effy/web-kit/patterns"
import { sessionQuery } from "@/features/auth/queries"

import { canManageTaxonomy } from "./access"
import { AttributeLibrary } from "./AttributeLibrary"
import { AddCategoryDialog, MoveCategoryDialog } from "./CategoryDialogs"
import { CategoryPanel } from "./CategoryPanel"
import { CategoryTree } from "./CategoryTree"
import { taxonomyErrorText } from "./errorText"
import { index, type Category } from "./model"
import { attributesQuery, treeQuery, useMoveCategory } from "./queries"

/** Categories (tree left, the selected category right; stacked below 1024px) and the attribute library. */
export function TaxonomyScreen({ tab, categoryId }: { tab: "categories" | "attributes"; categoryId: string | null }) {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const canManage = canManageTaxonomy(roles)
  const tree = useQuery(treeQuery())
  const attributes = useQuery(attributesQuery())
  const navigate = useNavigate()

  const views = [
    { key: "categories" as const, label: "Categories", count: tree.data?.filter((c) => c.status === "active").length },
    {
      key: "attributes" as const,
      label: "Attributes",
      count: attributes.data?.filter((a) => a.status === "active").length,
    },
  ]

  return (
    <>
      <PageHeader
        title="Categories & attributes"
        description="The category tree shops file products in and customers browse, and the details each category asks for."
      />
      <div className="space-y-4">
        <Tabs value={tab} activationMode="manual">
          <TabsList aria-label="Taxonomy views">
            {views.map((v) => (
              <TabsTrigger key={v.key} value={v.key} asChild>
                <Link
                  to="/taxonomy"
                  search={v.key === "attributes" ? { tab: "attributes" } : { category: categoryId ?? undefined }}
                  aria-current={v.key === tab ? "page" : undefined}
                >
                  {v.label}
                  {v.count !== undefined ? <TabsCount>{v.count}</TabsCount> : null}
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {tab === "attributes" ? (
          <AttributeLibrary canManage={canManage} />
        ) : tree.isError ? (
          <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />
        ) : tree.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <Categories
            categories={tree.data}
            selectedId={categoryId}
            canManage={canManage}
            onSelect={(id) => void navigate({ to: "/taxonomy", search: { category: id }, replace: true })}
          />
        )}
      </div>
    </>
  )
}

function Categories({
  categories,
  selectedId,
  canManage,
  onSelect,
}: {
  categories: Category[]
  selectedId: string | null
  canManage: boolean
  onSelect: (id: string) => void
}) {
  const byId = useMemo(() => index(categories), [categories])
  const selected = selectedId ? byId.get(selectedId) : undefined
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const move = useMoveCategory()

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(320px,2fr)_3fr]">
      <div className="ef-panel">
        <div className="ef-panel__body">
          <CategoryTree
            categories={categories}
            selectedId={selectedId}
            canManage={canManage}
            onSelect={onSelect}
            onAdd={(parentId) => setAdding({ parentId })}
            onMoveTo={setMoving}
            onMove={(id, parentId, position) => {
              setError(null)
              move.mutate({ id, body: { parentId, position } }, { onError: (err) => setError(taxonomyErrorText(err)) })
            }}
          />
          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      {selected ? (
        <CategoryPanel category={selected} categories={categories} canManage={canManage} />
      ) : (
        <div className="ef-panel">
          <div className="ef-panel__body text-sm text-muted-foreground">
            Choose a category to see its details, defaults and attributes.
          </div>
        </div>
      )}
      {adding ? (
        <AddCategoryDialog
          parentId={adding.parentId}
          categories={categories}
          onClose={() => setAdding(null)}
          onCreated={onSelect}
        />
      ) : null}
      {moving ? <MoveCategoryDialog id={moving} categories={categories} onClose={() => setMoving(null)} /> : null}
    </div>
  )
}
