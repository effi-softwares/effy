// Product detail (019 US2) — the customer product page read. Extends the storefront feature with the
// gallery, grouped attributes (from the 016 EAV model), and the category path. Raw SQL; only active
// products are visible (404 otherwise). No shop identity is ever selected (FR-038).
package storefront

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// ── Repository rows (never leave this package) ──────────────────────────────────────────────────

type detailRow struct {
	ID               string  `db:"id"`
	Name             string  `db:"name"`
	Brand            *string `db:"brand"`
	PriceAmount      string  `db:"price_amount"`
	Currency         string  `db:"currency"`
	CompareAtAmount  *string `db:"compare_at_amount"`
	ShortDescription string  `db:"short_description"`
	LongDescription  *string `db:"long_description"`
	CreatedAt        string  `db:"created_at"`
	CategoryID       string  `db:"primary_category_id"`
	IsNew            bool    `db:"is_new"`
}

type mediaRow struct {
	StorageKey string  `db:"storage_key"`
	AltText    *string `db:"alt_text"`
}

type attrRow struct {
	Label      string   `db:"label"`
	DataType   string   `db:"data_type"`
	Unit       *string  `db:"unit"`
	ValueText  *string  `db:"value_text"`
	ValueNum   *string  `db:"value_number"`
	ValueBool  *bool    `db:"value_boolean"`
	ValueOpts  []string `db:"value_options"`
	GroupLabel string   `db:"group_label"`
}

// ProductDetail reads the core product row; found=false when the id is missing or not active.
func (r *Repository) ProductDetail(ctx context.Context, id string) (detailRow, bool, error) {
	rows, err := r.db.Query(ctx, `
SELECT p.id::text                  AS id,
       p.name                      AS name,
       p.brand                     AS brand,
       p.price_amount::text        AS price_amount,
       p.currency                  AS currency,
       p.compare_at_amount::text   AS compare_at_amount,
       p.short_description         AS short_description,
       p.long_description          AS long_description,
       p.created_at::text          AS created_at,
       p.primary_category_id::text AS primary_category_id,
       (p.created_at >= now() - interval '14 days') AS is_new
FROM public.product p
WHERE p.id = $1 AND p.status = 'active'`, id)
	if err != nil {
		return detailRow{}, false, fmt.Errorf("storefront: query detail: %w", err)
	}
	row, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[detailRow])
	if err != nil {
		if err == pgx.ErrNoRows {
			return detailRow{}, false, nil
		}
		return detailRow{}, false, fmt.Errorf("storefront: scan detail: %w", err)
	}
	return row, true, nil
}

// ProductMedia returns the full gallery, primary image first.
func (r *Repository) ProductMedia(ctx context.Context, id string) ([]mediaRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT storage_key, alt_text
FROM public.product_media
WHERE product_id = $1
ORDER BY is_primary DESC, display_order ASC, created_at ASC`, id)
	if err != nil {
		return nil, fmt.Errorf("storefront: query media: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[mediaRow])
	if err != nil {
		return nil, fmt.Errorf("storefront: scan media: %w", err)
	}
	return out, nil
}

// ProductAttributes returns the product's attribute values with their definition + type grouping.
func (r *Repository) ProductAttributes(ctx context.Context, id string) ([]attrRow, error) {
	rows, err := r.db.Query(ctx, `
SELECT ad.name                          AS label,
       ad.data_type                     AS data_type,
       ad.unit                          AS unit,
       pav.value_text                   AS value_text,
       pav.value_number::text           AS value_number,
       pav.value_boolean                AS value_boolean,
       pav.value_options                AS value_options,
       COALESCE(pta.group_label, 'Details') AS group_label
FROM public.product_attribute_value pav
JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id
LEFT JOIN public.product_type_attribute pta
       ON pta.attribute_definition_id = pav.attribute_definition_id
      AND pta.product_type_id = (SELECT product_type_id FROM public.product WHERE id = $1)
WHERE pav.product_id = $1 AND ad.status = 'active'
ORDER BY group_label ASC, pta.display_order ASC NULLS LAST, ad.name ASC`, id)
	if err != nil {
		return nil, fmt.Errorf("storefront: query attributes: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[attrRow])
	if err != nil {
		return nil, fmt.Errorf("storefront: scan attributes: %w", err)
	}
	return out, nil
}

// CategoryPath walks the taxonomy from the root down to categoryID (root first, leaf last).
func (r *Repository) CategoryPath(ctx context.Context, categoryID string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
WITH RECURSIVE path AS (
    SELECT id, parent_id, name, 0 AS depth
    FROM public.category WHERE id = $1
    UNION ALL
    SELECT c.id, c.parent_id, c.name, p.depth + 1
    FROM public.category c JOIN path p ON c.id = p.parent_id
)
SELECT name FROM path ORDER BY depth DESC`, categoryID)
	if err != nil {
		return nil, fmt.Errorf("storefront: query category path: %w", err)
	}
	names, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, fmt.Errorf("storefront: scan category path: %w", err)
	}
	return names, nil
}
