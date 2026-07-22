package checkout

import (
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

const maxWebhookBody = 1 << 20 // 1 MiB — Stripe events are small; cap the raw read.

type deliverySelectionReq struct {
	PackageKey    string `json:"packageKey"`
	Method        string `json:"method"`
	ScheduledDate string `json:"scheduledDate"`
}

type createIntentRequest struct {
	AddressID           string                 `json:"addressId"`
	BillingAddressID    string                 `json:"billingAddressId"`
	QuoteID             string                 `json:"quoteId"`
	Selections          []deliverySelectionReq `json:"selections"`
	ExcludedPackageKeys []string               `json:"excludedPackageKeys"`
}

type deliveryBreakdownLine struct {
	PackageKey   string `json:"packageKey"`
	ServiceLevel string `json:"serviceLevel"`
	FeeAmount    string `json:"feeAmount"`
}

type createIntentResponse struct {
	OrderID           string                  `json:"orderId"`
	OrderNumber       string                  `json:"orderNumber"`
	ClientSecret      string                  `json:"clientSecret"`
	PublishableKey    string                  `json:"publishableKey"`
	GrandTotalAmount  string                  `json:"grandTotalAmount"`
	Currency          string                  `json:"currency"`
	DeliveryBreakdown []deliveryBreakdownLine `json:"deliveryBreakdown"`
}

type quoteRequest struct {
	AddressID string `json:"addressId"`
}

type confirmRequest struct {
	OrderID string `json:"orderId"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) createIntent(c *gin.Context) {
	var req createIntentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "addressId is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	sels := make([]DeliverySelection, 0, len(req.Selections))
	for _, s := range req.Selections {
		sels = append(sels, DeliverySelection{PackageKey: s.PackageKey, Method: s.Method, ScheduledDate: s.ScheduledDate})
	}
	res, err := h.svc.CreateCheckoutIntent(c.Request.Context(), cust.ID,
		IntentInput{AddressID: req.AddressID, BillingAddressID: req.BillingAddressID, Selections: sels, ExcludedKeys: req.ExcludedPackageKeys}, time.Now())
	if err != nil {
		switch {
		case errors.Is(err, ErrEmptyCart), errors.Is(err, ErrNoServiceableItems):
			httpx.ValidationFailed(c, "your cart has no items available to purchase")
		case errors.Is(err, ErrAddressNotFound):
			httpx.ValidationFailed(c, "choose a valid delivery address")
		case errors.Is(err, ErrQuoteExpired), errors.Is(err, ErrSelectionInvalid), errors.Is(err, ErrExclusionMismatch):
			// The customer must re-quote — 409 tells the client to re-open the delivery step (021 FR-011a).
			httpx.Conflict(c, "your delivery options changed — please review them again")
		default:
			logger.FromContext(c.Request.Context()).Error("checkout: intent failed", zap.Error(err))
			httpx.Internal(c)
		}
		return
	}
	breakdown := make([]deliveryBreakdownLine, 0, len(res.DeliveryBreakdown))
	for _, b := range res.DeliveryBreakdown {
		breakdown = append(breakdown, deliveryBreakdownLine{PackageKey: b.PackageKey, ServiceLevel: b.ServiceLevel, FeeAmount: b.FeeAmount})
	}
	c.JSON(http.StatusOK, createIntentResponse{
		OrderID: res.OrderID, OrderNumber: res.OrderNumber, ClientSecret: res.ClientSecret,
		PublishableKey: res.PublishableKey, GrandTotalAmount: res.GrandTotal, Currency: res.Currency,
		DeliveryBreakdown: breakdown,
	})
}

// quote is the per-package delivery-options endpoint (021 US1). No shop identity ever leaves it.
func (h *Handler) quote(c *gin.Context) {
	var req quoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "addressId is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	res, err := h.svc.Quote(c.Request.Context(), cust.ID, req.AddressID, time.Now())
	if err != nil {
		switch {
		case errors.Is(err, ErrEmptyCart):
			httpx.ValidationFailed(c, "your cart has no items available to purchase")
		case errors.Is(err, ErrAddressNotFound):
			httpx.ValidationFailed(c, "choose a valid delivery address")
		default:
			logger.FromContext(c.Request.Context()).Error("checkout: quote failed", zap.Error(err))
			httpx.Internal(c)
		}
		return
	}
	c.JSON(http.StatusOK, toQuoteResponse(res))
}

func (h *Handler) confirm(c *gin.Context) {
	var req confirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "orderId is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	res, err := h.svc.Confirm(c.Request.Context(), cust.ID, req.OrderID)
	if err != nil {
		if errors.Is(err, ErrOrderNotFound) {
			httpx.NotFound(c)
			return
		}
		logger.FromContext(c.Request.Context()).Error("checkout: confirm failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"orderId": res.OrderID, "paid": res.Paid})
}

// webhook is the authoritative finalizer. Raw body + signature verification — NO pool authorizer (the
// sanctioned webhook exception, ARCHITECTURE.md). A bad signature is 400; a processed event is 200.
func (h *Handler) webhook(c *gin.Context) {
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maxWebhookBody))
	if err != nil {
		httpx.ValidationFailed(c, "could not read request body")
		return
	}
	signature := c.GetHeader("Stripe-Signature")
	if err := h.svc.HandleWebhook(c.Request.Context(), body, signature); err != nil {
		// A signature/verification failure must not be retried by Stripe as a 5xx; it is a 400.
		logger.FromContext(c.Request.Context()).Warn("checkout: webhook rejected", zap.String("reason", err.Error()))
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	c.Status(http.StatusOK)
}

// Register mounts the customer checkout routes (auth+identity) and the public signature-verified webhook.
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/checkout", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.POST("/quote", h.quote)
	g.POST("/intent", h.createIntent)
	g.POST("/confirm", h.confirm)

	// Stripe → server-to-server, no Cognito token; authenticated by the Stripe signature (raw body).
	v1.POST("/stripe/webhook", h.webhook)
}

// quote response DTOs — anonymous (no shop identity, no carrier; FR-019/FR-020).
type quoteOptionDTO struct {
	Method        string   `json:"method"`
	ServiceLevel  string   `json:"serviceLevel"`
	FeeAmount     string   `json:"feeAmount"`
	Window        *string  `json:"window"`
	ScheduleDates []string `json:"scheduleDates"`
}
type quotePackageItemDTO struct {
	ProductID string  `json:"productId"`
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	ImageURL  *string `json:"imageUrl"`
}
type quotePackageDTO struct {
	PackageKey  string                `json:"packageKey"`
	Items       []quotePackageItemDTO `json:"items"`
	Serviceable bool                  `json:"serviceable"`
	Methods     []quoteOptionDTO      `json:"methods"`
}
type quoteResponseDTO struct {
	Packages  []quotePackageDTO `json:"packages"`
	QuoteID   string            `json:"quoteId"`
	ExpiresAt string            `json:"expiresAt"`
}

func toQuoteResponse(r QuoteResult) quoteResponseDTO {
	pkgs := make([]quotePackageDTO, 0, len(r.Packages))
	for _, p := range r.Packages {
		items := make([]quotePackageItemDTO, 0, len(p.Items))
		for _, it := range p.Items {
			var img *string
			if it.ImageURL != "" {
				v := it.ImageURL
				img = &v
			}
			items = append(items, quotePackageItemDTO{ProductID: it.ProductID, Name: it.Name, Quantity: it.Quantity, ImageURL: img})
		}
		methods := make([]quoteOptionDTO, 0, len(p.Options))
		for _, o := range p.Options {
			var win *string
			if o.Window != "" {
				v := o.Window
				win = &v
			}
			methods = append(methods, quoteOptionDTO{Method: o.Method, ServiceLevel: o.ServiceLevel, FeeAmount: moneyStr(o.FeeCents), Window: win, ScheduleDates: o.ScheduleDates})
		}
		pkgs = append(pkgs, quotePackageDTO{PackageKey: p.PackageKey, Items: items, Serviceable: p.Serviceable, Methods: methods})
	}
	return quoteResponseDTO{Packages: pkgs, QuoteID: r.QuoteID, ExpiresAt: r.ExpiresAt.UTC().Format(time.RFC3339)}
}
