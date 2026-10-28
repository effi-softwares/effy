import { useEffect, useMemo, useState } from "react"

import { Link } from "@tanstack/react-router"
import { ImagePlus, Trash2, X } from "lucide-react"

import { cn } from "@effy/design-system"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import {
  CATEGORY_ICONS,
  CATEGORY_NAME_MAX,
  GST_STATUS_WORDS,
  STORAGE_WORDS,
  STORAGES,
  SYNONYMS_MAX,
  type FactDefaults,
  type GstStatus,
  type Storage,
} from "@effy/shared-types"
import { CategoryGlyph } from "@effy/web-kit/category-icon"

import { AttachmentEditor } from "./AttachmentEditor"
import { refusalCode, taxonomyErrorText } from "./errorText"
import { FormPreview } from "./FormPreview"
import { index, isLeaf, pathOf, pathText, type Category } from "./model"
import { useSetCategoryStatus, useUpdateCategory, useUploadCategoryImage } from "./queries"

type Tab = "general" | "defaults" | "attributes" | "products"

export function CategoryPanel({
  category,
  categories,
  canManage,
}: {
  category: Category
  categories: Category[]
  canManage: boolean
}) {
  const [tab, setTab] = useState<Tab>("general")
  const byId = useMemo(() => index(categories), [categories])
  const leaf = isLeaf(category.id, categories)
  const retired = category.status === "retired"
  const editable = canManage && !retired

  const tabs: { key: Tab; label: string }[] = [
    { key: "general", label: "General" },
    { key: "defaults", label: "Defaults" },
    { key: "attributes", label: leaf ? "Attributes & form" : "Attributes" },
    { key: "products", label: "Products" },
  ]

  return (
    <section className="ef-panel" aria-label={category.name}>
      <header className="ef-panel__head flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {pathText(pathOf(category.id, byId).slice(0, -1)) || "Department"}
          </p>
          <h2 className="ef-panel__title flex items-center gap-2">
            <CategoryGlyph icon={category.icon} className="size-5 text-muted-foreground" />
            {category.name}
            {retired ? <span className="ef-st ef-st--muted">Retired</span> : null}
          </h2>
          <p className="ef-panel__desc">
            {leaf ? "Products are filed here." : "Products are filed in its sub-categories."} {category.productCount}{" "}
            product
            {category.productCount === 1 ? "" : "s"}
            {category.placementCount > 0
              ? `, ${category.placementCount} extra placement${category.placementCount === 1 ? "" : "s"}`
              : ""}
            .
          </p>
        </div>
        {canManage ? <StatusControl category={category} categories={categories} /> : null}
      </header>
      <div className="ef-panel__body space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList aria-label="Category views">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {tab === "general" ? (
          <GeneralTab key={category.id} category={category} editable={editable} />
        ) : tab === "defaults" ? (
          <DefaultsTab
            key={category.id}
            category={category}
            parent={category.parentId ? byId.get(category.parentId) : undefined}
            editable={editable}
          />
        ) : tab === "attributes" ? (
          <div className="space-y-6">
            <AttachmentEditor categoryId={category.id} parentId={category.parentId} editable={editable} />
            {leaf && !retired ? <FormPreview categoryId={category.id} /> : null}
          </div>
        ) : (
          <ProductsTab category={category} />
        )}
      </div>
    </section>
  )
}

function SaveError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null
}

function GeneralTab({ category, editable }: { category: Category; editable: boolean }) {
  const update = useUpdateCategory()
  const upload = useUploadCategoryImage()
  const [name, setName] = useState(category.name)
  const [synonym, setSynonym] = useState("")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setName(category.name), [category.name])

  async function save(body: Parameters<typeof update.mutateAsync>[0]["body"]) {
    setError(null)
    try {
      await update.mutateAsync({ id: category.id, body })
    } catch (err) {
      setError(taxonomyErrorText(err))
    }
  }

  function addSynonym() {
    const w = synonym.trim().toLowerCase()
    setSynonym("")
    if (w && !category.synonyms.includes(w)) void save({ synonyms: [...category.synonyms, w] })
  }

  return (
    <div className="space-y-6">
      <form
        className="flex max-w-md items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && name.trim() !== category.name) void save({ name: name.trim() })
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="category-name">Name</Label>
          <Input
            id="category-name"
            maxLength={CATEGORY_NAME_MAX}
            value={name}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {editable ? (
          <Button
            type="submit"
            variant="outline"
            disabled={update.isPending || name.trim() === "" || name.trim() === category.name}
          >
            Rename
          </Button>
        ) : null}
      </form>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Icon</legend>
        <p className="text-xs text-muted-foreground">Shown beside the name on the storefront.</p>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Icon">
          {CATEGORY_ICONS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={category.icon === key}
              aria-label={key.replace(/-/g, " ")}
              title={key.replace(/-/g, " ")}
              disabled={!editable || update.isPending}
              className={cn(
                "grid size-11 place-items-center rounded-md border",
                category.icon === key ? "border-primary bg-muted" : "border-transparent hover:bg-muted",
              )}
              onClick={() => void save({ icon: category.icon === key ? null : key })}
            >
              <CategoryGlyph icon={key} className="size-5" />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-medium">Picture</p>
        <p className="text-xs text-muted-foreground">Optional. Without one, the storefront uses a product's picture.</p>
        <div className="flex items-center gap-3">
          {category.imageUrl ? (
            <img src={category.imageUrl} alt="" className="size-20 rounded-md border border-border object-cover" />
          ) : (
            <div className="grid size-20 place-items-center rounded-md border border-dashed border-border text-muted-foreground">
              <ImagePlus className="size-5" />
            </div>
          )}
          {editable ? (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" disabled={upload.isPending}>
                <label>
                  {category.imageUrl ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ""
                      if (!file) return
                      setError(null)
                      upload.mutate({ id: category.id, file }, { onError: (err) => setError(taxonomyErrorText(err)) })
                    }}
                  />
                </label>
              </Button>
              {category.imageUrl ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => void save({ imageKey: null })}>
                  <Trash2 />
                  Remove
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Synonyms</p>
        <p className="text-xs text-muted-foreground">
          Other words shops and shoppers use for this category; they help suggestions and search.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {category.synonyms.map((s) => (
            <li key={s} className="ef-chip">
              {s}
              {editable ? (
                <button
                  type="button"
                  aria-label={`Remove ${s}`}
                  onClick={() => void save({ synonyms: category.synonyms.filter((x) => x !== s) })}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
          {category.synonyms.length === 0 ? <li className="text-sm text-muted-foreground">None yet.</li> : null}
        </ul>
        {editable && category.synonyms.length < SYNONYMS_MAX ? (
          <form
            className="flex max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              addSynonym()
            }}
          >
            <Input
              aria-label="Add a synonym"
              placeholder="Add a word…"
              maxLength={40}
              value={synonym}
              onChange={(e) => setSynonym(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={synonym.trim() === ""}>
              Add
            </Button>
          </form>
        ) : null}
      </div>
      <SaveError error={error} />
    </div>
  )
}

const INHERIT = "inherit"

function DefaultsTab({
  category,
  parent,
  editable,
}: {
  category: Category
  parent: Category | undefined
  editable: boolean
}) {
  const update = useUpdateCategory()
  const [error, setError] = useState<string | null>(null)
  // What applies when this category sets nothing: the parent's resolved value.
  const inherited: FactDefaults = parent?.resolved ?? { storage: null, gstStatus: null, ageRestricted: null }

  async function set(patch: Partial<FactDefaults>) {
    setError(null)
    try {
      await update.mutateAsync({ id: category.id, body: { defaults: patch } })
    } catch (err) {
      setError(taxonomyErrorText(err))
    }
  }

  const inheritLabel = (word: string | null) => (word ? `Inherit (${word})` : "Inherit (not set)")
  const ageWord = (v: boolean | null) => (v === null ? null : v ? "18+" : "Not age-restricted")

  return (
    <div className="max-w-md space-y-5">
      <p className="text-sm text-muted-foreground">
        A new product here starts from these. The shop may change them per product; review sees the change.
      </p>
      <DefaultSelect
        id="default-storage"
        label="Storage"
        value={category.defaults.storage ?? INHERIT}
        disabled={!editable || update.isPending}
        options={[
          { value: INHERIT, label: inheritLabel(inherited.storage ? STORAGE_WORDS[inherited.storage] : null) },
          ...STORAGES.map((s) => ({ value: s, label: STORAGE_WORDS[s] })),
        ]}
        onChange={(v) => void set({ storage: v === INHERIT ? null : (v as Storage) })}
      />
      <DefaultSelect
        id="default-gst"
        label="GST"
        value={category.defaults.gstStatus ?? INHERIT}
        disabled={!editable || update.isPending}
        options={[
          { value: INHERIT, label: inheritLabel(inherited.gstStatus ? GST_STATUS_WORDS[inherited.gstStatus] : null) },
          ...(["taxable", "gst_free"] as GstStatus[]).map((g) => ({ value: g, label: GST_STATUS_WORDS[g] })),
        ]}
        onChange={(v) => void set({ gstStatus: v === INHERIT ? null : (v as GstStatus) })}
      />
      <DefaultSelect
        id="default-age"
        label="Age restriction"
        value={category.defaults.ageRestricted === null ? INHERIT : String(category.defaults.ageRestricted)}
        disabled={!editable || update.isPending}
        options={[
          { value: INHERIT, label: inheritLabel(ageWord(inherited.ageRestricted)) },
          { value: "true", label: "18+" },
          { value: "false", label: "Not age-restricted" },
        ]}
        onChange={(v) => void set({ ageRestricted: v === INHERIT ? null : v === "true" })}
      />
      <SaveError error={error} />
    </div>
  )
}

function DefaultSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled: boolean
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ProductsTab({ category }: { category: Category }) {
  return (
    <div className="space-y-3 text-sm">
      <dl className="ef-dl ef-dl--tight max-w-md">
        <div className="ef-dl__row">
          <dt>Products filed here or beneath</dt>
          <dd className="tabular-nums">{category.productCount}</dd>
        </div>
        <div className="ef-dl__row">
          <dt>Extra placements here or beneath</dt>
          <dd className="tabular-nums">{category.placementCount}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/product-review">Review queue</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/product-review/missing-details">Products missing details</Link>
        </Button>
      </div>
    </div>
  )
}

/** Retire (refused with sub-categories or products) or restore (may ask to move the parent's products). */
function StatusControl({ category, categories }: { category: Category; categories: Category[] }) {
  const setStatus = useSetCategoryStatus()
  const [confirm, setConfirm] = useState<"retire" | "restore-move" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const parent = category.parentId ? categories.find((c) => c.id === category.parentId) : undefined

  async function run(status: "active" | "retired", moveProductsToSelf?: boolean) {
    setError(null)
    try {
      await setStatus.mutateAsync({ id: category.id, body: { status, moveProductsToSelf } })
      setConfirm(null)
    } catch (err) {
      if (status === "active" && refusalCode(err) === "category_has_products") setConfirm("restore-move")
      else {
        setConfirm(null)
        setError(taxonomyErrorText(err))
      }
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {category.status === "active" ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("retire")}>
          Retire
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={setStatus.isPending}
          onClick={() => void run("active")}
        >
          Restore
        </Button>
      )}
      <SaveError error={error} />
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "retire" ? `Retire ${category.name}?` : `Restore ${category.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "retire"
                ? "Shops can no longer file products here and the storefront stops showing it. Extra placements into it are removed. You can restore it later."
                : `Products are now filed in ${parent?.name ?? "its parent"}. Restoring this category moves them into it, because products can only sit in a category with no sub-categories.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={setStatus.isPending}
              onClick={(e) => {
                e.preventDefault()
                void (confirm === "retire" ? run("retired") : run("active", true))
              }}
            >
              {confirm === "retire" ? "Retire" : "Restore and move products"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
