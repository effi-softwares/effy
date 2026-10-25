import { useEffect, useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, CircleAlert } from "lucide-react"

import type { CreateProductRequest, GstStatus } from "@effy/shared-types"
import { Button, Skeleton } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { PageHeader } from "@effy/web-kit/patterns"

import { Page } from "@/components/console/primitives"
import { sessionQuery } from "@/features/auth/queries"
import { meQuery } from "@/features/shop-identity/queries"
import { track } from "@/lib/telemetry"
import { useObjectUrl } from "@/lib/useObjectUrl"

import { orderCategories } from "./categories"
import { AttributesStep } from "./create/AttributesStep"
import { BasicsStep } from "./create/BasicsStep"
import { ReviewStep } from "./create/ReviewStep"
import { ShopperPreview } from "./create/ShopperPreview"
import { StepTabs } from "./create/StepTabs"
import { canAdvance, SIZES_STEP, STEPS } from "./create/steps"
import { TypeStep } from "./create/TypeStep"
import { clearDraft, emptyDraft, loadDraft, saveDraft, type ProductDraft } from "./draft"
import { productMutationError } from "./errorText"
import { ImageDropzone } from "./ImageDropzone"
import { catalogSchemaQuery, useCreateProduct } from "./queries"
import { submitProductForReview, uploadProductMedia } from "./repo"
import { attributeErrors, collectAttributeInputs } from "./validation"
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
  const schema = useQuery(catalogSchemaQuery)
  const createProduct = useCreateProduct()

  const [draft, setDraft] = useState<ProductDraft>(() => loadDraft(shopId, subject) ?? emptyDraft())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [variantsAttempted, setVariantsAttempted] = useState(false)
  const imageUrl = useObjectUrl(imageFile)

  useEffect(() => {
    track({ name: "product_create_started" })
  }, [])

  const selectedType = useMemo(
    () => schema.data?.productTypes.find((t) => t.id === draft.productTypeId),
    [schema.data, draft.productTypeId],
  )
  const categories = useMemo(() => orderCategories(schema.data?.categories ?? []), [schema.data])

  function change(next: (d: ProductDraft) => ProductDraft) {
    setDraft((d) => {
      const updated = next(d)
      saveDraft(shopId, subject, updated)
      return updated
    })
  }
  const update = (patch: Partial<ProductDraft>) => change((d) => ({ ...d, ...patch }))
  const goToStep = (step: number) => update({ step })

  const { step } = draft
  const last = step === STEPS.length - 1
  const advanceable = canAdvance(step, draft, selectedType, !!imageFile)
  const busy = createProduct.isPending || uploadProgress != null

  function discard() {
    clearDraft(shopId, subject)
    onCancel()
  }

  function next() {
    if (step === SIZES_STEP && !advanceable) setVariantsAttempted(true)
    else goToStep(step + 1)
  }

  async function publish() {
    if (!selectedType || !draft.primaryCategoryId || !imageFile) return
    setFormError(null)
    try {
      const set = toInputs(draft.variantSet)
      const body: CreateProductRequest = {
        productTypeId: selectedType.id,
        primaryCategoryId: draft.primaryCategoryId,
        name: draft.name.trim(),
        shortDescription: draft.shortDescription.trim(),
        brand: draft.brand.trim() || null,
        longDescription: draft.longDescription.trim() || null,
        gstStatus: draft.gstStatus as GstStatus,
        attributes: collectAttributeInputs(selectedType, draft.attributes),
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
    if (schema.isError) return <ErrorState error={schema.error} onRetry={() => void schema.refetch()} />
    if (schema.isPending) return <LoadingBlock />
    switch (step) {
      case 0:
        return (
          <TypeStep
            types={schema.data.productTypes}
            selectedId={draft.productTypeId}
            onSelect={(id) => update({ productTypeId: id })}
          />
        )
      case 1:
        return <BasicsStep draft={draft} categories={categories} onField={update} />
      case 2:
        return (
          <VariantEditor
            value={draft.variantSet}
            onChange={(variantSet) => update({ variantSet })}
            errors={variantSetErrors(draft.variantSet)}
            showErrors={variantsAttempted}
            disabled={busy}
          />
        )
      case 3:
        return <ImageDropzone file={imageFile} onChange={setImageFile} disabled={busy} />
      case 4:
        return (
          <AttributesStep
            type={selectedType}
            values={draft.attributes}
            errors={selectedType ? attributeErrors(selectedType, draft.attributes) : {}}
            onChange={(id, value) => change((d) => ({ ...d, attributes: { ...d.attributes, [id]: value } }))}
          />
        )
      default:
        return (
          <ReviewStep
            draft={draft}
            type={selectedType}
            categories={categories}
            imageUrl={imageUrl}
            uploadProgress={uploadProgress}
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
          <div className="ef-panel__body min-h-[280px]">
            <div className="flex h-full flex-col gap-4">{stepBody()}</div>
          </div>
        </section>
        <aside className="ef-detail__aside">
          <ShopperPreview draft={draft} type={selectedType} imageUrl={imageUrl} />
        </aside>
      </div>

      {formError ? (
        <div role="alert" className="ef-alert ef-alert--destructive">
          <CircleAlert aria-hidden="true" />
          <div className="ef-alert__title">{formError}</div>
        </div>
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
            <Button type="button" onClick={() => void publish()} disabled={busy}>
              {busy ? "Submitting…" : "Submit for review"}
            </Button>
          ) : (
            <Button type="button" onClick={next} disabled={!advanceable && step !== SIZES_STEP}>
              Next
            </Button>
          )}
        </div>
      </div>
    </Page>
  )
}
