// Service layer: business shaping — rail composition, badge derivation, presigned image URLs. No HTTP,
// no SQL. Version-neutral. The customer projection never exposes shop identity (FR-038).
package storefront

import (
	"context"
	"encoding/base64"
	"strings"
	"time"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/media"
)

const (
	readTimeout      = 3 * time.Second
	railProductLimit = 12
	categoryRailMax  = 4
	newWithinDays    = 14
)

// ProductCard is the domain card (image already presigned).
type ProductCard struct {
	ID              string
	Name            string
	Brand           *string
	ImageURL        string
	PriceAmount     string
	Currency        string
	CompareAtAmount *string
	Badges          []string
	Available       bool
}

// Rail is a merchandising row on Home.
type Rail struct {
	Key      string
	Title    string
	Products []ProductCard
}

// Banner is a promotional hero (minimal/derived in this slice).
type Banner struct {
	Key      string
	Title    string
	Subtitle *string
	ImageURL *string
	Href     *string
}

// Home is the composed Home payload.
type Home struct {
	Banners []Banner
	Rails   []Rail
}

// Category is a browse/filter category.
type Category struct {
	Key       string
	Name      string
	ParentKey *string
}

// Media is a product image (presigned) with alt text.
type Media struct {
	ImageURL string
	Alt      *string
}

// AttributeItem is one labelled attribute value; AttributeGroup groups them (never laid out as cards).
type AttributeItem struct {
	Label string
	Value string
}

type AttributeGroup struct {
	GroupLabel string
	Items      []AttributeItem
}

// ProductDetail is the full customer product page (card fields + gallery, description, attributes, path).
type ProductDetail struct {
	Card            ProductCard
	LongDescription *string
	Gallery         []Media
	Attributes      []AttributeGroup
	CategoryPath    []string
}

// Reader is the repository seam (fakes implement it in tests).
type Reader interface {
	NewestCards(ctx context.Context, limit int) ([]cardRow, error)
	OnSaleCards(ctx context.Context, limit int) ([]cardRow, error)
	CategoryCards(ctx context.Context, categoryKey string, limit int) ([]cardRow, error)
	CardsByIDs(ctx context.Context, ids []string) ([]cardRow, error)
	RailCandidates(ctx context.Context, limit int) ([]railCandidate, error)
	Categories(ctx context.Context) ([]categoryRow, error)
	ProductDetail(ctx context.Context, id string) (detailRow, bool, error)
	ProductMedia(ctx context.Context, id string) ([]mediaRow, error)
	ProductAttributes(ctx context.Context, id string) ([]attrRow, error)
	CategoryPath(ctx context.Context, categoryID string) ([]string, error)
	SearchCards(ctx context.Context, p SearchParams) ([]cardRow, error)
}

type Service struct {
	repo    Reader
	presign media.Presigner
}

func NewService(repo Reader, presign media.Presigner) *Service {
	return &Service{repo: repo, presign: presign}
}

// Home composes the merchandised Home: a Featured rail (newest), an On-sale rail, and up to
// categoryRailMax category rails that actually have products, plus a minimal welcome banner.
func (s *Service) Home(ctx context.Context) (Home, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	var home Home

	featured, err := s.repo.NewestCards(ctx, railProductLimit)
	if err != nil {
		return Home{}, err
	}
	if cards := s.toCards(ctx, featured); len(cards) > 0 {
		home.Rails = append(home.Rails, Rail{Key: "featured", Title: "Featured", Products: cards})
	}

	onSale, err := s.repo.OnSaleCards(ctx, railProductLimit)
	if err != nil {
		return Home{}, err
	}
	if cards := s.toCards(ctx, onSale); len(cards) > 0 {
		home.Rails = append(home.Rails, Rail{Key: "on_sale", Title: "On sale", Products: cards})
	}

	candidates, err := s.repo.RailCandidates(ctx, categoryRailMax)
	if err != nil {
		return Home{}, err
	}
	for _, cat := range candidates {
		rows, err := s.repo.CategoryCards(ctx, cat.Key, railProductLimit)
		if err != nil {
			return Home{}, err
		}
		if cards := s.toCards(ctx, rows); len(cards) > 0 {
			home.Rails = append(home.Rails, Rail{Key: "category:" + cat.Key, Title: cat.Name, Products: cards})
		}
	}

	home.Banners = s.banners(home.Rails)
	return home, nil
}

// ProductDetail composes the full product page; found=false → the handler 404s. The primary gallery
// image doubles as the card image. Attributes are grouped (contiguous same group_label).
func (s *Service) ProductDetail(ctx context.Context, id string) (ProductDetail, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	row, found, err := s.repo.ProductDetail(ctx, id)
	if err != nil || !found {
		return ProductDetail{}, found, err
	}

	mediaRows, err := s.repo.ProductMedia(ctx, id)
	if err != nil {
		return ProductDetail{}, false, err
	}
	gallery := make([]Media, 0, len(mediaRows))
	for _, m := range mediaRows {
		url, perr := s.presign.PresignGet(ctx, m.StorageKey)
		if perr != nil {
			continue // a missing image never blanks the page
		}
		gallery = append(gallery, Media{ImageURL: url, Alt: m.AltText})
	}

	attrRows, err := s.repo.ProductAttributes(ctx, id)
	if err != nil {
		return ProductDetail{}, false, err
	}

	path, err := s.repo.CategoryPath(ctx, row.CategoryID)
	if err != nil {
		return ProductDetail{}, false, err
	}

	var primaryImage string
	if len(gallery) > 0 {
		primaryImage = gallery[0].ImageURL
	}
	badges := make([]string, 0, 2)
	if row.CompareAtAmount != nil {
		badges = append(badges, "on_sale")
	}
	if row.IsNew {
		badges = append(badges, "new")
	}

	return ProductDetail{
		Card: ProductCard{
			ID:              row.ID,
			Name:            row.Name,
			Brand:           row.Brand,
			ImageURL:        primaryImage,
			PriceAmount:     row.PriceAmount,
			Currency:        row.Currency,
			CompareAtAmount: row.CompareAtAmount,
			Badges:          badges,
			Available:       true,
		},
		LongDescription: descriptionOrShort(row),
		Gallery:         gallery,
		Attributes:      groupAttributes(attrRows),
		CategoryPath:    path,
	}, true, nil
}

// descriptionOrShort prefers the long description, falling back to the (mandatory) short one.
func descriptionOrShort(row detailRow) *string {
	if row.LongDescription != nil && *row.LongDescription != "" {
		return row.LongDescription
	}
	short := row.ShortDescription
	return &short
}

// groupAttributes formats each value by its data type and groups by (contiguous) group_label.
func groupAttributes(rows []attrRow) []AttributeGroup {
	groups := make([]AttributeGroup, 0)
	for _, row := range rows {
		value := formatAttrValue(row)
		if value == "" {
			continue
		}
		item := AttributeItem{Label: row.Label, Value: value}
		if n := len(groups); n > 0 && groups[n-1].GroupLabel == row.GroupLabel {
			groups[n-1].Items = append(groups[n-1].Items, item)
		} else {
			groups = append(groups, AttributeGroup{GroupLabel: row.GroupLabel, Items: []AttributeItem{item}})
		}
	}
	return groups
}

// formatAttrValue renders the populated value column per the attribute's data type.
func formatAttrValue(row attrRow) string {
	switch row.DataType {
	case "boolean":
		if row.ValueBool == nil {
			return ""
		}
		if *row.ValueBool {
			return "Yes"
		}
		return "No"
	case "number":
		if row.ValueNum == nil {
			return ""
		}
		if row.Unit != nil && *row.Unit != "" {
			return *row.ValueNum + " " + *row.Unit
		}
		return *row.ValueNum
	case "multi_select":
		return joinNonEmpty(row.ValueOpts, ", ")
	default: // short_text, long_text, single_select
		if row.ValueText != nil {
			return *row.ValueText
		}
		return joinNonEmpty(row.ValueOpts, ", ")
	}
}

func joinNonEmpty(vals []string, sep string) string {
	out := ""
	for _, v := range vals {
		if v == "" {
			continue
		}
		if out != "" {
			out += sep
		}
		out += v
	}
	return out
}

// Categories returns the active category tree.
func (s *Service) Categories(ctx context.Context) ([]Category, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	rows, err := s.repo.Categories(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Category, 0, len(rows))
	for _, c := range rows {
		out = append(out, Category{Key: c.Key, Name: c.Name, ParentKey: c.ParentKey})
	}
	return out, nil
}

const searchLimit = 24

// SearchQuery is the customer-facing search/browse request (facets are query params — FR-017).
type SearchQuery struct {
	Q           string
	CategoryKey string
	MinPrice    string
	MaxPrice    string
	SaleOnly    bool
	Attributes  map[string]string
	Cursor      string
	Limit       int
}

// SearchResult is a page of results + the keyset cursor for the next page (nil when exhausted).
type SearchResult struct {
	Cards      []ProductCard
	NextCursor *string
}

// Search runs the filtered, keyset-paginated product search. It over-reads by one to know whether a
// next page exists, then mints the cursor from the last returned row (research R12).
func (s *Service) Search(ctx context.Context, q SearchQuery) (SearchResult, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	limit := q.Limit
	if limit <= 0 || limit > 50 {
		limit = searchLimit
	}
	params := SearchParams{
		Q: q.Q, CategoryKey: q.CategoryKey, MinPrice: q.MinPrice, MaxPrice: q.MaxPrice,
		SaleOnly: q.SaleOnly, Attributes: q.Attributes, Limit: limit + 1,
	}
	if q.Cursor != "" {
		if t, id, ok := decodeCursor(q.Cursor); ok {
			params.HasCursor = true
			params.CursorTime = t
			params.CursorID = id
		}
	}

	rows, err := s.repo.SearchCards(ctx, params)
	if err != nil {
		return SearchResult{}, err
	}

	var nextCursor *string
	if len(rows) > limit {
		last := rows[limit-1]
		rows = rows[:limit]
		c := encodeCursor(last.CreatedAt, last.ID)
		nextCursor = &c
	}
	return SearchResult{Cards: s.toCards(ctx, rows), NextCursor: nextCursor}, nil
}

func encodeCursor(t time.Time, id string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(t.UTC().Format(time.RFC3339Nano) + "|" + id))
}

func decodeCursor(s string) (time.Time, string, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return time.Time{}, "", false
	}
	before, after, found := strings.Cut(string(raw), "|")
	if !found {
		return time.Time{}, "", false
	}
	t, err := time.Parse(time.RFC3339Nano, before)
	if err != nil {
		return time.Time{}, "", false
	}
	return t, after, true
}

// CardsByIDs hydrates a set of product ids (recently-viewed), preserving the caller's id order.
func (s *Service) CardsByIDs(ctx context.Context, ids []string) ([]ProductCard, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	if len(ids) == 0 {
		return []ProductCard{}, nil
	}
	rows, err := s.repo.CardsByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	byID := make(map[string]ProductCard, len(rows))
	for _, card := range s.toCards(ctx, rows) {
		byID[card.ID] = card
	}
	ordered := make([]ProductCard, 0, len(ids))
	for _, id := range ids {
		if card, ok := byID[id]; ok {
			ordered = append(ordered, card)
		}
	}
	return ordered, nil
}

// toCards maps rows → domain cards, deriving badges and presigning images. A presign failure drops the
// image (empty URL) rather than failing the whole rail — a missing image must never blank the store.
func (s *Service) toCards(ctx context.Context, rows []cardRow) []ProductCard {
	cards := make([]ProductCard, 0, len(rows))
	for _, row := range rows {
		var imageURL string
		if row.StorageKey != nil {
			if url, err := s.presign.PresignGet(ctx, *row.StorageKey); err == nil {
				imageURL = url
			}
		}
		cards = append(cards, ProductCard{
			ID:              row.ID,
			Name:            row.Name,
			Brand:           row.Brand,
			ImageURL:        imageURL,
			PriceAmount:     row.PriceAmount,
			Currency:        row.Currency,
			CompareAtAmount: row.CompareAtAmount,
			Badges:          deriveBadges(row),
			Available:       true, // only active products are read
		})
	}
	return cards
}

// deriveBadges: on_sale when a compare-at price is present; new when created within newWithinDays.
func deriveBadges(row cardRow) []string {
	badges := make([]string, 0, 2)
	if row.CompareAtAmount != nil {
		badges = append(badges, "on_sale")
	}
	if time.Since(row.CreatedAt) <= newWithinDays*24*time.Hour {
		badges = append(badges, "new")
	}
	return badges
}

// banners returns a single minimal welcome banner when the store has anything to show (no CMS in this
// slice — Home merchandising is catalog-derived per the assumptions).
func (s *Service) banners(rails []Rail) []Banner {
	if len(rails) == 0 {
		return []Banner{}
	}
	subtitle := "Fresh groceries and everyday essentials, delivered."
	href := "/search"
	return []Banner{{
		Key:      "welcome",
		Title:    "Shop Effy",
		Subtitle: &subtitle,
		Href:     &href,
	}}
}
