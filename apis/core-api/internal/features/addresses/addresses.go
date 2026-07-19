// Package addresses is the customer's delivery-address CRUD (019 US3). Every operation is scoped to the
// resolved customer id (never a client-supplied id). The first address becomes the default; at most one
// default per customer (a partial-unique index backs it). The chosen address is snapshotted onto the
// order at checkout, so these mutable rows never corrupt a historical receipt (R13).
package addresses

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

var ErrNotFound = errors.New("addresses: not found")

// Address is the domain model (and the checkout snapshot source).
type Address struct {
	ID            string
	Label         *string
	RecipientName string
	Phone         *string
	Line1         string
	Line2         *string
	City          string
	Region        *string
	PostalCode    string
	Country       string
	IsDefault     bool
}

// Input is a create/update payload (nil = keep on update).
type Input struct {
	Label         *string
	RecipientName *string
	Phone         *string
	Line1         *string
	Line2         *string
	City          *string
	Region        *string
	PostalCode    *string
	Country       *string
	MakeDefault   bool
}

const addrCols = `id::text, label, recipient_name, phone, line1, line2, city, region, postal_code, country, is_default`

type addrRow struct {
	ID            string  `db:"id"`
	Label         *string `db:"label"`
	RecipientName string  `db:"recipient_name"`
	Phone         *string `db:"phone"`
	Line1         string  `db:"line1"`
	Line2         *string `db:"line2"`
	City          string  `db:"city"`
	Region        *string `db:"region"`
	PostalCode    string  `db:"postal_code"`
	Country       string  `db:"country"`
	IsDefault     bool    `db:"is_default"`
}

func (r addrRow) toDomain() Address {
	return Address(r)
}

// ── Repository ──────────────────────────────────────────────────────────────────────────────────

type Repository struct {
	db db.DBTX
}

func NewRepository(dbtx db.DBTX) *Repository {
	return &Repository{db: dbtx}
}

func (r *Repository) List(ctx context.Context, customerID string) ([]addrRow, error) {
	rows, err := r.db.Query(ctx, `SELECT `+addrCols+`
FROM public.customer_address WHERE customer_id = $1
ORDER BY is_default DESC, created_at ASC`, customerID)
	if err != nil {
		return nil, fmt.Errorf("addresses: list: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[addrRow])
	if err != nil {
		return nil, fmt.Errorf("addresses: scan list: %w", err)
	}
	return out, nil
}

// Get returns one address scoped to the customer; ErrNotFound if absent.
func (r *Repository) Get(ctx context.Context, customerID, id string) (addrRow, error) {
	rows, err := r.db.Query(ctx, `SELECT `+addrCols+`
FROM public.customer_address WHERE id = $1 AND customer_id = $2`, id, customerID)
	if err != nil {
		return addrRow{}, fmt.Errorf("addresses: get: %w", err)
	}
	row, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[addrRow])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return addrRow{}, ErrNotFound
		}
		return addrRow{}, fmt.Errorf("addresses: scan get: %w", err)
	}
	return row, nil
}

// Create inserts an address. It becomes the default when explicitly requested OR it is the customer's
// first address; making it default clears any prior default in the same statement.
func (r *Repository) Create(ctx context.Context, customerID string, in Input) (addrRow, error) {
	rows, err := r.db.Query(ctx, `
WITH mkdefault AS (
    SELECT ($2 OR NOT EXISTS (SELECT 1 FROM public.customer_address WHERE customer_id = $1)) AS v
),
cleared AS (
    UPDATE public.customer_address SET is_default = false
    WHERE customer_id = $1 AND (SELECT v FROM mkdefault)
)
INSERT INTO public.customer_address
    (customer_id, label, recipient_name, phone, line1, line2, city, region, postal_code, country, is_default)
VALUES ($1, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, 'AU'), (SELECT v FROM mkdefault))
RETURNING `+addrCols,
		customerID, in.MakeDefault,
		in.Label, deref(in.RecipientName), in.Phone, deref(in.Line1), in.Line2,
		deref(in.City), in.Region, deref(in.PostalCode), in.Country)
	if err != nil {
		return addrRow{}, fmt.Errorf("addresses: create: %w", err)
	}
	row, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[addrRow])
	if err != nil {
		return addrRow{}, fmt.Errorf("addresses: scan create: %w", err)
	}
	return row, nil
}

// Update patches provided fields (COALESCE keeps omitted ones) and optionally promotes to default.
func (r *Repository) Update(ctx context.Context, customerID, id string, in Input) (addrRow, error) {
	rows, err := r.db.Query(ctx, `
WITH cleared AS (
    UPDATE public.customer_address SET is_default = false
    WHERE customer_id = $1 AND $2 = true
)
UPDATE public.customer_address SET
    label          = COALESCE($3, label),
    recipient_name = COALESCE($4, recipient_name),
    phone          = COALESCE($5, phone),
    line1          = COALESCE($6, line1),
    line2          = COALESCE($7, line2),
    city           = COALESCE($8, city),
    region         = COALESCE($9, region),
    postal_code    = COALESCE($10, postal_code),
    country        = COALESCE($11, country),
    is_default     = CASE WHEN $2 = true THEN true ELSE is_default END,
    updated_at     = now()
WHERE id = $12 AND customer_id = $1
RETURNING `+addrCols,
		customerID, in.MakeDefault,
		in.Label, in.RecipientName, in.Phone, in.Line1, in.Line2,
		in.City, in.Region, in.PostalCode, in.Country, id)
	if err != nil {
		return addrRow{}, fmt.Errorf("addresses: update: %w", err)
	}
	row, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[addrRow])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return addrRow{}, ErrNotFound
		}
		return addrRow{}, fmt.Errorf("addresses: scan update: %w", err)
	}
	return row, nil
}

func (r *Repository) Delete(ctx context.Context, customerID, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM public.customer_address WHERE id = $1 AND customer_id = $2`, id, customerID)
	if err != nil {
		return fmt.Errorf("addresses: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// ── Service ─────────────────────────────────────────────────────────────────────────────────────

type Repo interface {
	List(ctx context.Context, customerID string) ([]addrRow, error)
	Get(ctx context.Context, customerID, id string) (addrRow, error)
	Create(ctx context.Context, customerID string, in Input) (addrRow, error)
	Update(ctx context.Context, customerID, id string, in Input) (addrRow, error)
	Delete(ctx context.Context, customerID, id string) error
}

type Service struct {
	repo Repo
}

func NewService(repo Repo) *Service {
	return &Service{repo: repo}
}

func (s *Service) List(ctx context.Context, customerID string) ([]Address, error) {
	rows, err := s.repo.List(ctx, customerID)
	if err != nil {
		return nil, err
	}
	out := make([]Address, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.toDomain())
	}
	return out, nil
}

func (s *Service) Create(ctx context.Context, customerID string, in Input) (Address, error) {
	if err := validateCreate(in); err != nil {
		return Address{}, err
	}
	row, err := s.repo.Create(ctx, customerID, in)
	if err != nil {
		return Address{}, err
	}
	return row.toDomain(), nil
}

func (s *Service) Update(ctx context.Context, customerID, id string, in Input) (Address, error) {
	if _, err := uuid.Parse(id); err != nil {
		return Address{}, ErrNotFound
	}
	row, err := s.repo.Update(ctx, customerID, id, in)
	if err != nil {
		return Address{}, err
	}
	return row.toDomain(), nil
}

func (s *Service) Delete(ctx context.Context, customerID, id string) error {
	if _, err := uuid.Parse(id); err != nil {
		return ErrNotFound
	}
	return s.repo.Delete(ctx, customerID, id)
}

// ErrValidation signals a bad create payload (missing required fields).
var ErrValidation = errors.New("addresses: missing required fields")

func validateCreate(in Input) error {
	if in.RecipientName == nil || *in.RecipientName == "" ||
		in.Line1 == nil || *in.Line1 == "" ||
		in.City == nil || *in.City == "" ||
		in.PostalCode == nil || *in.PostalCode == "" {
		return ErrValidation
	}
	return nil
}
