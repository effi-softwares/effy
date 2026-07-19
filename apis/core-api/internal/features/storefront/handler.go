// Handler layer: HTTP only — call the service, map domain → wire DTO. The storefront reads are PUBLIC
// (no auth) and cacheable. Wire shapes mirror @effy/shared-types storefront.ts (contracts/shared-dtos).
package storefront

import (
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
}

type homeDTO struct {
	Banners []bannerDTO `json:"banners"`
	Rails   []railDTO   `json:"rails"`
}

type categoryDTO struct {
	Key       string  `json:"key"`
	Name      string  `json:"name"`
	ParentKey *string `json:"parentKey"`
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
		banners = append(banners, bannerDTO{Key: b.Key, Title: b.Title, Subtitle: b.Subtitle, ImageURL: b.ImageURL, Href: b.Href})
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
		out = append(out, categoryDTO{Key: cat.Key, Name: cat.Name, ParentKey: cat.ParentKey})
	}
	c.JSON(http.StatusOK, out)
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
		c.JSON(http.StatusOK, gin.H{"items": toCardDTOs(cards), "nextCursor": nil})
		return
	}

	limit := 0
	if n, err := strconv.Atoi(c.Query("limit")); err == nil {
		limit = n
	}
	res, err := h.svc.Search(c.Request.Context(), SearchQuery{
		Q:           strings.TrimSpace(c.Query("q")),
		CategoryKey: c.Query("categoryKey"),
		MinPrice:    c.Query("minPrice"),
		MaxPrice:    c.Query("maxPrice"),
		SaleOnly:    c.Query("saleOnly") == "true",
		Attributes:  attributeFacets(c),
		Cursor:      c.Query("cursor"),
		Limit:       limit,
	})
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("storefront: search failed", zap.Error(err))
		httpx.Unavailable(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": toCardDTOs(res.Cards), "nextCursor": res.NextCursor})
}

// attributeFacets collects `attr.<key>=<value>` query params (facets are query params, never a path).
func attributeFacets(c *gin.Context) map[string]string {
	facets := map[string]string{}
	for key, vals := range c.Request.URL.Query() {
		if after, ok := strings.CutPrefix(key, "attr."); ok && len(vals) > 0 && vals[0] != "" {
			facets[after] = vals[0]
		}
	}
	if len(facets) == 0 {
		return nil
	}
	return facets
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
