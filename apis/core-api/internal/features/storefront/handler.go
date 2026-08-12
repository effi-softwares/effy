// Handler layer: HTTP only — call the service, map domain → wire DTO. The storefront reads are PUBLIC
// (no auth) and cacheable. Wire shapes mirror @effy/shared-types storefront.ts (contracts/shared-dtos).
package storefront

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// Wire DTOs (storefront.ts). Money is a string; nullable fields are JSON null.
type productCardDTO struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Brand           *string  `json:"brand"`
	ImageURL        *string  `json:"imageUrl"`
	PriceAmount     string   `json:"priceAmount"`
	Currency        string   `json:"currency"`
	CompareAtAmount *string  `json:"compareAtAmount"`
	Badges          []string `json:"badges"`
	Available       bool     `json:"available"`
}

type railDTO struct {
	Key      string           `json:"key"`
	Title    string           `json:"title"`
	Products []productCardDTO `json:"products"`
}

type bannerDTO struct {
	Key      string  `json:"key"`
	Title    string  `json:"title"`
	Subtitle *string `json:"subtitle"`
	ImageURL *string `json:"imageUrl"`
	Href     *string `json:"href"`
	Code     *string `json:"code"`
	Terms    *string `json:"terms"`
	// ⚠ `position` is an INT on the wire, and it must stay one. 027 lost days to a Kotlin client
	// sending `1.0` where Go wanted an int, with every unit test passing because the fakes spoke
	// Kotlin at both ends. The TS contract pins it via `WireInt` (`@asType integer`) so the generated
	// Kotlin emits Long; this is the other end of that agreement.
	Position  int              `json:"position"`
	Target    *bannerTargetDTO `json:"target"`
	Placement string           `json:"placement"`
}

// bannerTargetDTO is the closed destination vocabulary (research R7). A client that meets an
// unrecognised `kind` must render the banner NON-TAPPABLE rather than dead-tapping.
type bannerTargetDTO struct {
	Kind        string  `json:"kind"`
	CategoryKey *string `json:"categoryKey,omitempty"`
	ProductID   *string `json:"productId,omitempty"`
	PromotionID *string `json:"promotionId,omitempty"`
}

// promotionDTO is one advertised promotion in full — what a banner tap opens
// (GET /v1/storefront/promotions/:id).
//
// `code` is NOT optional here, unlike on the banner. A promotion detail screen whose entire purpose is
// to hand the shopper a code cannot be missing the code; making it non-nullable puts that in the type
// rather than in a comment nobody reads.
type promotionDTO struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Subtitle *string `json:"subtitle"`
	ImageURL *string `json:"imageUrl"`
	Code     string  `json:"code"`
	Terms    *string `json:"terms"`
	Validity *string `json:"validity"`
}

type homeDTO struct {
	Banners []bannerDTO `json:"banners"`
	Rails   []railDTO   `json:"rails"`
}

type categoryDTO struct {
	Key       string  `json:"key"`
	Name      string  `json:"name"`
	ParentKey *string `json:"parentKey"`
	// 025: productCount drives "N items" and the empty-category case; imageUrl is derived (null when
	// no product in the category has media).
	ProductCount int     `json:"productCount"`
	ImageURL     *string `json:"imageUrl"`
}

type mediaDTO struct {
	ImageURL string  `json:"imageUrl"`
	Alt      *string `json:"alt"`
}

type attributeItemDTO struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type attributeGroupDTO struct {
	GroupLabel string             `json:"groupLabel"`
	Items      []attributeItemDTO `json:"items"`
}

type productDetailDTO struct {
	productCardDTO
	LongDescription *string             `json:"longDescription"`
	Gallery         []mediaDTO          `json:"gallery"`
	Attributes      []attributeGroupDTO `json:"attributes"`
	CategoryPath    []string            `json:"categoryPath"`
	CategoryKey     string              `json:"categoryKey"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) getHome(c *gin.Context) {
	home, err := h.svc.Home(c.Request.Context())
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("storefront: home read failed", zap.Error(err))
		httpx.Unavailable(c)
		return
	}
	rails := make([]railDTO, 0, len(home.Rails))
	for _, r := range home.Rails {
		rails = append(rails, railDTO{Key: r.Key, Title: r.Title, Products: toCardDTOs(r.Products)})
	}
	banners := make([]bannerDTO, 0, len(home.Banners))
	for _, b := range home.Banners {
		var target *bannerTargetDTO
		if b.Target != nil {
			target = &bannerTargetDTO{
				Kind: b.Target.Kind, CategoryKey: b.Target.CategoryKey,
				ProductID: b.Target.ProductID, PromotionID: b.Target.PromotionID,
			}
		}
		banners = append(banners, bannerDTO{
			Key: b.Key, Title: b.Title, Subtitle: b.Subtitle, ImageURL: b.ImageURL, Href: b.Href,
			Code: b.Code, Terms: b.Terms, Position: b.Position, Target: target,
			Placement: b.Placement,
		})
	}
	c.JSON(http.StatusOK, homeDTO{Banners: banners, Rails: rails})
}

func (h *Handler) getCategories(c *gin.Context) {
	cats, err := h.svc.Categories(c.Request.Context())
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("storefront: categories read failed", zap.Error(err))
		httpx.Unavailable(c)
		return
	}
	out := make([]categoryDTO, 0, len(cats))
	for _, cat := range cats {
		var img *string
		if cat.ImageURL != "" {
			url := cat.ImageURL
			img = &url
		}
		out = append(out, categoryDTO{
			Key: cat.Key, Name: cat.Name, ParentKey: cat.ParentKey,
			ProductCount: cat.ProductCount, ImageURL: img,
		})
	}
	c.JSON(http.StatusOK, out)
}

// getPromotion serves the detail behind a banner tap.
//
// ⚠ NOT cached. Every other read here sets a Cache-Control, and this one deliberately does not: the
// response is a live claim about a promotion that can be exhausted by other shoppers at any moment,
// and a cached "still available" is the one wrong answer that costs a shopper a wasted trip to the
// cart. The read is a single indexed row.
func (h *Handler) getPromotion(c *gin.Context) {
	promo, found, err := h.svc.Promotion(c.Request.Context(), c.Param("id"))
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("storefront: promotion read failed", zap.Error(err))
		httpx.Unavailable(c)
		return
	}
	if !found {
		httpx.NotFound(c)
		return
	}
	c.JSON(http.StatusOK, promotionDTO{
		ID: promo.ID, Title: promo.Title, Subtitle: promo.Subtitle, ImageURL: promo.ImageURL,
		Code: promo.Code, Terms: promo.Terms, Validity: promo.Validity,
	})
}

func (h *Handler) getProductByID(c *gin.Context) {
	id := c.Param("id")
	detail, found, err := h.svc.ProductDetail(c.Request.Context(), id)
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("storefront: product detail failed", zap.Error(err))
		httpx.Unavailable(c)
		return
	}
	if !found {
		httpx.NotFound(c)
		return
	}

	gallery := make([]mediaDTO, 0, len(detail.Gallery))
	for _, m := range detail.Gallery {
		gallery = append(gallery, mediaDTO{ImageURL: m.ImageURL, Alt: m.Alt})
	}
	groups := make([]attributeGroupDTO, 0, len(detail.Attributes))
	for _, g := range detail.Attributes {
		items := make([]attributeItemDTO, 0, len(g.Items))
		for _, it := range g.Items {
			items = append(items, attributeItemDTO{Label: it.Label, Value: it.Value})
		}
		groups = append(groups, attributeGroupDTO{GroupLabel: g.GroupLabel, Items: items})
	}
	card := toCardDTOs([]ProductCard{detail.Card})[0]

	c.JSON(http.StatusOK, productDetailDTO{
		productCardDTO:  card,
		LongDescription: detail.LongDescription,
		Gallery:         gallery,
		Attributes:      groups,
		CategoryPath:    detail.CategoryPath,
		CategoryKey:     detail.CategoryKey,
	})
}

// getProducts serves two forms: the recently-viewed hydration variant (?ids=csv), and the full
// search/browse form (q + filters + keyset cursor — US4). Both return ProductSearchResultDTO.
func (h *Handler) getProducts(c *gin.Context) {
	if idsParam := strings.TrimSpace(c.Query("ids")); idsParam != "" {
		cards, err := h.svc.CardsByIDs(c.Request.Context(), splitCSV(idsParam))
		if err != nil {
			logger.FromContext(c.Request.Context()).Error("storefront: products-by-ids failed", zap.Error(err))
			httpx.Unavailable(c)
			return
		}
		// The by-ids form is a hydration helper, not a search: it has no ordering to speak of and its
		// total is simply what was asked for.
		c.JSON(http.StatusOK, gin.H{
			"items":      toCardDTOs(cards),
			"nextCursor": nil,
			"total":      len(cards),
			"sort":       string(SortNewest),
		})
		return
	}

	limit := 0
	if n, err := strconv.Atoi(c.Query("limit")); err == nil {
		limit = n
	}

	// An unrecognised sort is refused rather than silently defaulted. A shopper who asked for
	// "cheapest" and was given "newest" without being told has been misinformed about what they are
	// looking at, and would have no way to notice.
	sort, ok := ParseSort(c.Query("sort"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_sort"})
		return
	}

	res, err := h.svc.Search(c.Request.Context(), SearchQuery{
		Q:           strings.TrimSpace(c.Query("q")),
		CategoryKey: c.Query("categoryKey"),
		MinPrice:    c.Query("minPrice"),
		MaxPrice:    c.Query("maxPrice"),
		SaleOnly:    c.Query("saleOnly") == "true",
		Brands:      nonEmptyValues(c.Request.URL.Query()["brand"]),
		Attributes:  attributeFacets(c),
		Sort:        sort,
		Cursor:      c.Query("cursor"),
		Limit:       limit,
	})
	if errors.Is(err, ErrCursorSortMismatch) {
		// 400, not a silent reinterpretation (FR-016b). See the note on Cursor.
		c.JSON(http.StatusBadRequest, gin.H{"error": "cursor_sort_mismatch"})
		return
	}
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("storefront: search failed", zap.Error(err))
		httpx.Unavailable(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":      toCardDTOs(res.Cards),
		"nextCursor": res.NextCursor,
		"total":      res.Total,
		// The sort ACTUALLY applied — may differ from the request (relevance without a query).
		"sort": string(res.Sort),
	})
}

// Facet wire DTOs (043, storefront.ts FacetSetDTO family). Counts are ints; money is a string.
type facetOptionDTO struct {
	Value string `json:"value"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

type facetDTO struct {
	Key     string           `json:"key"`
	Label   string           `json:"label"`
	Type    string           `json:"type"`
	Options []facetOptionDTO `json:"options"`
}

type priceBoundsDTO struct {
	Min string `json:"min"`
	Max string `json:"max"`
}

type facetSetDTO struct {
	PriceBounds *priceBoundsDTO `json:"priceBounds"`
	Facets      []facetDTO      `json:"facets"`
}

// getFacets serves the available facets + per-option counts for a query + applied filters (043 US2).
// Same filter params as getProducts, minus paging/sort. Public and cacheable.
func (h *Handler) getFacets(c *gin.Context) {
	minPrice := c.Query("minPrice")
	maxPrice := c.Query("maxPrice")
	if !validPrice(minPrice) || !validPrice(maxPrice) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_price"})
		return
	}

	fs, err := h.svc.Facets(c.Request.Context(), SearchQuery{
		Q:           strings.TrimSpace(c.Query("q")),
		CategoryKey: c.Query("categoryKey"),
		MinPrice:    minPrice,
		MaxPrice:    maxPrice,
		SaleOnly:    c.Query("saleOnly") == "true",
		Brands:      nonEmptyValues(c.Request.URL.Query()["brand"]),
		Attributes:  attributeFacets(c),
	})
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("storefront: facets read failed", zap.Error(err))
		httpx.Unavailable(c)
		return
	}

	facets := make([]facetDTO, 0, len(fs.Facets))
	for _, f := range fs.Facets {
		opts := make([]facetOptionDTO, 0, len(f.Options))
		for _, o := range f.Options {
			opts = append(opts, facetOptionDTO{Value: o.Value, Label: o.Label, Count: o.Count})
		}
		facets = append(facets, facetDTO{Key: f.Key, Label: f.Label, Type: f.Type, Options: opts})
	}
	var pb *priceBoundsDTO
	if fs.PriceBounds != nil {
		pb = &priceBoundsDTO{Min: fs.PriceBounds.Min, Max: fs.PriceBounds.Max}
	}
	c.JSON(http.StatusOK, facetSetDTO{PriceBounds: pb, Facets: facets})
}

// validPrice accepts empty (no bound) or a parseable decimal; anything else is refused before it
// reaches the SQL numeric cast (which would surface as a 503).
func validPrice(s string) bool {
	if s == "" {
		return true
	}
	_, err := strconv.ParseFloat(s, 64)
	return err == nil
}

// attributeFacets collects `attr.<key>=<value>` query params, keeping ALL repeated values per key
// (OR within a facet — 043 FR-003). Facets are query params, never a path.
func attributeFacets(c *gin.Context) map[string][]string {
	facets := map[string][]string{}
	for key, vals := range c.Request.URL.Query() {
		if after, ok := strings.CutPrefix(key, "attr."); ok {
			if kept := nonEmptyValues(vals); len(kept) > 0 {
				facets[after] = kept
			}
		}
	}
	if len(facets) == 0 {
		return nil
	}
	return facets
}

// nonEmptyValues drops blank entries from a repeated query param, returning nil when none remain.
func nonEmptyValues(vals []string) []string {
	out := make([]string, 0, len(vals))
	for _, v := range vals {
		if t := strings.TrimSpace(v); t != "" {
			out = append(out, t)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func toCardDTOs(cards []ProductCard) []productCardDTO {
	out := make([]productCardDTO, 0, len(cards))
	for _, card := range cards {
		var img *string
		if card.ImageURL != "" {
			img = &card.ImageURL
		}
		out = append(out, productCardDTO{
			ID:              card.ID,
			Name:            card.Name,
			Brand:           card.Brand,
			ImageURL:        img,
			PriceAmount:     card.PriceAmount,
			Currency:        card.Currency,
			CompareAtAmount: card.CompareAtAmount,
			Badges:          card.Badges,
			Available:       card.Available,
		})
	}
	return out
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
