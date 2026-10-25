import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Box,
  Check,
  CircleAlert,
  CupSoda,
  Image as ImageIcon,
  type LucideIcon,
  Package,
  SprayCan,
  UtensilsCrossed,
} from "lucide-react";

import type { GstStatus, CreateProductRequest } from "@effy/shared-types";
import { GST_STATUS_WORDS } from "@effy/shared-types";
import {
  Button,
  Skeleton,
  Input,
  Label,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";
import { PageHeader } from "@effy/web-kit/patterns";

import { Page } from "@/components/console/primitives";

import { meQuery } from "@/features/shop-identity/queries";
import { sessionQuery } from "@/features/auth/queries";
import { track } from "@/lib/telemetry";

import { cn } from "@/lib/utils";

import { AttributeField } from "./AttributeField";
import { ImageDropzone } from "./ImageDropzone";
import { orderCategories } from "./categories";
import {
  clearDraft,
  emptyDraft,
  loadDraft,
  saveDraft,
  type AttributeDraftValue,
  type ProductDraft,
} from "./draft";
import { productMutationError } from "./errorText";
import type { Category, ProductType } from "./model";
import { catalogSchemaQuery, useCreateProduct } from "./queries";
import { submitProductForReview, uploadProductMedia } from "./repo";
import {
  attributeErrors,
  attributesValid,
  basicsComplete,
  collectAttributeInputs,
} from "./validation";
import { VariantEditor } from "./VariantEditor";
import { shopPriceSummary, toInputs, variantSetErrors, variantSetValid } from "./variants";

/**
 * The schema-driven, four-step create flow.
 *
 * Container: a `Dialog` on desktop, a bottom `Sheet` on mobile-web — same body, so the whole flow is
 * usable desktop→phone (doctrine-2: no cards anywhere; sectioned rows only).
 *
 * Media ordering decision (create-then-attach)
 * The presign endpoint is `POST /shop/v1/products/{id}/media` — it requires an existing product id,
 * so a storageKey cannot be obtained before the product row exists. Therefore publish is:
 *  1. POST /shop/v1/products → product created (draft), returns its id
 *  2. presign → PUT to S3 → register the chosen image as the primary media (uploadProductMedia)
 * "Primary image mandatory at creation" (FR) is enforced here in the UI — the flow blocks publish
 * until an image is chosen — and completed atomically inside the publish action. If step 2 fails, the
 * created draft is left recoverable rather than orphaned. (The alternative, attach-then-create via
 * `CreateProductRequest.media[]`, is not reachable because presign needs a product id.)
 */
export interface ProductCreateFlowProps {
  /** Where "Discard" returns to. */
  onCancel: () => void;
  /** Called once the product is created and its image uploaded. */
  onCreated: (productId: string) => void;
}

// Image is its own dedicated step, after Basics. 098 — "Sizes & prices" sits
// between them: what the product IS, then what it is sold AS, then what it looks like.
const STEP_TITLES = ["Product type", "Basics", "Sizes & prices", "Image", "Details", "Review"] as const;

export function ProductCreateFlow({ onCancel, onCreated }: ProductCreateFlowProps) {
  const schema = useQuery(catalogSchemaQuery);
  const createProduct = useCreateProduct();

  const { data: session } = useQuery(sessionQuery);
  const subject = session?.status === "signed-in" ? session.identity.subject : null;
  const { data: me } = useQuery(meQuery);
  const shopId = me?.shop?.id ?? null;

  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Restore the device-local draft when the flow opens. The image `File` cannot be revived
  // from storage, so it is re-picked; every text field returns.
  useEffect(() => {
    if (!shopId || !subject) return;
    setDraft(loadDraft(shopId, subject) ?? emptyDraft());
    setImageFile(null);
    setUploadProgress(null);
    setFormError(null);
    track({ name: "product_create_started" });
  }, [shopId, subject]);

  const selectedType: ProductType | undefined = useMemo(
    () => schema.data?.productTypes.find((t) => t.id === draft.productTypeId),
    [schema.data, draft.productTypeId],
  );
  const orderedCategories = useMemo(
    () => orderCategories(schema.data?.categories ?? []),
    [schema.data],
  );

  function persist(next: ProductDraft) {
    if (shopId && subject) saveDraft(shopId, subject, next);
  }
  function update(patch: Partial<ProductDraft>) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      persist(next);
      return next;
    });
  }
  function updateAttr(id: string, value: AttributeDraftValue) {
    setDraft((d) => {
      const next = { ...d, attributes: { ...d.attributes, [id]: value } };
      persist(next);
      return next;
    });
  }
  function goToStep(step: number) {
    update({ step });
  }

  // Revoked on change, or every re-pick leaks a blob URL for the life of the tab.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const step = draft.step;
  const attrErrors = selectedType ? attributeErrors(selectedType, draft.attributes) : {};

  // Step-advance gate — mandatory (universal + the type's mandatory attributes + the primary image on
  // its own step) must be met.
  const canAdvance =
    step === 0
      ? !!selectedType
      : step === 1
        ? basicsComplete(draft)
        : step === 2
          ? variantSetValid(draft.variantSet)
          : step === 3
            ? !!imageFile
            : step === 4
              ? !!selectedType && attributesValid(selectedType, draft.attributes)
              : true;
  // A cell's refusal shows once the operator has left that cell (the editor tracks it), and every
  // refusal shows once they press Next — never on rows they have not reached yet.
  const variantErrors = variantSetErrors(draft.variantSet);
  const [variantsAttempted, setVariantsAttempted] = useState(false);

  const busy = createProduct.isPending || uploadProgress != null;

  function discard() {
    if (shopId && subject) clearDraft(shopId, subject);
    setDraft(emptyDraft());
    setImageFile(null);
    setUploadProgress(null);
    setFormError(null);
    onCancel();
  }

  async function publish() {
    if (!selectedType || !draft.primaryCategoryId || !imageFile) return;
    setFormError(null);
    try {
      // The product and its variants are created together. A blank weight is sent as null,
      // not 0: an unanswered weight records the platform's stated assumption.
      const set = toInputs(draft.variantSet);
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
      };
      // 1) create the product row, 2) attach the primary image (see ordering note above).
      const product = await createProduct.mutateAsync(body);
      setUploadProgress(0);
      await uploadProductMedia(product.id, imageFile, {
        isPrimary: true,
        onProgress: setUploadProgress,
      });

      track({ name: "product_created", productId: product.id });
      track({ name: "product_variants_saved", productId: product.id, variantCount: set.variants.length });
      // The wizard's last button sends the finished product to Effy. A failed submit is not A
      // failed create: the product exists as a draft with its image, so the shop lands on it and
      // submits from there rather than being told nothing was saved.
      try {
        await submitProductForReview(product.id);
        track({ name: "product_submitted_for_review", productId: product.id });
      } catch {
        /* stays a draft; its page offers "Submit for review" and says what is missing */
      }
      if (shopId && subject) clearDraft(shopId, subject);
      setDraft(emptyDraft());
      setImageFile(null);
      setUploadProgress(null);
      onCreated(product.id);
    } catch (err) {
      setUploadProgress(null);
      setFormError(productMutationError(err));
    }
  }

  const body = (
    <div className="flex h-full flex-col gap-4">
      {schema.isError ? (
        <ErrorState error={schema.error} onRetry={() => void schema.refetch()} />
      ) : schema.isPending ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading catalog"><Skeleton className="h-14 w-full rounded-lg" /><Skeleton className="h-14 w-full rounded-lg" /><Skeleton className="h-14 w-2/3 rounded-lg" /></div>
      ) : step === 0 ? (
        <TypeStep
          types={schema.data.productTypes}
          selectedId={draft.productTypeId}
          onSelect={(id) => update({ productTypeId: id })}
        />
      ) : step === 1 ? (
        <BasicsStep draft={draft} categories={orderedCategories} onField={update} />
      ) : step === 2 ? (
        <VariantEditor
          value={draft.variantSet}
          onChange={(variantSet) => update({ variantSet })}
          errors={variantErrors}
          showErrors={variantsAttempted}
          disabled={busy}
        />
      ) : step === 3 ? (
        <ImageDropzone file={imageFile} onChange={setImageFile} disabled={busy} />
      ) : step === 4 ? (
        <AttributesStep
          type={selectedType}
          values={draft.attributes}
          errors={attrErrors}
          onChange={updateAttr}
        />
      ) : (
        <ReviewStep
          draft={draft}
          type={selectedType}
          categories={orderedCategories}
          imageFile={imageFile}
          uploadProgress={uploadProgress}
        />
      )}
    </div>
  );

  const STEP_HINTS = [
    "Choose the kind of product, which decides the details you fill in next.",
    "The name, description and category shoppers see when they find this product.",
    "Set the price, or add options such as size and price each one.",
    "Add one photo, used for this product everywhere customers see it.",
    "Fill in the details this product type needs; required ones are marked.",
    "Check everything, then submit; it goes on sale once Effy approves it.",
  ] as const;

  const last = step === STEP_TITLES.length - 1;

  return (
    <Page>
      {/* A page, not a dialog: the steps across the top, the form beside a live preview of how the
          product will look on the storefront, and the next step pinned under the thumb. */}
      <PageHeader
        title={STEP_TITLES[step]}
        description={STEP_HINTS[step]}
        meta={
          <span>
            Step {step + 1} of {STEP_TITLES.length} · your draft saves as you go
          </span>
        }
        actions={
          <Button type="button" variant="ghost" onClick={discard} disabled={busy}>
            Discard draft
          </Button>
        }
      />

      <nav aria-label="Steps" className="bo-tabs">
        {STEP_TITLES.map((label, i) => {
          const done = i < step;
          const active = i === step;
          // Only a completed step is reachable. Jumping forward over an unvalidated form is exactly
          // what `canAdvance` exists to prevent, and freely clickable steps would route around it.
          const reachable = i <= step;
          return (
            <button
              key={label}
              type="button"
              disabled={!reachable || busy}
              onClick={() => goToStep(i)}
              aria-current={active ? "step" : undefined}
              className={cn("bo-tabs__tab disabled:cursor-default", active && "is-active")}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "bo-tabs__count",
                  done && "bo-tabs__count--primary",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              {label}
              <span className="sr-only">{done ? " (done)" : active ? " (now)" : ""}</span>
            </button>
          );
        })}
      </nav>

      <div className="bo-detail">
        <section className="bo-panel bo-detail__main">
          <div className="bo-panel__body min-h-[280px]">{body}</div>
        </section>

        {/* The live preview. It shows only what the operator has entered — an empty draft reads
            "Untitled product", never invented sample text. */}
        <aside className="bo-detail__aside">
          <section className="bo-panel">
            <div className="bo-panel__head">
              <div className="min-w-0 flex-1">
                <h2 className="bo-panel__title">How shoppers see it</h2>
                <p className="bo-panel__desc">Sold under Effy&apos;s name. Shoppers never see which shop supplies it.</p>
              </div>
            </div>
            <div className="bo-panel__body grid gap-3">
              {previewUrl ? (
                <img src={previewUrl} alt="" className="aspect-square w-full rounded-lg border border-border object-cover" />
              ) : (
                <div className="bo-img aspect-square w-full rounded-lg">
                  <ImageIcon aria-hidden="true" />
                </div>
              )}
              <div className="grid gap-0.5">
                {draft.brand?.trim() ? <div className="text-sm text-muted-foreground">{draft.brand}</div> : null}
                <div className="text-lg font-semibold">{draft.name.trim() || "Untitled product"}</div>
              </div>
              <dl className="bo-dl bo-dl--tight">
                <div className="bo-dl__row">
                  <dt>Sold as</dt>
                  <dd>{draft.variantSet.variants.length === 1 ? "One size" : `${draft.variantSet.variants.length} sizes`}</dd>
                </div>
                <div className="bo-dl__row">
                  <dt>Your price</dt>
                  <dd className="tabular-nums">{previewPrice(draft)}</dd>
                </div>
                <div className="bo-dl__row">
                  <dt>Type</dt>
                  <dd>{selectedType?.name ?? "—"}</dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">Customers&apos; price is set by Effy when approved.</p>
            </div>
          </section>
        </aside>
      </div>

      {formError ? (
        <div role="alert" className="bo-alert bo-alert--destructive">
          <CircleAlert aria-hidden="true" />
          <div className="bo-alert__title">{formError}</div>
        </div>
      ) : null}

      <div className="sh-actionbar">
        <div className="sh-actionbar__text">
          <div className="sh-actionbar__title">{last ? "Ready to send to Effy" : `Next: ${STEP_TITLES[step + 1]}`}</div>
          <div className="sh-actionbar__desc">
            {last ? "It goes on sale once Effy approves it." : "Your draft saves as you go."}
          </div>
        </div>
        <div className="sh-actionbar__actions">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => goToStep(step - 1)} disabled={busy}>
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          ) : null}
          {!last ? (
            <Button
              type="button"
              onClick={() => {
                // The sizes step says what is missing instead of greying Next out with no reason.
                if (step === 2 && !canAdvance) setVariantsAttempted(true);
                else goToStep(step + 1);
              }}
              disabled={!canAdvance && step !== 2}
            >
              Next
            </Button>
          ) : (
            <Button type="button" onClick={() => void publish()} disabled={busy}>
              {busy ? "Submitting…" : "Submit for review"}
            </Button>
          )}
        </div>
      </div>
    </Page>
  );
}

// Steps

// Map a (back-office-defined) product type to an icon by matching its slug/name. Types are dynamic,
// so this is a best-effort visual cue with a neutral fallback — never a hard dependency.
const TYPE_ICONS: { match: RegExp; icon: LucideIcon }[] = [
  { match: /food|meal|prepared|deli|kitchen|bakery|snack/i, icon: UtensilsCrossed },
  { match: /beverage|drink|juice|water|coffee|tea|soda/i, icon: CupSoda },
  { match: /grocery|packaged|pantry|canned|chilled|frozen/i, icon: Package },
  { match: /household|clean|home|paper|non-food/i, icon: SprayCan },
];
function iconForType(t: ProductType): LucideIcon {
  const hay = `${t.key} ${t.name}`;
  return TYPE_ICONS.find((m) => m.match.test(hay))?.icon ?? Box;
}

function TypeStep({
  types,
  selectedId,
  onSelect,
}: {
  types: ProductType[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (types.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No product types are available yet. Ask the back office to define one.
      </p>
    );
  }
  // Alphabetical order, and a square-ish grid whose column count follows the card count
  // (ceil(√n): 2→2, 3–4→2×2, 5–9→3×3, 10–16→4×4, …). Dynamic, so the template is an inline style
  // (Tailwind can't emit a class it can't see at build time).
  const sorted = [...types].sort((a, b) => a.name.localeCompare(b.name));
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <p className="shrink-0 text-sm text-muted-foreground">Pick what kind of product this is.</p>
      {/* A selectable option grid (radio-card) that fills the content area like a dialpad:
          equal-height rows (auto-rows-fr) grow to occupy the whole space; each cell is one click. */}
      {/* p-1 keeps the tile borders + selected ring off the scroll box's clip edge (overflow-y-auto
          also clips the x-axis), so no side looks shaved. */}
      <div
        className="grid min-h-0 flex-1 auto-rows-fr gap-3 overflow-y-auto p-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {sorted.map((t) => {
          const Icon = iconForType(t);
          const selected = selectedId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={selected}
              className={cn(
                // A choice is a full-width card, ringed in blue when chosen (Foundations).
                "flex h-full min-h-32 flex-col items-center justify-center gap-3 rounded-lg border bg-background p-4 text-center transition-colors",
                "hover:bg-[var(--row-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected ? "border-primary ring-1 ring-primary" : "border-border",
              )}
            >
              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-lg transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium leading-tight">{t.name}</span>
                {t.description ? (
                  <span className="mt-1 block text-sm text-muted-foreground">{t.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BasicsStep({
  draft,
  categories,
  onField,
}: {
  draft: ProductDraft;
  categories: { category: Category; depth: number }[];
  onField: (patch: Partial<ProductDraft>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="p-name">
          Name<span className="ml-0.5 text-muted-foreground">*</span>
        </Label>
        <Input
          id="p-name"
          value={draft.name}
          onChange={(e) => onField({ name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-category">
          Category<span className="ml-0.5 text-muted-foreground">*</span>
        </Label>
        <Select
          value={draft.primaryCategoryId ?? ""}
          onValueChange={(v) => onField({ primaryCategoryId: v })}
        >
          <SelectTrigger id="p-category">
            <SelectValue placeholder="Choose a category…" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(({ category, depth }) => (
              <SelectItem key={category.id} value={category.id}>
                {`${" ".repeat(depth * 2)}${category.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-brand">Brand (optional)</Label>
        <Input
          id="p-brand"
          value={draft.brand}
          onChange={(e) => onField({ brand: e.target.value })}
        />
      </div>

      {/* Every product is taxable or GST-free; it decides what a customer's tax invoice says. */}
      <div className="space-y-2">
        <Label htmlFor="p-gst">
          GST<span className="ml-0.5 text-muted-foreground">*</span>
        </Label>
        <Select value={draft.gstStatus} onValueChange={(v) => onField({ gstStatus: v as GstStatus })}>
          <SelectTrigger id="p-gst" aria-describedby="p-gst-help">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gst_free">{GST_STATUS_WORDS.gst_free}</SelectItem>
            <SelectItem value="taxable">{GST_STATUS_WORDS.taxable}</SelectItem>
          </SelectContent>
        </Select>
        <p id="p-gst-help" className="text-sm text-muted-foreground">
          Most basic food is GST-free; prepared food, drinks other than milk and water, and household goods
          are usually taxable. If you're not sure, ask your accountant — Effy reviews it.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-short">
          Short description<span className="ml-0.5 text-muted-foreground">*</span>
        </Label>
        <Textarea
          id="p-short"
          value={draft.shortDescription}
          onChange={(e) => onField({ shortDescription: e.target.value })}
        />
      </div>
    </div>
  );
}

function AttributesStep({
  type,
  values,
  errors,
  onChange,
}: {
  type: ProductType | undefined;
  values: Record<string, AttributeDraftValue>;
  errors: Record<string, string>;
  onChange: (id: string, value: AttributeDraftValue) => void;
}) {
  if (!type) return null;
  if (type.attributes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This product type has no extra details to fill in.
      </p>
    );
  }

  // Group by the back-office `groupLabel`, preserving display order within each group.
  const groups = new Map<string, ProductType["attributes"]>();
  for (const attr of [...type.attributes].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const key = attr.groupLabel ?? "";
    const list = groups.get(key) ?? [];
    list.push(attr);
    groups.set(key, list);
  }

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([groupLabel, attrs]) => (
        <section key={groupLabel || "_"} className="space-y-4">
          {groupLabel ? (
            <h3 className="text-sm font-semibold text-muted-foreground">{groupLabel}</h3>
          ) : null}
          {attrs.map((attr) => (
            <AttributeField
              key={attr.attributeId}
              attr={attr}
              value={values[attr.attributeId]}
              error={errors[attr.attributeId]}
              onChange={(next) => onChange(attr.attributeId, next)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function ReviewStep({
  draft,
  type,
  categories,
  imageFile,
  uploadProgress,
}: {
  draft: ProductDraft;
  type: ProductType | undefined;
  categories: { category: Category; depth: number }[];
  imageFile: File | null;
  uploadProgress: number | null;
}) {
  const categoryName =
    categories.find((c) => c.category.id === draft.primaryCategoryId)?.category.name ?? "—";

  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!imageFile) {
      setThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt="Primary product"
            className="size-20 shrink-0 rounded-md border object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <p className="truncate font-medium">{draft.name || "Untitled product"}</p>
          <p className="text-sm text-muted-foreground">{type?.name ?? "—"}</p>
        </div>
      </div>

      {uploadProgress != null ? (
        <div className="space-y-1">
          {/* The shared Progress primitive — an in-flight upload is brand, the work-in-progress
              tone. It was a hand-rolled bar with its own aria; one component means one bar on the
              platform and one place for its height, radius and roles to live. */}
          <Progress value={uploadProgress} tone="brand" height={6} label="Image upload" />
          <p className="text-xs text-muted-foreground">Uploading image… {uploadProgress}%</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-foreground">Type</dt>
      <dd>{type?.name ?? "—"}</dd>
      <dt className="text-muted-foreground">Name</dt>
      <dd>{draft.name || "—"}</dd>
      <dt className="text-muted-foreground">Category</dt>
      <dd>{categoryName}</dd>
      <dt className="text-muted-foreground">Price</dt>
      <dd>{previewPrice(draft)}</dd>
      <dt className="text-muted-foreground">Variants</dt>
      <dd>{draft.variantSet.variants.length}</dd>
      {draft.brand ? (
        <>
          <dt className="text-muted-foreground">Brand</dt>
          <dd>{draft.brand}</dd>
        </>
      ) : null}

      <dt className="text-muted-foreground">GST</dt>
      <dd>{draft.gstStatus ? GST_STATUS_WORDS[draft.gstStatus] : "—"}</dd>
      <dt className="text-muted-foreground">Description</dt>
      <dd>{draft.shortDescription || "—"}</dd>
      </dl>
    </div>
  );
}


/** "3.20", or "From 3.20" when the variants differ — what the shop typed, no margin. */
function previewPrice(draft: ProductDraft): string {
  const priced = draft.variantSet.variants.filter((r) => /^\d+(\.\d{1,2})?$/.test(r.shopPriceAmount.trim()));
  if (priced.length === 0) return "—";
  const s = shopPriceSummary({ variants: priced.map((r) => ({ state: "active", shopPriceAmount: r.shopPriceAmount.trim() })) as never });
  return s.amount ? `${s.varies ? "From " : ""}${s.amount}` : "—";
}
