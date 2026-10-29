import { useEffect, useMemo, useState } from "react"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, CircleAlert } from "lucide-react"

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { FormSkeleton, Loading } from "@effy/web-kit/patterns"
import {
  ChooseCategoryFirst,
  DetailsStep,
  detailErrors,
  draftMissing,
  draftVariants,
  EditorSection,
  emptyDraft,
  FormField,
  isValidPrice,
  LivePreview,
  NameCategoryStep,
  optionAttributeIds,
  pathText,
  PhotoStep,
  previewPrice,
  ProductEditor,
  ProductEditorSkeleton,
  readiness,
  ReadinessBanner,
  type ReadinessItem,
  RecategoriseDialog,
  ReviewStep,
  sendableDetails,
  setDetail,
  SHOP_STEPS,
  STEP_WORDS,
  stepComplete,
  type StepKey,
  stepStates,
  toInputs,
  useObjectUrl,
  VariantEditor,
  variantSetDraftOf,
  variantSetErrors,
  type ProductDraft,
  type ShopTaxonomy,
} from "@effy/web-kit/product-form"

import { MarginField } from "@/features/product-review/MarginField"
import { marginLabel, previewCustomerPrice, toMargin, type MarginEntry } from "@/features/product-review/model"
import { shopListQuery } from "@/features/shops/queries"
import { isLeaf, pathOf } from "@/features/taxonomy/model"
import { formQuery, treeQuery } from "@/features/taxonomy/queries"

import { createEffyProduct, updateEffyProduct, uploadEffyPicture, type EffyProductBody } from "./repo"
import { productErrorText } from "./words"

const CREATE_STEPS: readonly StepKey[] = ["shop", ...SHOP_STEPS]
/** Without these Effy cannot save at all; a photo and the details only decide whether it goes on sale. */
const NEEDED_TO_SAVE: readonly StepKey[] = ["shop", "basics", "sizes"]

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
 * Effy's product form: the shop's own editor (`@effy/web-kit/product-form`), with the shop and Effy's margin as
 * its first step. It saves as Effy's draft and goes on sale by itself once complete — there is no review to
 * submit to.
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
  const STEPS = mode.kind === "create" ? CREATE_STEPS : SHOP_STEPS

  const [draft, setDraft] = useState<ProductDraft>(() => (content ? draftFromContent(content) : emptyDraft()))
  const [shopId, setShopId] = useState<string>("")
  const [margin, setMargin] = useState<MarginEntry>({ kind: "percent", value: "" })
  const [picture, setPicture] = useState<File | null>(null)
  const pictureUrl = useObjectUrl(picture) ?? content?.media.find((m) => m.isPrimary)?.url ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visited, setVisited] = useState<ReadonlySet<StepKey>>(() => new Set([STEPS[0]!]))
  const [attempted, setAttempted] = useState<ReadonlySet<StepKey>>(new Set())
  const [reveal, setReveal] = useState(0)
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

  const step = Math.min(draft.step, STEPS.length - 1)
  const key = STEPS[step]!
  const last = step === STEPS.length - 1
  const hasPicture = picture !== null || (content?.media.length ?? 0) > 0
  const ctx = { form: form.data, hasImage: hasPicture }
  const missing = form.data ? draftMissing(form.data, draft) : []
  // The margin being set, or the one a product being finished already has.
  const marginDto = mode.kind === "create" ? toMargin(margin) : mode.product.margin
  const shopName = shops.data?.items.find((s) => s.id === shopId)?.name ?? null
  const whoDone = mode.kind === "finish" || (shopId !== "" && marginDto !== null)
  const shopPrices = draft.variantSet.variants.map((v) => v.shopPriceAmount.trim()).filter(isValidPrice)
  // What shoppers will pay: the shop's price plus the margin.
  const shown = (p: string) => (marginDto ? previewCustomerPrice(p, marginDto.kind, marginDto.value) : p)

  const ready: ReadinessItem[] = [
    ...(mode.kind === "create"
      ? [
          { key: "shop", label: "Shop", ok: shopId !== "", step: "shop" as const },
          { key: "margin", label: "Effy's margin", ok: marginDto !== null, step: "shop" as const },
        ]
      : []),
    ...readiness(draft, ctx, { optional: ["image", "details"] }),
  ]
  const canSave = ready.filter((r) => NEEDED_TO_SAVE.includes(r.step)).every((r) => r.ok)
  const goesOnSale = ready.every((r) => r.ok)
  const shopStep = {
    complete: whoDone,
    summary: shopName
      ? [shopName, marginDto ? `${marginLabel(marginDto)} margin` : null].filter(Boolean).join(" · ")
      : "Which shop, what margin",
  }

  function goTo(i: number) {
    if (i < 0 || i >= STEPS.length) return
    setVisited((v) => new Set(v).add(key).add(STEPS[i]!))
    update({ step: i })
  }

  function fix(item: Pick<ReadinessItem, "step">) {
    setAttempted((a) => new Set(a).add(item.step))
    goTo(STEPS.indexOf(item.step))
    setReveal((r) => r + 1)
  }

  const complete = (k: StepKey) => (k === "shop" ? whoDone : stepComplete(k, draft, ctx))

  function next() {
    if (!complete(key)) {
      setAttempted((a) => new Set(a).add(key))
      // A photo and the details can wait: the product saves as Effy's draft without them.
      if (NEEDED_TO_SAVE.includes(key)) {
        setReveal((r) => r + 1)
        return
      }
    }
    goTo(step + 1)
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
    const first = ready.find((r) => !r.ok && NEEDED_TO_SAVE.includes(r.step))
    if (first || !b) {
      setAttempted(new Set(NEEDED_TO_SAVE))
      fix(first ?? { step: "basics" })
      return
    }
    setBusy(true)
    setError(null)
    try {
      let product =
        mode.kind === "create" ? await createEffyProduct({ ...b, shopId, margin: marginDto! }) : mode.product
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
    if (!taxonomy.data) return <StepBodySkeleton />
    const needsForm = key === "details" || key === "sizes" || key === "review"
    if (needsForm && draft.primaryCategoryId && form.isError)
      return <ErrorState error={form.error} onRetry={() => void form.refetch()} />
    if (needsForm && draft.primaryCategoryId && !form.data) return <StepBodySkeleton />
    const rows = form.data ? formRows(form.data) : []
    const tried = attempted.has(key)
    switch (key) {
      case "shop":
        return (
          <div className="ef-editor__body">
            <EditorSection
              title="The shop"
              description="The product is the shop's: it sees it, fulfils its orders and owns it once it is on sale."
            >
              <FormField
                id="effy-shop"
                label="For which shop"
                required
                error={tried && !shopId ? "Choose the shop" : null}
              >
                <Select value={shopId} onValueChange={setShopId} disabled={busy}>
                  <SelectTrigger id="effy-shop" className="w-full" aria-invalid={tried && !shopId}>
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
              </FormField>
            </EditorSection>
            <EditorSection
              title="Effy's margin"
              description="Added to every size's shop price to make what shoppers pay."
            >
              <div className="grid gap-2" data-invalid={tried && !marginDto ? "true" : undefined}>
                <MarginField
                  id="effy-margin"
                  shopPrices={shopPrices}
                  value={margin}
                  onChange={setMargin}
                  disabled={busy}
                />
                {tried && !marginDto ? (
                  <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <CircleAlert aria-hidden="true" className="size-4" />
                    Set Effy&apos;s margin, e.g. 15 for 15%
                  </p>
                ) : null}
              </div>
            </EditorSection>
          </div>
        )
      case "basics":
        return (
          <NameCategoryStep
            draft={draft}
            taxonomy={taxonomy.data}
            onField={update}
            onCategory={(id) => void chooseCategory(id)}
            errors={
              tried
                ? {
                    name: draft.name.trim() ? undefined : "Give it a name",
                    category: draft.primaryCategoryId ? undefined : "Choose where shoppers find it",
                    shortDescription: draft.shortDescription.trim() ? undefined : "Write a line or two for shoppers",
                  }
                : {}
            }
            disabled={busy}
          />
        )
      case "image":
        return (
          <PhotoStep
            file={picture}
            onChange={setPicture}
            imageUrl={pictureUrl}
            disabled={busy}
            note={
              !picture && content?.media.length
                ? `It already has ${content.media.length === 1 ? "a picture" : `${content.media.length} pictures`}; a new one becomes the main picture.`
                : "Optional now: without a main picture it stays off sale until one is added."
            }
          />
        )
      case "sizes":
        return (
          <VariantEditor
            value={draft.variantSet}
            onChange={(variantSet) => update({ variantSet })}
            rows={rows}
            errors={variantSetErrors(draft.variantSet)}
            showErrors={tried}
            disabled={busy}
            priceLabel="Shop's price"
            priceHelp="What Effy pays the shop. Shoppers pay this plus Effy's margin"
          />
        )
      case "details":
        if (!form.data) return <ChooseCategoryFirst onGo={() => fix({ step: "basics" })} />
        return (
          <DetailsStep
            form={form.data}
            details={draft.details}
            variants={draftVariants(draft, form.data)}
            optionAttributeIds={optionAttributeIds(draft)}
            errors={tried ? detailErrors(form.data, draft) : {}}
            facts={draft.facts}
            factsTouched={draft.factsTouched}
            onDetail={(attributeId, entry) =>
              setDraft((d) => ({ ...d, details: setDetail(d.details, entry, attributeId) }))
            }
            onFacts={(facts, factsTouched) => update({ facts, factsTouched })}
            disabled={busy}
          />
        )
      default: {
        const blocking = ready.filter((r) => !r.ok && NEEDED_TO_SAVE.includes(r.step))
        const later = ready.filter((r) => !r.ok)
        return (
          <ReviewStep
            draft={draft}
            form={form.data}
            imageUrl={pictureUrl}
            uploadProgress={null}
            steps={STEPS}
            onEdit={(k) => goTo(STEPS.indexOf(k))}
            shown={marginDto ? shown : undefined}
            noImage="None yet. It stays off sale until one is added."
            extra={
              mode.kind === "create"
                ? {
                    shop: [
                      ["Shop", shopName],
                      ["Margin", marginDto ? marginLabel(marginDto) : null],
                    ],
                  }
                : {}
            }
            banner={
              !canSave ? (
                <ReadinessBanner tone="missing" title="Needed before you can save" items={blocking} onFix={fix} />
              ) : goesOnSale ? (
                <ReadinessBanner
                  tone="ready"
                  title="Complete. It goes on sale when you save."
                  description={
                    mode.kind === "create"
                      ? `Saving approves it at ${marginLabel(marginDto)} and hands it to ${shopName ?? "the shop"}.`
                      : "Saving approves it and puts it on sale."
                  }
                />
              ) : (
                <ReadinessBanner
                  tone="note"
                  title="It saves as Effy's draft"
                  description="The shop can see it but not change it. It goes on sale by itself once these are done:"
                  items={later}
                  onFix={fix}
                />
              )
            }
          />
        )
      }
    }
  }

  const nextKey = STEPS[step + 1]
  return (
    <>
      <ProductEditor
        steps={stepStates(STEPS, step, visited, draft, ctx, mode.kind === "create" ? { shop: shopStep } : {})}
        current={step}
        onStep={goTo}
        stepTitle={last ? "Check it, then save" : STEP_WORDS[key].title}
        stepHint={
          last
            ? "Saving creates it for the shop. A complete product goes straight on sale at your margin."
            : STEP_WORDS[key].hint
        }
        reveal={reveal}
        busy={busy}
        preview={
          <LivePreview
            draft={draft}
            form={form.data}
            imageUrl={pictureUrl}
            price={previewPrice(draft, shown)}
            shown={shown}
            description="At the shoppers' price, after Effy's margin."
            note={
              marginDto ? "Shoppers' price includes Effy's margin." : "Shown at the shop's price until a margin is set."
            }
          />
        }
        start={
          <>
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => goTo(step - 1)} disabled={busy}>
                <ArrowLeft aria-hidden="true" />
                Back
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </>
        }
        note={
          last
            ? goesOnSale
              ? "It goes on sale when you save."
              : "It stays off sale until it is complete."
            : "Nothing is saved until the last step."
        }
        end={
          last ? (
            <Button type="button" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : goesOnSale ? "Save and put on sale" : "Save as Effy's draft"}
            </Button>
          ) : (
            <Button type="button" onClick={next} disabled={busy}>
              Next: {STEP_WORDS[nextKey!].title}
              <ArrowRight aria-hidden="true" />
            </Button>
          )
        }
      >
        {stepBody()}
        {key === "details" && attempted.has("details") && missing.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Still empty: {missing.join(", ")}. It can be saved without them, but stays off sale until they are filled.
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        ) : null}
      </ProductEditor>
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
    </>
  )
}

function StepBodySkeleton() {
  return (
    <Loading label="Loading the category's form">
      <FormSkeleton fields={4} submit={false} />
    </Loading>
  )
}

/** The form's page while the product it finishes is read: the same header, rail, step and preview. */
export function EffyProductFormSkeleton() {
  return <ProductEditorSkeleton steps={SHOP_STEPS.map((k) => STEP_WORDS[k].title)} />
}
