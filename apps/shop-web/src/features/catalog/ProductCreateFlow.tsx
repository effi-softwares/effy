import { useEffect, useState } from "react"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, CircleAlert } from "lucide-react"

import { formRows, recategorise, type CreateProductRequest, type FactKey, type ProductFacts } from "@effy/shared-types"
import { Alert, AlertTitle, Button } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { FormSkeleton, Loading } from "@effy/web-kit/patterns"
import {
  ChooseCategoryFirst,
  clearDraft,
  detailErrors,
  DetailsStep,
  draftMissing,
  draftVariants,
  emptyDraft,
  LivePreview,
  loadDraft,
  NameCategoryStep,
  optionAttributeIds,
  PhotoStep,
  previewPrice,
  ProductEditor,
  ProductEditorSkeleton,
  type ProductDraft,
  readiness,
  ReadinessBanner,
  type ReadinessItem,
  RecategoriseDialog,
  ReviewStep,
  saveDraft,
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
  variantSetErrors,
  WhatHappensNext,
} from "@effy/web-kit/product-form"

import { Page } from "@/components/console/primitives"
import { sessionQuery } from "@/features/auth/queries"
import { meQuery } from "@/features/shop-identity/queries"
import { track } from "@/lib/telemetry"

import { productMutationError } from "./errorText"
import { pathText } from "./model"
import { categoryFormQuery, taxonomyQuery, useCreateProduct } from "./queries"
import { submitProductForReview, uploadProductMedia } from "./repo"

interface Props {
  onCancel: () => void
  onCreated: (productId: string) => void
}

const STEPS = SHOP_STEPS
const STEP_TITLES = STEPS.map((k) => STEP_WORDS[k].title)

const NEXT_STEPS = [
  { title: "You send it", text: "It appears in your catalog as “In review”. You can still change it." },
  { title: "Effy checks it", text: "And sets what shoppers pay. If something needs changing, you'll get a note." },
  { title: "It goes on sale", text: "You'll get a notification, and orders for it start coming in." },
]

function StepLoading() {
  return (
    <Loading label="Loading the category's form">
      <FormSkeleton fields={3} submit={false} />
    </Loading>
  )
}

export function ProductCreateFlow(props: Props) {
  const session = useQuery(sessionQuery)
  const me = useQuery(meQuery)
  const subject = session.data?.status === "signed-in" ? session.data.identity.subject : null
  const shopId = me.data?.shop?.id ?? null

  if (me.isError) {
    return (
      <Page>
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </Page>
    )
  }
  if (!shopId || !subject) return <ProductEditorSkeleton steps={STEP_TITLES} />
  return <CreateFlow key={`${shopId}:${subject}`} shopId={shopId} subject={subject} {...props} />
}

function CreateFlow({ shopId, subject, onCancel, onCreated }: Props & { shopId: string; subject: string }) {
  const taxonomy = useQuery(taxonomyQuery)
  const queryClient = useQueryClient()
  const createProduct = useCreateProduct()

  const [draft, setDraft] = useState<ProductDraft>(() => {
    const saved = loadDraft(shopId, subject) ?? emptyDraft()
    return { ...saved, step: Math.min(Math.max(saved.step, 0), STEPS.length - 1) }
  })
  const form = useQuery({
    ...categoryFormQuery(draft.primaryCategoryId ?? ""),
    enabled: draft.primaryCategoryId !== null,
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  // Steps left at least once (an incomplete one shows "to fix"), and steps Next was tried on (errors show).
  const [visited, setVisited] = useState<ReadonlySet<StepKey>>(() => new Set([STEPS[draft.step]!]))
  const [attempted, setAttempted] = useState<ReadonlySet<StepKey>>(new Set())
  const [reveal, setReveal] = useState(0)
  const [pendingMove, setPendingMove] = useState<{
    leafId: string
    path: string
    dropped: string[]
    apply: () => void
  } | null>(null)
  const imageUrl = useObjectUrl(imageFile)

  useEffect(() => {
    track({ name: "product_create_started" })
  }, [])

  function change(next: (d: ProductDraft) => ProductDraft) {
    setDraft((d) => {
      const updated = next(d)
      saveDraft(shopId, subject, updated)
      return updated
    })
    setSavedAt(new Date())
  }
  const update = (patch: Partial<ProductDraft>) => change((d) => ({ ...d, ...patch }))

  // Facts the shop has not changed follow the leaf's defaults.
  useEffect(() => {
    const defaults = form.data?.defaults
    if (!defaults) return
    change((d) => {
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

  /** Choosing a leaf: when entered details would be dropped, ask first. */
  async function chooseCategory(leafId: string) {
    if (leafId === draft.primaryCategoryId) return
    if (draft.details.length === 0 || !form.data) {
      update({ primaryCategoryId: leafId })
      return
    }
    try {
      const next = await queryClient.fetchQuery(categoryFormQuery(leafId))
      const moved = recategorise(draft, formRows(form.data), formRows(next), next.defaults)
      const apply = () => update({ primaryCategoryId: leafId, details: moved.details, facts: moved.facts })
      if (moved.dropped.length === 0) apply()
      else setPendingMove({ leafId, path: pathText(next.path), dropped: moved.dropped, apply })
    } catch (err) {
      setFormError(productMutationError(err))
    }
  }

  const step = draft.step
  const key = STEPS[step]!
  const last = step === STEPS.length - 1
  const ctx = { form: form.data, hasImage: !!imageFile }
  const busy = createProduct.isPending || uploadProgress != null
  const missing = form.data ? draftMissing(form.data, draft) : []
  const ready = readiness(draft, ctx)
  const allReady = ready.every((r) => r.ok)

  function goTo(i: number) {
    if (i < 0 || i >= STEPS.length) return
    setVisited((v) => new Set(v).add(key).add(STEPS[i]!))
    update({ step: i })
  }

  /** Open the step that holds something missing, with its errors showing. */
  function fix(item: Pick<ReadinessItem, "step">) {
    setAttempted((a) => new Set(a).add(item.step))
    goTo(STEPS.indexOf(item.step))
    setReveal((r) => r + 1)
  }

  function next() {
    if (!stepComplete(key, draft, ctx)) {
      setAttempted((a) => new Set(a).add(key))
      setReveal((r) => r + 1)
      return
    }
    goTo(step + 1)
  }

  function discard() {
    clearDraft(shopId, subject)
    onCancel()
  }

  async function publish() {
    const first = ready.find((r) => !r.ok)
    if (first) {
      setAttempted(new Set(STEPS))
      fix(first)
      return
    }
    const f = draft.facts
    if (
      !draft.primaryCategoryId ||
      !imageFile ||
      f.storage === null ||
      f.gstStatus === null ||
      f.ageRestricted === null
    )
      return
    setFormError(null)
    try {
      const set = toInputs(draft.variantSet)
      const body: CreateProductRequest = {
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
      const product = await createProduct.mutateAsync(body)
      setUploadProgress(0)
      await uploadProductMedia(product.id, imageFile, { isPrimary: true, onProgress: setUploadProgress })

      track({ name: "product_created", productId: product.id })
      track({ name: "product_variants_saved", productId: product.id, variantCount: set.variants.length })
      try {
        await submitProductForReview(product.id)
        track({ name: "product_submitted_for_review", productId: product.id })
      } catch {
        // the product exists as a draft; the shop can submit it from its page
      }
      clearDraft(shopId, subject)
      onCreated(product.id)
    } catch (err) {
      setUploadProgress(null)
      setFormError(productMutationError(err))
    }
  }

  function stepBody() {
    if (taxonomy.isError) return <ErrorState error={taxonomy.error} onRetry={() => void taxonomy.refetch()} />
    if (taxonomy.isPending) return <StepLoading />
    const needsForm = key === "details" || key === "sizes" || key === "review"
    if (needsForm && draft.primaryCategoryId && form.isError)
      return <ErrorState error={form.error} onRetry={() => void form.refetch()} />
    if (needsForm && draft.primaryCategoryId && !form.data) return <StepLoading />
    const rows = form.data ? formRows(form.data) : []
    const tried = attempted.has(key)
    switch (key) {
      case "basics":
        return (
          <NameCategoryStep
            onPickerEvent={track}
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
            file={imageFile}
            onChange={setImageFile}
            imageUrl={imageUrl}
            error={tried && !imageFile ? "Add a photo. Every product needs one." : null}
            disabled={busy}
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
              change((d) => ({ ...d, details: setDetail(d.details, entry, attributeId) }))
            }
            onFacts={(facts, factsTouched) => update({ facts, factsTouched })}
            disabled={busy}
          />
        )
      default: {
        const left = ready.filter((r) => !r.ok)
        return (
          <ReviewStep
            draft={draft}
            form={form.data}
            imageUrl={imageUrl}
            uploadProgress={uploadProgress}
            steps={STEPS}
            onEdit={(k) => goTo(STEPS.indexOf(k))}
            banner={
              allReady ? (
                <ReadinessBanner
                  tone="ready"
                  title="Ready to send to Effy"
                  description="Everything this category needs is filled in."
                />
              ) : (
                <ReadinessBanner
                  tone="missing"
                  title={left.length === 1 ? "1 thing to finish first" : `${left.length} things to finish first`}
                  items={left}
                  onFix={fix}
                />
              )
            }
            after={<WhatHappensNext steps={NEXT_STEPS} />}
          />
        )
      }
    }
  }

  const nextKey = STEPS[step + 1]
  return (
    <>
      <ProductEditor
        steps={stepStates(STEPS, step, visited, draft, ctx)}
        current={step}
        onStep={goTo}
        stepTitle={last ? "Check it, then send to Effy" : STEP_WORDS[key].title}
        stepHint={
          last
            ? "Effy checks every new product and sets what shoppers pay before it goes on sale."
            : STEP_WORDS[key].hint
        }
        reveal={reveal}
        busy={busy}
        preview={
          <LivePreview
            draft={draft}
            form={form.data}
            imageUrl={imageUrl}
            price={previewPrice(draft)}
            description="Sold under Effy's name. Shoppers never see which shop supplies it."
            note="Shown at your price. Effy sets what shoppers pay when it approves the product."
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
            <Button type="button" variant="ghost" onClick={discard} disabled={busy}>
              Discard draft
            </Button>
          </>
        }
        note={
          last
            ? "You can still change it while it's in review."
            : savedAt
              ? `Draft saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : null
        }
        end={
          last ? (
            <Button type="button" onClick={() => void publish()} disabled={busy}>
              {busy ? "Sending to Effy…" : "Send to Effy for review"}
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
          <p role="alert" className="text-sm font-medium text-destructive">
            Still required: {missing.join(", ")}.
          </p>
        ) : null}
        {formError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>{formError}</AlertTitle>
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
