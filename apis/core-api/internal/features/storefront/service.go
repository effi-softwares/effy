// Service layer: business shaping — rail composition, badge derivation, presigned image URLs. No HTTP,
// no SQL. Version-neutral. The customer projection never exposes shop identity (FR-038).
package storefront

import (
	"context"
	"errors"
	"strconv"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/media"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

const (
	// ⚠ RAISED 3s → 8s (2026-07-31), and the reason is topology, not slow code.
	//
	// The 3s budget assumed core-api and the database sit in the same region — true in the target
	// deployment, false today: core-api is local-Docker-only by decision, so every query crosses the
	// public internet to Sydney RDS. A MEASURED round trip on a bare `SELECT 1` is ~135ms, which no
	// amount of query tuning can reduce.
	//
	// Home was intermittently 503-ing at exactly 3.007s because of that. The real fix is below —
	// issuing the independent reads concurrently — but a budget only ~2× the happy path leaves no
	// room for a cold pool (a TLS handshake to RDS is several more round trips) or for a slow moment
	// on a t4g.micro. This is headroom for the dev topology, NOT cover for a slow path: if Home ever
	// approaches this number again, something is wrong and should be found, not absorbed.
	readTimeout      = 8 * time.Second
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

// Banner is the shopper-facing face of an ADVERTISED promotion (028).
//
// ⚠ It is no longer derived from the catalog. Until 028 this was a hard-coded "welcome" stub that was
// always present; it is now zero or more real promotions, and the list is EMPTY when none is
// advertised. Any client that assumed at least one banner has to handle that.
type Banner struct {
	Key      string
	Title    string
	Subtitle *string
	ImageURL *string
	Href     *string
	// Code is what a shopper types in the cart — shown so the banner is actionable, not decorative.
	Code *string
	// Terms is the condition sentence, composed HERE from the promotion's minimum so that web and
	// mobile cannot phrase one promotion two ways (FR-037d).
	Terms *string
	// Target is the closed-vocabulary destination each client maps exhaustively.
	Target *BannerTarget
	// Position places the banner in Home's section sequence; the client clamps out-of-range values.
	Position int
	// Placement is which of Home's two banner slots this occupies (029). Exclusive — never both.
	Placement string
}

// BannerTarget is where a banner leads — a CLOSED vocabulary (research R7). An unrecognised value
// must render the banner non-tappable on the client rather than dead-tapping.
type BannerTarget struct {
	Kind        string
	CategoryKey *string
	ProductID   *string
	PromotionID *string
}

// Promotion is the full detail of ONE advertised promotion — what a banner tap opens.
//
// ⚠ WHY THIS EXISTS. Every banner used to target `{kind: "search"}`, so a tap landed on the unfiltered
// store: the same screen the Search tab already shows, carrying none of the promotion's own facts —
// not the code, not the terms. It read as a bug because it behaved like one.
//
// The honest reason no better destination existed is in the data model: `promo_code` has no product or
// category scoping. A promotion is a whole-cart discount, so there is no set of qualifying products to
// filter to. A cart-level code is a message, not a place — and the right destination for a message is
// the message itself, stated in full, with the ordinary store one tap further on.
type Promotion struct {
	ID       string
	Title    string
	Subtitle *string
	ImageURL *string
	// Code is what the shopper types in the cart; the detail screen is where they copy it from.
	Code string
	// Terms is the SAME sentence the banner shows, composed by the same function — a shopper who reads
	// a condition on the banner and a differently-worded one here would not know which binds.
	Terms *string
	// Validity is how long is left, or nil when the promotion has no end date.
	Validity *string
}

// Home is the composed Home payload.
type Home struct {
	Banners []Banner
	Rails   []Rail
}

// Category is a browse/filter category. ProductCount and ImageURL (025) let browse render a real
// category grid; ImageURL is derived from a product in the category, and is empty when none has media —
// the client renders a brand tile rather than a broken frame.
type Category struct {
	Key          string
	Name         string
	ParentKey    *string
	ProductCount int
	ImageURL     string
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
	// CategoryKey is the primary category's key — it drives the related-products rail (025 FR-026).
	// CategoryPath carries display NAMES, which cannot be used to query.
	CategoryKey string
}

// Reader is the repository seam (fakes implement it in tests).
type Reader interface {
	NewestCards(ctx context.Context, limit int) ([]cardRow, error)
	OnSaleCards(ctx context.Context, limit int) ([]cardRow, error)
	CategoryCards(ctx context.Context, categoryKey string, limit int) ([]cardRow, error)
	CardsByIDs(ctx context.Context, ids []string) ([]cardRow, error)
	RailCandidates(ctx context.Context, limit int) ([]railCandidate, error)
	AdvertisedPromotions(ctx context.Context) ([]advertisedPromoRow, error)
	AdvertisedPromotionByID(ctx context.Context, id string) (advertisedPromoRow, bool, error)
	Categories(ctx context.Context) ([]categoryRow, error)
	ProductDetail(ctx context.Context, id string) (detailRow, bool, error)
	ProductMedia(ctx context.Context, id string) ([]mediaRow, error)
	ProductAttributes(ctx context.Context, id string) ([]attrRow, error)
	CategoryPath(ctx context.Context, categoryID string) ([]string, error)
	SearchCards(ctx context.Context, p SearchParams) ([]searchRow, error)
	// CountCards returns the total matching the same filters, ignoring ordering and pagination.
	CountCards(ctx context.Context, p SearchParams) (int, error)
	// Serviceable answers whether a (already-normalised) postcode is in a delivery zone. It resolves
	// through the SAME predicate checkout uses, so the storefront's up-front answer and checkout's
	// cannot disagree (025 FR-014b).
	Serviceable(ctx context.Context, postcode string) (bool, error)
}

type Service struct {
	repo    Reader
	presign media.Presigner
}

func NewService(repo Reader, presign media.Presigner) *Service {
	return &Service{repo: repo, presign: presign}
}

// Home composes the merchandised Home: a Featured rail (newest), an On-sale rail, and up to
// categoryRailMax category rails that actually have products, plus the advertised promotions.
//
// ── ⚠ WHY THESE READS ARE ISSUED CONCURRENTLY ───────────────────────────────────────────────────
//
// This function used to run its queries one after another, and it intermittently 503-ed the whole
// storefront with `scan cards: timeout` at exactly the 3s budget. Nothing was slow; there were
// simply too many round trips:
//
//	NewestCards · OnSaleCards · RailCandidates · CategoryCards ×4 · advertised promotions  =  8
//
// A round trip to Sydney RDS measures ~135ms from a local core-api, so those 8 cost ~1.08s of pure
// network latency before a single row is read — MEASURED at ~1.37s warm against a 3s budget, i.e.
// nearly half the budget spent waiting. Any variance (a cold pool paying TLS handshakes, a slow
// moment on a t4g.micro) tipped it over, which is exactly why it failed on first load and only
// "sometimes".
//
// ⚠ This is 027's latency defect recurring on the READ path. That slice recorded it precisely —
// "~14 round trips to Sydney RDS inside a 4s budget … a combined read replaced N queries" — fixed
// the cart write path, and left this one, which has the identical shape, untouched.
//
// The reads are mutually independent, so the depth is a property of the CODE, not of the data. Two
// waves is the true dependency depth: everything that can be asked at once is, and the category
// rails form a second wave only because wave 1 is what names them.
//
// ⚠ Ordering is NOT left to the goroutines. Results land in fixed slots and the rails are assembled
// sequentially afterwards, because the server owns section order (research R8) and a Home whose
// sections shuffled between loads would read as a bug even though nothing was wrong.
func (s *Service) Home(ctx context.Context) (Home, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	var (
		featured   []cardRow
		onSale     []cardRow
		candidates []railCandidate
		banners    []Banner
	)

	// Wave 1 — everything that depends on nothing.
	g, gctx := errgroup.WithContext(ctx)
	g.Go(func() (err error) { featured, err = s.repo.NewestCards(gctx, railProductLimit); return })
	g.Go(func() (err error) { onSale, err = s.repo.OnSaleCards(gctx, railProductLimit); return })
	g.Go(func() (err error) { candidates, err = s.repo.RailCandidates(gctx, categoryRailMax); return })
	g.Go(func() (err error) { banners, err = s.banners(gctx); return })
	if err := g.Wait(); err != nil {
		return Home{}, err
	}

	// Wave 2 — the category rails, which could not be asked for until wave 1 named them.
	categoryRows := make([][]cardRow, len(candidates))
	g2, g2ctx := errgroup.WithContext(ctx)
	for i, cat := range candidates {
		g2.Go(func() (err error) {
			categoryRows[i], err = s.repo.CategoryCards(g2ctx, cat.Key, railProductLimit)
			return
		})
	}
	if err := g2.Wait(); err != nil {
		return Home{}, err
	}

	// ⚠ Assembly uses `ctx`, never `gctx` — errgroup cancels its derived context once Wait returns,
	// so presigning against it would fail on a context that is already dead.
	var home Home
	if cards := s.toCards(ctx, featured); len(cards) > 0 {
		home.Rails = append(home.Rails, Rail{Key: "featured", Title: "Featured", Products: cards})
	}
	if cards := s.toCards(ctx, onSale); len(cards) > 0 {
		home.Rails = append(home.Rails, Rail{Key: "on_sale", Title: "On sale", Products: cards})
	}
	for i, cat := range candidates {
		if cards := s.toCards(ctx, categoryRows[i]); len(cards) > 0 {
			home.Rails = append(home.Rails, Rail{Key: "category:" + cat.Key, Title: cat.Name, Products: cards})
		}
	}
	home.Banners = banners
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
		CategoryKey:     row.CategoryKey,
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
		var imageURL string
		if c.ImageKey != nil {
			// A presign failure drops the image rather than failing browse — a missing picture must
			// never blank the category grid.
			if url, err := s.presign.PresignGet(ctx, *c.ImageKey); err == nil {
				imageURL = url
			}
		}
		out = append(out, Category{
			Key: c.Key, Name: c.Name, ParentKey: c.ParentKey,
			ProductCount: c.ProductCount, ImageURL: imageURL,
		})
	}
	return out, nil
}

const searchLimit = 24

// ErrCursorSortMismatch means the caller paged with a cursor minted under a different ordering.
//
// It is refused rather than reinterpreted (FR-016b). Honouring it would compare, say, a price against
// a timestamp: no error, just a result set with products silently dropped and others repeated. The
// refusal costs the client nothing — changing sort restarts at the first page anyway.
var ErrCursorSortMismatch = errors.New("storefront: cursor was issued for a different sort")

// SearchQuery is the customer-facing search/browse request (facets are query params — FR-017).
type SearchQuery struct {
	Q           string
	CategoryKey string
	MinPrice    string
	MaxPrice    string
	SaleOnly    bool
	Attributes  map[string]string
	Sort        ProductSort
	Cursor      string
	Limit       int
}

// SearchResult is a page of results, the keyset cursor for the next page (nil when exhausted), the
// total matching the filters, and the ordering ACTUALLY applied.
type SearchResult struct {
	Cards      []ProductCard
	NextCursor *string
	Total      int
	// Sort may differ from the request: `relevance` without a query has no meaning, so the service
	// falls back to `newest` and reports it. A client that assumed its request was honoured would
	// render a sort control that lies about the list beneath it.
	Sort ProductSort
}

// Search runs the filtered, ordered, keyset-paginated product search. It over-reads by one to know
// whether a next page exists, then mints the cursor from the last returned row (research R12), and
// counts the full match set concurrently.
func (s *Service) Search(ctx context.Context, q SearchQuery) (SearchResult, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	limit := q.Limit
	if limit <= 0 || limit > 50 {
		limit = searchLimit
	}

	sort := q.Sort
	if sort == "" {
		sort = SortNewest
	}
	// Relevance without a query has nothing to rank by. Fall back and report it, rather than
	// ordering by a similarity score that is uniformly zero and calling it "best match".
	if sort == SortRelevance && q.Q == "" {
		sort = SortNewest
	}

	params := SearchParams{
		Q: q.Q, CategoryKey: q.CategoryKey, MinPrice: q.MinPrice, MaxPrice: q.MaxPrice,
		SaleOnly: q.SaleOnly, Attributes: q.Attributes, Sort: sort, Limit: limit + 1,
	}
	if q.Cursor != "" {
		cur, ok := DecodeCursor(q.Cursor)
		if !ok {
			// An unreadable cursor is treated as "start from the beginning" — it is an ephemeral
			// page position, and a stale one costs the shopper nothing but a scroll.
			cur = Cursor{}
		} else if cur.Sort != sort {
			return SearchResult{}, ErrCursorSortMismatch
		} else {
			params.Cursor = &cur
		}
	}

	// The page and the count are independent reads over the same filters, so they run concurrently —
	// the total must not cost the shopper a second round trip. A plain goroutine rather than
	// errgroup: golang.org/x/sync is only an indirect dependency here, and this needs six lines.
	type countResult struct {
		n   int
		err error
	}
	counted := make(chan countResult, 1)
	go func() {
		n, err := s.repo.CountCards(ctx, params)
		counted <- countResult{n: n, err: err}
	}()

	rows, err := s.repo.SearchCards(ctx, params)
	count := <-counted
	if err != nil {
		return SearchResult{}, err
	}
	if count.err != nil {
		return SearchResult{}, count.err
	}
	total := count.n

	var nextCursor *string
	if len(rows) > limit {
		last := rows[limit-1]
		rows = rows[:limit]
		c := Cursor{Sort: sort, Key: cursorKeyFor(sort, last), ID: last.ID}.Encode()
		nextCursor = &c
	}

	cards := make([]cardRow, 0, len(rows))
	for _, r := range rows {
		cards = append(cards, r.card())
	}
	return SearchResult{
		Cards:      s.toCards(ctx, cards),
		NextCursor: nextCursor,
		Total:      total,
		Sort:       sort,
	}, nil
}

// cursorKeyFor extracts the sort column's value from a row, in the exact text form the next page's
// keyset predicate will bind. Money stays a string end to end — it must never round-trip a float.
func cursorKeyFor(sort ProductSort, row searchRow) string {
	switch sort {
	case SortPriceAsc, SortPriceDesc:
		return row.PriceAmount
	case SortRelevance:
		return strconv.FormatFloat(float64(row.Score), 'f', -1, 32)
	default: // SortNewest
		return row.CreatedAt.UTC().Format(time.RFC3339Nano)
	}
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

// banners returns the promotions cleared for public display, in the order an operator declared.
//
// ⚠ WHAT THIS REPLACED: a hard-coded "welcome" banner, always present, advertising nothing. It was
// honest about being a placeholder ("no CMS in this slice") and it meant the banner slot on both
// customer surfaces showed a brand slogan forever.
//
// A promotion is advertised only when an operator explicitly marked it so, and it stops being
// advertised the moment it expires, is exhausted, is disabled or is un-marked — WITHOUT anyone acting
// (FR-037c). The whole predicate lives in the repository, in one statement.
//
// A presign failure drops the artwork rather than the banner: a promotion a shopper could have used
// must not disappear because an image could not be signed.
func (s *Service) banners(ctx context.Context) ([]Banner, error) {
	rows, err := s.repo.AdvertisedPromotions(ctx)
	if err != nil {
		return nil, err
	}

	out := make([]Banner, 0, len(rows))
	for _, p := range rows {
		code := p.Code
		id := p.ID
		banner := Banner{
			Key:       p.ID,
			Title:     p.Title,
			Subtitle:  p.Subtitle,
			Code:      &code,
			Terms:     promoTerms(p.MinimumSubtotal, p.Currency),
			Position:  p.Position,
			Placement: p.Placement,
			// ⚠ THIS WAS `{kind: "search"}` FOR EVERY BANNER — one hard-coded destination, so a tap
			// landed on the unfiltered store and the shopper lost the promotion on the way there.
			// A promotion now leads to itself, stated in full. See [Promotion] for why that is the
			// only destination a whole-cart discount actually has.
			Target: &BannerTarget{Kind: "promotion", PromotionID: &id},
			// `href` is the WEB path for the same destination — customer-web routes on it, having no
			// use for the closed target vocabulary a native client needs.
			//
			// ⚠ IT WAS `/search`, for the same reason `target` was `{kind:"search"}`: one hard-coded
			// destination for every promotion. It moves in lockstep with the target, so the two
			// surfaces cannot disagree about where one promotion leads.
			Href: ptr("/promotions/" + p.ID),
		}
		if p.ImageKey != nil && *p.ImageKey != "" {
			if url, perr := s.presign.PresignGet(ctx, *p.ImageKey); perr == nil {
				banner.ImageURL = &url
			}
		}
		out = append(out, banner)
	}
	return out, nil
}

// promoTerms renders a promotion's condition as a sentence a shopper can act on, or nil when it has
// none. Composed HERE, once, so both customer surfaces say the same thing about the same promotion —
// and so a shopper learns of a minimum from the banner rather than at payment (FR-037d).
func promoTerms(minimumSubtotal, currency string) *string {
	cents, err := money.ParseCents(minimumSubtotal)
	if err != nil || cents <= 0 {
		// No minimum is not a condition worth a sentence — an empty terms line reads as a rule the
		// shopper has failed to understand rather than as the absence of one.
		return nil
	}
	amount := money.FormatCents(cents)
	// AUD is the platform's only currency today. A symbol is what a shopper reads; the code is the
	// honest fallback if that ever stops being true, rather than silently mislabelling the money.
	var terms string
	if currency == "AUD" {
		terms = "On orders over $" + amount
	} else {
		terms = "On orders over " + amount + " " + currency
	}
	return &terms
}

// Promotion returns one advertised promotion in full — the destination of a banner tap.
//
// ⚠ It re-reads through the SAME visibility predicate Home used, so a promotion that expired, was
// exhausted, was disabled or was un-advertised between composing Home and tapping its banner is
// reported NOT FOUND rather than served (FR-036 — a banner advertises something true at the moment it
// is shown, and so must the screen behind it).
func (s *Service) Promotion(ctx context.Context, id string) (Promotion, bool, error) {
	row, found, err := s.repo.AdvertisedPromotionByID(ctx, id)
	if err != nil || !found {
		return Promotion{}, false, err
	}

	out := Promotion{
		ID:       row.ID,
		Title:    row.Title,
		Subtitle: row.Subtitle,
		Code:     row.Code,
		Terms:    promoTerms(row.MinimumSubtotal, row.Currency),
		Validity: promoValidity(row.EndsAt, time.Now()),
	}
	// A presign failure drops the ARTWORK, never the screen — the code and terms are what a shopper
	// came for, and they do not stop being true because an image could not be signed. Same rule as
	// the banner read.
	if row.ImageKey != nil && *row.ImageKey != "" {
		if url, perr := s.presign.PresignGet(ctx, *row.ImageKey); perr == nil {
			out.ImageURL = &url
		}
	}
	return out, true, nil
}

// promoValidity renders how long is left as a sentence, or nil when the promotion never ends.
//
// ⚠ DELIBERATELY RELATIVE ("Ends in 3 days"), not a calendar date. A date is only meaningful in a
// timezone, and this platform has no timezone concept — introducing one (tzdata in the container, a
// location constant, a rule for which zone a shopper in another state sees) is a decision that
// deserves its own slice, not a side effect of a banner fix. Rendering the DURATION sidesteps the
// question entirely: "in 3 days" means the same thing from anywhere, and urgency is what a shopper
// actually reads an expiry for.
//
// Composed server-side for the same reason [promoTerms] is: mobile has no date formatting of any kind,
// and two surfaces must not phrase one promotion two ways.
func promoValidity(endsAt *time.Time, now time.Time) *string {
	if endsAt == nil {
		return nil
	}
	left := endsAt.Sub(now)
	var s string
	switch {
	case left <= 0:
		// Unreachable through [Service.Promotion] — the SQL predicate has already excluded it. Handled
		// anyway: a caller that ever gets here must not be told a dead promotion "ends in 0 days".
		s = "Ended"
	case left < time.Hour:
		s = "Ends within the hour"
	case left < 24*time.Hour:
		s = "Ends in " + plural(int(left/time.Hour), "hour")
	case left < 48*time.Hour:
		s = "Ends tomorrow"
	default:
		s = "Ends in " + plural(int(left/(24*time.Hour)), "day")
	}
	return &s
}

func plural(n int, unit string) string {
	if n == 1 {
		return "1 " + unit
	}
	return strconv.Itoa(n) + " " + unit + "s"
}

func ptr(s string) *string { return &s }
