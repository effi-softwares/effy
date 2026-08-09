-- 042-storefront-home-composer — the operator-authored home page (US1).
--
-- The storefront's home page is composed in CODE: its top-to-bottom order is a hardcoded sequence in
-- `composeSections()` and the hero's words are literals inside a component. This table is that page
-- expressed as data, so a member of back-office staff can change it without a developer and a deploy.
--
-- ⚠ TWO BODIES AND NO HISTORY, AND THAT IS THE HIGHEST-LEVERAGE DECISION IN THE FEATURE.
--
-- Schema evolution across historical revisions is the hardest problem in block systems — Wagtail
-- needed a dedicated migration framework for it and Gutenberg needed a `deprecated` sub-framework.
-- Because only `draft` and `published` ever exist here, a change to a block's shape touches at most
-- TWO ROWS and is reachable by a single forward migration. Adding a revision history later re-opens
-- that problem; do it deliberately, not by accident (research R3).
--
-- ⚠ STRUCTURED INTENT, NEVER MARKUP. `jsonb` holds `[{id, type, hidden, props}]` — no HTML, no CSS,
-- no inline styles. Adobe Commerce persists XHTML and its own React client must re-parse it. For this
-- platform the choice is forced rather than preferred: two of six surfaces are Compose Multiplatform,
-- so storing markup would make mobile parity unbuildable (research R2).
--
-- ⚠ THIS MIGRATION ONLY CREATES. The advertising facet on `promo_code` is dropped by a SEPARATE,
-- LATER migration — this one is committed and applied long before that decision is safe to take, and
-- Goose is forward-only with a commit-guard, so an applied migration is not an editable file.
--
-- Forward-only (003). The Down drops the table — dev-only, single-step.

-- +goose Up

-- ⚠ A SCHEMA-ENFORCED SINGLETON, following `public.order_policy`. One row, guaranteed by the primary
-- key rather than by everyone remembering to write `WHERE id = 1`. The scope is the storefront home;
-- a `page_key` column would be speculative generality for a page that does not exist, and adding one
-- later is a forward migration with a default rather than a redesign.
CREATE TABLE public.home_layout (
    singleton    boolean PRIMARY KEY DEFAULT true CHECK (singleton),

    -- The only editable body. Shoppers never see it.
    draft        jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- What shoppers see. Written only by a publish, which validates first.
    published    jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- ⚠ Optimistic concurrency (FR-017). Every mutating write is conditional on the revision the
    -- client last read and bumps it, so a second operator's publish cannot silently discard the
    -- first's work — it affects zero rows and is refused with a distinguishable conflict.
    revision     bigint NOT NULL DEFAULT 0,

    published_at timestamptz NULL,
    published_by text        NULL,   -- admin.staff cognito sub

    updated_at   timestamptz NOT NULL DEFAULT now(),
    updated_by   text        NULL,

    -- Both bodies must be arrays. A malformed body is refused by the service long before it reaches
    -- here, but the column should not be able to hold something the renderer cannot iterate.
    CONSTRAINT home_layout_draft_is_array     CHECK (jsonb_typeof(draft) = 'array'),
    CONSTRAINT home_layout_published_is_array CHECK (jsonb_typeof(published) = 'array')
);

COMMENT ON TABLE public.home_layout IS
    '042 — the storefront home page as an ordered list of blocks. Singleton. draft is editable; published is served.';

-- ⚠ SEEDED WITH TODAY'S PAGE, NOT LEFT EMPTY. An empty published layout renders the coherent minimal
-- page SC-013 requires, but it would also CHANGE THE STOREFRONT'S APPEARANCE the moment the renderer
-- goes live — which is not a migration's job. The seed is an explicit representation of what the page
-- renders now, so the switch from code-composed to data-composed is invisible to shoppers.
--
-- ⚠ THE HERO IS DELIBERATELY ABSENT FROM THIS SEED. Two heroes exist — a static one (currently
-- commented out of `page.tsx`) and a promotions-driven one (live) — and their comparison was never
-- concluded, so the `hero` block type has no agreed schema yet. Until that decision is taken, the
-- hero stays PAGE-LEVEL JSX outside the block list and the storefront keeps rendering it exactly as
-- it does today. Adding a hero block later is an UPDATE, not a migration.
--
-- ⚠ Block ids are literals rather than generated: this body is the historical record of what the page
-- looked like at the moment it became data, and a re-run of this migration on another environment
-- must produce the identical layout.
INSERT INTO public.home_layout (singleton, draft, published, revision, updated_by)
VALUES (
    true,
    -- draft starts identical to published, so an operator's first edit begins from what is live.
    '[
      {"id":"b_categories",  "type":"category_strip",  "props":{"title":"Shop by category","viewAllLabel":"View all categories"}},
      {"id":"b_rail_sale",   "type":"product_rail",    "props":{"railKey":"on_sale"}},
      {"id":"b_offers",      "type":"offers",          "props":{"title":"Offers","tiles":[]}},
      {"id":"b_rail_feat",   "type":"product_rail",    "props":{"railKey":"featured"}},
      {"id":"b_app_promo",   "type":"app_promo",       "props":{"headline":"The Effy app is on its way"}},
      {"id":"b_newsletter",  "type":"newsletter",      "props":{"headline":"Keep up with Effy"}},
      {"id":"b_recent",      "type":"recently_viewed", "props":{}}
    ]'::jsonb,
    '[
      {"id":"b_categories",  "type":"category_strip",  "props":{"title":"Shop by category","viewAllLabel":"View all categories"}},
      {"id":"b_rail_sale",   "type":"product_rail",    "props":{"railKey":"on_sale"}},
      {"id":"b_offers",      "type":"offers",          "props":{"title":"Offers","tiles":[]}},
      {"id":"b_rail_feat",   "type":"product_rail",    "props":{"railKey":"featured"}},
      {"id":"b_app_promo",   "type":"app_promo",       "props":{"headline":"The Effy app is on its way"}},
      {"id":"b_newsletter",  "type":"newsletter",      "props":{"headline":"Keep up with Effy"}},
      {"id":"b_recent",      "type":"recently_viewed", "props":{}}
    ]'::jsonb,
    0,
    'migration:042'
);

-- ⚠ NO category rails in the seed. `composeSections()` emits one per stocked category, discovered at
-- read time — seeding them would freeze whatever categories happened to exist when this ran, and a
-- category added next week would never appear. The renderer keeps that sweep until an operator
-- deliberately pins specific rails.

-- +goose Down

DROP TABLE IF EXISTS public.home_layout;
