import { useEffect, useState } from "react"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, CircleAlert } from "lucide-react"

import { formRows, recategorise, type CreateProductRequest, type FactKey, type ProductFacts } from "@effy/shared-types"
import { Button, Skeleton } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { PageHeader } from "@effy/web-kit/patterns"

import { Page } from "@/components/console/primitives"
import { sessionQuery } from "@/features/auth/queries"
import { meQuery } from "@/features/shop-identity/queries"
import { track } from "@/lib/telemetry"
import { useObjectUrl } from "@/lib/useObjectUrl"

import { DetailsStep } from "./create/DetailsStep"
import { NameCategoryStep } from "./create/NameCategoryStep"
import { RecategoriseDialog } from "./create/RecategoriseDialog"
import { ReviewStep } from "./create/ReviewStep"
import { ShopperPreview } from "./create/ShopperPreview"
import { StepTabs } from "./create/StepTabs"
import { canAdvance, DETAILS_STEP, SIZES_STEP, STEPS } from "./create/steps"
import { clearDraft, emptyDraft, loadDraft, saveDraft, type ProductDraft } from "./draft"
import { productMutationError } from "./errorText"
import { ImageDropzone } from "./ImageDropzone"
import { pathText } from "./model"
import { categoryFormQuery, taxonomyQuery, useCreateProduct } from "./queries"
import { submitProductForReview, uploadProductMedia } from "./repo"
import { detailErrors, draftMissing, draftVariants, optionAttributeIds, sendableDetails, setDetail } from "./validation"
import { VariantEditor } from "./VariantEditor"
import { toInputs, variantSetErrors } from "./variants"

interface Props {
  onCancel: () => void
  onCreated: (productId: string) => void
}

function LoadingBlock() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading catalog">
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-14 w-2/3 rounded-lg" />
    </div>
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
  if (!shopId || !subject) {
    return (
      <Page>
        <LoadingBlock />
      </Page>
    )
  }
  return <CreateFlow key={`${shopId}:${subject}`} shopId={shopId} subject={subject} {...props} />
}

function CreateFlow({ shopId, subject, onCancel, onCreated }: Props & { shopId: string; subject: string }) {
  const taxonomy = useQuery(taxonomyQuery)
  const queryClient = useQueryClient()
  const createProduct = useCreateProduct()

  const [draft, setDraft] = useState<ProductDraft>(() => loadDraft(shopId, subject) ?? emptyDraft())
  const form = useQuery({
    ...categoryFormQuery(draft.primaryCategoryId ?? ""),
    enabled: draft.primaryCategoryId !== null,
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [variantsAttempted, setVariantsAttempted] = useState(false)
  const [detailsAttempted, setDetailsAttempted] = useState(false)
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
  }
  const update = (patch: Partial<ProductDraft>) => change((d) => ({ ...d, ...patch }))
  const goToStep = (step: number) => update({ step })

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

  const { step } = draft
  const last = step === STEPS.length - 1
  const advanceable = canAdvance(step, draft, form.data, !!imageFile)
  const busy = createProduct.isPending || uploadProgress != null
  const missing = form.data ? draftMissing(form.data, draft) : []

  function discard() {
    clearDraft(shopId, subject)
    onCancel()
  }

  function next() {
    if (step === SIZES_STEP && !advanceable) setVariantsAttempted(true)
    else if (step === DETAILS_STEP && !advanceable) setDetailsAttempted(true)
    else goToStep(step + 1)
  }

  async function publish() {
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
    if (taxonomy.isPending) return <LoadingBlock />
    if (step > 0 && form.isError) return <ErrorState error={form.error} onRetry={() => void form.refetch()} />
    if (step > 0 && !form.data) return <LoadingBlock />
    const rows = form.data ? formRows(form.data) : []
    switch (step) {
      case 0:
        return (
          <NameCategoryStep
            draft={draft}
            taxonomy={taxonomy.data}
            onField={update}
            onCategory={(id) => void chooseCategory(id)}
            disabled={busy}
          />
        )
      case 1:
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
      case 2:
        return <ImageDropzone file={imageFile} onChange={setImageFile} disabled={busy} />
      case 3:
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
                change((d) => ({ ...d, details: setDetail(d.details, entry, attributeId) }))
              }
              onFacts={(facts, factsTouched) => update({ facts, factsTouched })}
              disabled={busy}
            />
            {detailsAttempted && missing.length > 0 ? (
              <p role="alert" className="text-sm font-medium">
                Still required: {missing.join(", ")}.
              </p>
            ) : null}
          </>
        )
      default:
        return (
          <ReviewStep
            draft={draft}
            form={form.data}
            imageUrl={imageUrl}
            uploadProgress={uploadProgress}
            missing={missing}
          />
        )
    }
  }

  return (
    <Page>
      <PageHeader
        title={STEPS[step]!.title}
        description={STEPS[step]!.hint}
        meta={
          <span>
            Step {step + 1} of {STEPS.length} · your draft saves as you go
          </span>
        }
        actions={
          <Button type="button" variant="ghost" onClick={discard} disabled={busy}>
            Discard draft
          </Button>
        }
      />

      <StepTabs step={step} disabled={busy} onStep={goToStep} />

      <div className="ef-detail">
        <section className="ef-panel ef-detail__main">
          <div className="ef-panel__body min-h-70">
            <div className="flex h-full flex-col gap-4">{stepBody()}</div>
          </div>
        </section>
        <aside className="ef-detail__aside">
          <ShopperPreview draft={draft} path={form.data?.path ?? null} imageUrl={imageUrl} />
        </aside>
      </div>

      {formError ? (
        <div role="alert" className="ef-alert ef-alert--destructive">
          <CircleAlert aria-hidden="true" />
          <div className="ef-alert__title">{formError}</div>
        </div>
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

      <div className="actionbar">
        <div className="actionbar__text">
          <div className="actionbar__title">{last ? "Ready to send to Effy" : `Next: ${STEPS[step + 1]!.title}`}</div>
          <div className="actionbar__desc">
            {last ? "It goes on sale once Effy approves it." : "Your draft saves as you go."}
          </div>
        </div>
        <div className="actionbar__actions">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => goToStep(step - 1)} disabled={busy}>
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          ) : null}
          {last ? (
            <Button type="button" onClick={() => void publish()} disabled={busy || missing.length > 0}>
              {busy ? "Submitting…" : "Submit for review"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={next}
              disabled={!advanceable && step !== SIZES_STEP && step !== DETAILS_STEP}
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </Page>
  )
}
