-- +goose Up
-- PERF-14 — the indexes the search suggestions were scanning without.
--
-- Every keystroke batch of `/storefront/v1/suggestions` matches `p.name ILIKE '%…%'` three times
-- (products, completions, the aisles holding them) and `p.brand ILIKE '…%'` once. The only trigram
-- index on product (`product_search_trgm_idx`, 016) is over ONE combined lower(name || sku || brand
-- || short_description) expression — the full search's — and Postgres uses an expression index only
-- for that exact expression. So each of those four read every product row.
--
-- A trigram GIN index serves ILIKE with a leading wildcard directly, no lower() needed.
-- pg_trgm is installed (016).
--
-- ⚠ Plain CREATE INDEX, not CONCURRENTLY: product writes wait for the build, which takes well under a
-- second at today's catalogue size. Revisit if the table is ever large when a similar index is added.
CREATE INDEX product_name_trgm_idx ON public.product USING gin (name gin_trgm_ops);
CREATE INDEX product_brand_trgm_idx ON public.product USING gin (brand gin_trgm_ops);

-- +goose Down
DROP INDEX public.product_brand_trgm_idx;
DROP INDEX public.product_name_trgm_idx;
