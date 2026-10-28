import { useEffect, useMemo, useState } from "react"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, CircleAlert } from "lucide-react"

import {
  formRows,
  recategorise,
  type BackOfficeProductDTO,
  type EffyProductContentDTO,
  type FactKey,
  type ProductFacts,
} from "@effy/shared-types"
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { PageHeader } from "@effy/web-kit/patterns"
import {
  DetailsStep,
  detailErrors,
  draftMissing,
  draftVariants,
  emptyDraft,
  ImageDropzone,
  NameCategoryStep,
  optionAttributeIds,
  pathText,
  RecategoriseDialog,
  ReviewStep,
  sendableDetails,
  setDetail,
  ShopperPreview,
  STEPS,
  StepTabs,
  toInputs,
  useObjectUrl,
  VariantEditor,
  variantSetDraftOf,
  variantSetErrors,
  type ProductDraft,
  type ShopTaxonomy,
} from "@effy/web-kit/product-form"

import { MarginField } from "@/features/product-review/MarginField"
import { toMargin, type MarginEntry } from "@/features/product-review/model"
import { shopListQuery } from "@/features/shops/queries"
import { isLeaf, pathOf } from "@/features/taxonomy/model"
import { formQuery, treeQuery } from "@/features/taxonomy/queries"

import { createEffyProduct, updateEffyProduct, uploadEffyPicture, type EffyProductBody } from "./repo"
import { productErrorText } from "./words"

const SIZES_STEP = 1
const PICTURE_STEP = 2
const DETAILS_STEP = 3

/** A product Effy has saved, back in the form's draft (102). */
export function draftFromContent(c: EffyProductContentDTO): ProductDraft {
  return {
    ...emptyDraft(),
    name: c.name,
    primaryCategoryId: c.primaryCategoryId,
    shortDescription: c.shortDescription,
    brand: c.brand ?? "",
    longDescription: c.longDescription ?? "",
    variantSet: variantSetDraftOf(c.options, c.variants, c.unitBasis),
    facts: { storage: c.storage, gstStatus: c.gstStatus, ageRestricted: c.ageRestricted },
    // What was saved is a choice, not a default to follow.
    factsTouched: ["storage", "gstStatus", "ageRestricted"],
    details: c.details,
  }
}

/** The category tree in the picker's shape, from back-office's own taxonomy read. */
function useTaxonomy(): { data: ShopTaxonomy | undefined; error: unknown; isError: boolean; refetch: () => void } {
  const tree = useQuery(treeQuery())
  const data = useMemo<ShopTaxonomy | undefined>(() => {
    if (!tree.data) return undefined
    const active = tree.data.filter((c) => c.status === "active")
    const byId = new Map(active.map((c) => [c.id, c]))
    return {
      categories: active.map((c) => ({
        id: c.id,
        parentId: c.parentId,
        name: c.name,
        path: pathOf(c.id, byId),
        isLeaf: isLeaf(c.id, active),
        synonyms: c.synonyms,
        icon: c.icon,
      })),
      recentLeafIds: [],
    }
  }, [tree.data])
  return { data, error: tree.error, isError: tree.isError, refetch: () => void tree.refetch() }
}

type Mode = { kind: "create" } | { kind: "finish"; product: BackOfficeProductDTO }

/**
 * Effy's product form: the shop's own steps (`@effy/web-kit/product-form`), plus the shop and Effy's margin.
 * It saves as Effy's draft and goes on sale by itself once complete — there is no review to submit to.
 */
export function EffyProductForm({
  mode,
  onDone,
  onCancel,
}: {
  mode: Mode
  onDone: (productId: string) => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const taxonomy = useTaxonomy()
  const shops = useQuery({ ...shopListQuery({ page: 1, pageSize: 100 }), enabled: mode.kind === "create" })
  const content = mode.kind === "finish" ? mode.product.effyContent : null

  const [draft, setDraft] = useState<ProductDraft>(() => (content ? draftFromContent(content) : emptyDraft()))
  const [shopId, setShopId] = useState<string>("")
  const [margin, setMargin] = useState<MarginEntry>({ kind: "percent", value: "" })
  const [picture, setPicture] = useState<File | null>(null)
  const pictureUrl = useObjectUrl(picture) ?? content?.media.find((m) => m.isPrimary)?.url ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variantsAttempted, setVariantsAttempted] = useState(false)
  const [detailsAttempted, setDetailsAttempted] = useState(false)
  const [pendingMove, setPendingMove] = useState<{ path: string; dropped: string[]; apply: () => void } | null>(null)

  const form = useQuery({ ...formQuery(draft.primaryCategoryId ?? ""), enabled: draft.primaryCategoryId !== null })
  const update = (patch: Partial<ProductDraft>) => setDraft((d) => ({ ...d, ...patch }))

  // Facts staff have not chosen follow the leaf's defaults, as in the shop's form.
  useEffect(() => {
    const defaults = form.data?.defaults
    if (!defaults) return
    setDraft((d) => {
      const pick = <K extends FactKey>(k: K): ProductFacts[K] => (d.factsTouched.includes(k) ? d.facts[k] : defaults[k])
      const facts: ProductFacts = {
        storage: pick("storage"),
        gstStatus: pick("gstStatus"),
        ageRestricted: pick("ageRestricted"),
      }
      return facts.storage === d.facts.storage &&
        facts.gstStatus === d.facts.gstStatus &&
        facts.ageRestricted === d.facts.ageRestricted
        ? d
        : { ...d, facts }
    })
  }, [form.data])

  async function chooseCategory(leafId: string) {
    if (leafId === draft.primaryCategoryId) return
    if (draft.details.length === 0 || !form.data) {
      update({ primaryCategoryId: leafId })
      return
    }
    try {
      const next = await queryClient.fetchQuery(formQuery(leafId))
      const moved = recategorise(draft, formRows(form.data), formRows(next), next.defaults)
      const apply = () => update({ primaryCategoryId: leafId, details: moved.details, facts: moved.facts })
      if (moved.dropped.length === 0) apply()
      else setPendingMove({ path: pathText(next.path), dropped: moved.dropped, apply })
    } catch (err) {
      setError(productErrorText(err))
    }
  }

  const step = draft.step
  const last = step === STEPS.length - 1
  const missing = form.data ? draftMissing(form.data, draft) : []
  const basicsDone = Boolean(draft.name.trim() && draft.shortDescription.trim() && draft.primaryCategoryId)
  const sizesOk = Object.keys(variantSetErrors(draft.variantSet)).length === 0
  const whoDone = mode.kind === "finish" || (shopId !== "" && toMargin(margin) !== null)
  const hasPicture = picture !== null || (content?.media.length ?? 0) > 0

  function next() {
    if (step === 0 && !(basicsDone && whoDone)) return
    if (step === SIZES_STEP && !sizesOk) return setVariantsAttempted(true)
    if (step === DETAILS_STEP && missing.length > 0) setDetailsAttempted(true)
    update({ step: step + 1 })
  }

  function body(): EffyProductBody | null {
    const f = draft.facts
    if (!draft.primaryCategoryId || f.storage === null || f.gstStatus === null || f.ageRestricted === null) return null
    const set = toInputs(draft.variantSet)
    return {
      primaryCategoryId: draft.primaryCategoryId,
      name: draft.name.trim(),
      shortDescription: draft.shortDescription.trim(),
      brand: draft.brand.trim() || null,
      longDescription: draft.longDescription.trim() || null,
      storage: f.storage,
      gstStatus: f.gstStatus,
      ageRestricted: f.ageRestricted,
      details: sendableDetails(draft.details),
      unitBasis: set.unitBasis,
      options: set.options,
      variants: set.variants,
    }
  }

  async function save() {
    const b = body()
    if (!b) return
    setBusy(true)
    setError(null)
    try {
      let product =
        mode.kind === "create" ? await createEffyProduct({ ...b, shopId, margin: toMargin(margin)! }) : mode.product
      const kept = (product.effyContent?.media ?? content?.media ?? []).map((m) => m.storageKey)
      if (mode.kind === "finish" || picture) {
        const added = picture ? [await uploadEffyPicture(product.productId, picture)] : []
        // A new picture is the main one; the rest keep their order after it.
        const keys = [...added, ...kept.filter((k) => !added.includes(k))]
        product = await updateEffyProduct(product.productId, {
          ...b,
          version: product.version,
          media: keys.map((storageKey, i) => ({ storageKey, isPrimary: i === 0, displayOrder: i })),
        })
      }
      await queryClient.invalidateQueries({ queryKey: ["products"] })
      onDone(product.productId)
    } catch (err) {
      setError(productErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  function stepBody() {
    if (taxonomy.isError) return <ErrorState error={taxonomy.error} onRetry={taxonomy.refetch} />
    if (!taxonomy.data) return <Skeleton className="h-40" />
    if (step > 0 && form.isError) return <ErrorState error={form.error} onRetry={() => void form.refetch()} />
    if (step > 0 && !form.data) return <Skeleton className="h-40" />
    const rows = form.data ? formRows(form.data) : []
    switch (step) {
      case 0:
        return (
          <div className="space-y-6">
            {mode.kind === "create" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="effy-shop">For which shop</Label>
                  <Select
                    value={shopId}
                    onValueChange={(next) => {
                      setShopId(next)
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger id="effy-shop" className="w-full">
                      <SelectValue placeholder="Choose a shop…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(shops.data?.items ?? [])
                        .filter((s) => s.status === "active")
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-0.5 block text-sm text-muted-foreground">
                    The product is the shop's: it sees it, fulfils its orders and owns it once it is on sale.
                  </p>
                </div>
                <MarginField id="effy-margin" shopPrices={[]} value={margin} onChange={setMargin} disabled={busy} />
              </div>
            ) : null}
            <NameCategoryStep
              draft={draft}
              taxonomy={taxonomy.data}
              onField={update}
              onCategory={(id) => void chooseCategory(id)}
              disabled={busy}
            />
          </div>
        )
      case SIZES_STEP:
        return (
          <VariantEditor
            value={draft.variantSet}
            onChange={(variantSet) => update({ variantSet })}
            rows={rows}
            errors={variantSetErrors(draft.variantSet)}
            showErrors={variantsAttempted}
            disabled={busy}
          />
        )
      case PICTURE_STEP:
        return (
          <div className="space-y-3">
            <ImageDropzone file={picture} onChange={setPicture} disabled={busy} />
            {!picture && content?.media.length ? (
              <p className="mt-0.5 block text-sm text-muted-foreground">
                It already has {content.media.length === 1 ? "a picture" : `${content.media.length} pictures`}; a new
                one becomes the main picture.
              </p>
            ) : (
              <p className="mt-0.5 block text-sm text-muted-foreground">
                Optional now: without a main picture it stays off sale until one is added.
              </p>
            )}
          </div>
        )
      case DETAILS_STEP:
        return (
          <>
            <DetailsStep
              form={form.data!}
              details={draft.details}
              variants={draftVariants(draft, form.data!)}
              optionAttributeIds={optionAttributeIds(draft)}
              errors={detailsAttempted ? detailErrors(form.data!, draft) : {}}
              facts={draft.facts}
              factsTouched={draft.factsTouched}
              onDetail={(attributeId, entry) =>
                setDraft((d) => ({ ...d, details: setDetail(d.details, entry, attributeId) }))
              }
              onFacts={(facts, factsTouched) => update({ facts, factsTouched })}
              disabled={busy}
            />
          </>
        )
      default:
        return (
          <ReviewStep draft={draft} form={form.data} imageUrl={pictureUrl} uploadProgress={null} missing={missing} />
        )
    }
  }

  const goesOnSale = missing.length === 0 && hasPicture && sizesOk
  return (
    <>
      <PageHeader
        title={mode.kind === "create" ? "New product for a shop" : `Finish ${mode.product.name}`}
        description={STEPS[step]!.hint}
        meta={
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
        }
        actions={
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        }
      />
      <StepTabs step={step} disabled={busy} onStep={(s) => update({ step: s })} />
      <div className="ef-detail">
        <Card className="ef-detail__main min-h-70 py-5">
          <CardContent className="flex h-full flex-col gap-4">{stepBody()}</CardContent>
        </Card>
        <aside className="ef-detail__aside">
          <ShopperPreview draft={draft} path={form.data?.path ?? null} imageUrl={pictureUrl} />
        </aside>
      </div>
      {error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}
      {pendingMove ? (
        <RecategoriseDialog
          toPath={pendingMove.path}
          dropped={pendingMove.dropped}
          onCancel={() => setPendingMove(null)}
          onConfirm={() => {
            pendingMove.apply()
            setPendingMove(null)
          }}
        />
      ) : null}
      <div className="ef-actionbar">
        <div className="ef-actionbar__text">
          <div className="ef-actionbar__title">
            {last
              ? goesOnSale
                ? "Goes on sale when you save"
                : "Saves as Effy's draft"
              : `Next: ${STEPS[step + 1]!.title}`}
          </div>
          <div className="ef-actionbar__desc">
            {last
              ? goesOnSale
                ? "It is complete: saving approves it at your margin and puts it on sale."
                : `Still missing: ${[...(hasPicture ? [] : ["a main picture"]), ...missing].join(", ") || "nothing"}. Finish it from its page.`
              : "Nothing is saved until the last step."}
          </div>
        </div>
        <div className="ef-actionbar__actions">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => update({ step: step - 1 })} disabled={busy}>
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          ) : null}
          {last ? (
            <Button type="button" onClick={() => void save()} disabled={busy || !body() || !whoDone || !sizesOk}>
              {busy ? "Saving…" : goesOnSale ? "Save and put on sale" : "Save draft"}
            </Button>
          ) : (
            <Button type="button" onClick={next} disabled={busy || (step === 0 && !(basicsDone && whoDone))}>
              Next
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
