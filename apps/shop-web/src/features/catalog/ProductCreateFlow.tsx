import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Box, CupSoda, type LucideIcon, Package, SprayCan, UtensilsCrossed } from "lucide-react";

import type { CreateProductRequest } from "@effy/shared-types";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { Crumbs, MicroLabel, Page } from "@/components/console/primitives";

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
import { uploadProductMedia } from "./repo";
import {
  attributeErrors,
  attributesValid,
  basicsComplete,
  collectAttributeInputs,
  isValidPrice,
} from "./validation";

/**
 * The schema-driven, four-step create flow (FR-011/FR-012).
 *
 * Container: a `Dialog` on desktop, a bottom `Sheet` on mobile-web — same body, so the whole flow is
 * usable desktop→phone (DOCTRINE-2: no cards anywhere; sectioned rows only).
 *
 * ── Media ordering decision (create-then-attach) ─────────────────────────────────────────────────
 * The presign endpoint is `POST /shop/v1/products/{id}/media` — it REQUIRES an existing product id,
 * so a storageKey cannot be obtained before the product row exists. Therefore publish is:
 *     1. POST /shop/v1/products  → product created (draft), returns its id
 *     2. presign → PUT to S3 → register the chosen image as the primary media (uploadProductMedia)
 * "Primary image mandatory at creation" (FR) is enforced HERE in the UI — the flow blocks publish
 * until an image is chosen — and completed atomically inside the publish action. If step 2 fails, the
 * created draft is left recoverable rather than orphaned. (The alternative, attach-then-create via
 * `CreateProductRequest.media[]`, is not reachable because presign needs a product id.)
 */
export interface ProductCreateFlowProps {
  /** Where "Discard" and the breadcrumb return to. */
  onCancel: () => void;
  /** Called once the product is created and its image uploaded. */
  onCreated: (productId: string) => void;
}

// Image is its own dedicated step, at step 3 — right after Basics (FR-010b / research R16).
const STEP_TITLES = ["Product type", "Basics", "Image", "Details", "Review"] as const;

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

  // Restore the device-local draft when the flow opens (FR-012). The image `File` cannot be revived
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

  // ⚠ Revoked on change, or every re-pick leaks a blob URL for the life of the tab.
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
  // its own step) must be met (FR-010b/FR-011).
  const canAdvance =
    step === 0
      ? !!selectedType
      : step === 1
        ? basicsComplete(draft)
        : step === 2
          ? !!imageFile
          : step === 3
            ? !!selectedType && attributesValid(selectedType, draft.attributes)
            : true;

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
      const body: CreateProductRequest = {
        productTypeId: selectedType.id,
        primaryCategoryId: draft.primaryCategoryId,
        name: draft.name.trim(),
        priceAmount: draft.priceAmount.trim(),
        shortDescription: draft.shortDescription.trim(),
        brand: draft.brand.trim() || null,
        sku: draft.sku.trim() || null,
        longDescription: draft.longDescription.trim() || null,
        // ⚠ Omitted when blank, NOT sent as 0. An unanswered weight must record the platform's stated
        // assumption; a zero would ship free and nothing downstream would notice (FR-037).
        weightGrams: draft.weightGrams.trim() ? Number(draft.weightGrams.trim()) : null,
        attributes: collectAttributeInputs(selectedType, draft.attributes),
      };
      // 1) create the product row, 2) attach the primary image (see ordering note above).
      const product = await createProduct.mutateAsync(body);
      setUploadProgress(0);
      await uploadProductMedia(product.id, imageFile, {
        isPrimary: true,
        onProgress: setUploadProgress,
      });

      track({ name: "product_created", productId: product.id });
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
        <p className="text-muted-foreground text-sm">Loading catalog…</p>
      ) : step === 0 ? (
        <TypeStep
          types={schema.data.productTypes}
          selectedId={draft.productTypeId}
          onSelect={(id) => update({ productTypeId: id })}
        />
      ) : step === 1 ? (
        <BasicsStep draft={draft} categories={orderedCategories} onField={update} />
      ) : step === 2 ? (
        <ImageDropzone file={imageFile} onChange={setImageFile} disabled={busy} />
      ) : step === 3 ? (
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
    "Pick what kind of product this is. The type decides which details you are asked for next.",
    "The essentials a shopper sees, and the weight delivery is priced on.",
    "One photograph. It is what the product looks like everywhere on the storefront.",
    "The details this product type asks for. Required ones are marked.",
    "Check it over. Nothing is published until you press Publish.",
  ] as const;

  return (
    <Page className="gap-6">
      <Crumbs parent="Catalog" onParent={onCancel} current="New product" />

      {/* The imported design's wizard is a PAGE, not a dialog: two columns, the form on the left and
          a progress rail with a live preview on the right. A modal cannot show the preview, and it
          cannot show which steps remain without stealing room from the form. */}
      <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="grid min-w-0 gap-6">
          <div className="grid gap-[5px]">
            <MicroLabel>
              Step {step + 1} of {STEP_TITLES.length}
            </MicroLabel>
            <h2 className="text-[18px] font-semibold tracking-[-.02em]">{STEP_TITLES[step]}</h2>
            <p className="text-muted-foreground max-w-[60ch] text-[13.5px] leading-[1.6]">
              {STEP_HINTS[step]}
            </p>
          </div>

          <div className="bg-border h-px" />

          <div className="min-h-[280px]">{body}</div>

          <div className="border-border flex items-center justify-between gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={discard} disabled={busy}>
              Discard
            </Button>
            <div className="flex gap-2">
              {step > 0 ? (
                <Button type="button" variant="outline" onClick={() => goToStep(step - 1)} disabled={busy}>
                  Back
                </Button>
              ) : null}
              {step < STEP_TITLES.length - 1 ? (
                <Button type="button" onClick={() => goToStep(step + 1)} disabled={!canAdvance}>
                  Next
                </Button>
              ) : (
                <Button type="button" onClick={() => void publish()} disabled={busy}>
                  {busy ? "Publishing…" : "Publish"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <aside className="grid min-w-0 gap-[22px]">
          <div className="grid gap-3">
            <MicroLabel>Progress</MicroLabel>
            {STEP_TITLES.map((label, i) => {
              const done = i < step;
              const active = i === step;
              // ⚠ Only a COMPLETED step is clickable. Jumping forward into Review over an unvalidated
              // Basics form is exactly what `canAdvance` exists to prevent, and a freely clickable
              // rail would route straight around it.
              const reachable = i <= step;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!reachable || busy}
                  onClick={() => goToStep(i)}
                  aria-current={active ? "step" : undefined}
                  className="border-border flex w-full items-center gap-2.5 border-b pb-3 text-left enabled:cursor-pointer disabled:cursor-default"
                >
                  <span
                    aria-hidden="true"
                    className={
                      "border-border grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-medium " +
                      (done || active
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground")
                    }
                  >
                    {done ? "\u2713" : i + 1}
                  </span>
                  <span
                    className={
                      "min-w-0 flex-1 text-[13px] " +
                      (active ? "text-foreground font-medium" : "text-muted-foreground")
                    }
                  >
                    {label}
                  </span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {done ? "Done" : active ? "Now" : ""}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ⚠ The live preview. It shows only what the operator has actually entered — an empty
              draft reads "Untitled product", never invented sample text. */}
          <div className="grid gap-3">
            <MicroLabel>Preview</MicroLabel>
            <div className="flex items-center gap-3">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt=""
                  className="border-border size-11 shrink-0 rounded-md border object-cover"
                />
              ) : (
                <div className="border-border bg-muted size-11 shrink-0 rounded-md border" />
              )}
              <div className="grid min-w-0 gap-[3px]">
                <div className="truncate text-[13.5px] font-medium">
                  {draft.name.trim() || "Untitled product"}
                </div>
                <div className="text-muted-foreground truncate font-mono text-xs">
                  {draft.sku.trim() || "no SKU"}
                </div>
              </div>
            </div>
            <div className="border-border flex justify-between gap-4 border-t pt-2.5 text-[13px]">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium tabular-nums">{draft.priceAmount.trim() || "—"}</span>
            </div>
            <div className="flex justify-between gap-4 text-[13px]">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{selectedType?.name ?? "—"}</span>
            </div>
          </div>
        </aside>
      </div>

      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {formError}
        </p>
      ) : null}
    </Page>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────────────────────

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
      {/* A selectable option grid (radio-card) that FILLS the content area like a dialpad:
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
                "flex h-full min-h-28 flex-col items-center justify-center gap-3 rounded-lg border p-4 text-center transition-colors",
                "hover:border-primary/60 hover:bg-muted/40",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border",
              )}
            >
              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-full transition-colors",
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
                  <span className="mt-1 block text-xs text-muted-foreground">{t.description}</span>
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
          Name<span className="ml-0.5 text-destructive">*</span>
        </Label>
        <Input
          id="p-name"
          value={draft.name}
          onChange={(e) => onField({ name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-category">
          Category<span className="ml-0.5 text-destructive">*</span>
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="p-price">
            Price<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Input
            id="p-price"
            inputMode="decimal"
            placeholder="0.00"
            value={draft.priceAmount}
            onChange={(e) => onField({ priceAmount: e.target.value })}
          />
          {draft.priceAmount && !isValidPrice(draft.priceAmount) ? (
            <p className="text-xs text-destructive">Enter a positive amount (e.g. 4.99).</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-brand">Brand (optional)</Label>
          <Input
            id="p-brand"
            value={draft.brand}
            onChange={(e) => onField({ brand: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-sku">SKU (optional)</Label>
        <Input id="p-sku" value={draft.sku} onChange={(e) => onField({ sku: e.target.value })} />
      </div>

      {/* ⚠ Shipping weight (032, FR-036a). Optional, but the help text says what happens when it is
          left blank — an operator who does not know that a default is recorded cannot tell later
          which of their products were guessed at. */}
      <div className="space-y-2">
        <Label htmlFor="p-weight">Shipping weight (optional)</Label>
        <Input
          id="p-weight"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={draft.weightGrams}
          onChange={(e) => onField({ weightGrams: e.target.value })}
          aria-describedby="p-weight-help"
        />
        <p id="p-weight-help" className="text-sm text-muted-foreground">
          In <strong>grams</strong>, including packaging — delivery is priced partly on weight. Leave
          blank and we record an assumed weight you can correct later.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="p-short">
          Short description<span className="ml-0.5 text-destructive">*</span>
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
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${uploadProgress}%` }}
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
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
      <dd>{draft.priceAmount || "—"}</dd>
      {draft.brand ? (
        <>
          <dt className="text-muted-foreground">Brand</dt>
          <dd>{draft.brand}</dd>
        </>
      ) : null}
      {draft.sku ? (
        <>
          <dt className="text-muted-foreground">SKU</dt>
          <dd>{draft.sku}</dd>
        </>
      ) : null}
      <dt className="text-muted-foreground">Shipping weight</dt>
      <dd>{draft.weightGrams.trim() ? `${draft.weightGrams.trim()} g` : "assumed"}</dd>
      <dt className="text-muted-foreground">Description</dt>
      <dd>{draft.shortDescription || "—"}</dd>
      </dl>
    </div>
  );
}

