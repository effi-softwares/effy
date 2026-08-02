package checkout

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
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
	res, err := h.svc.CreateCheckoutIntent(c.Request.Context(), cust.ID,
		IntentInput{AddressID: req.AddressID, BillingAddressID: req.BillingAddressID}, time.Now())
	if err != nil {
		switch {
		case errors.Is(err, ErrEmptyCart):
			httpx.ValidationFailed(c, "your cart has no items available to purchase")
		case errors.Is(err, ErrAddressNotFound):
			httpx.ValidationFailed(c, "choose a valid delivery address")
		case belowMinimum(err) != nil:
			// FR-056: refused here as well as in the cart, so a client that ignores its own gate cannot
			// bypass it. The message carries how much more is needed — never a shop (FR-062).
			e := belowMinimum(err)
			httpx.ValidationFailed(c, fmt.Sprintf(
				"add %s more to reach the %s minimum order",
				money.FormatCents(e.RemainingCents), money.FormatCents(e.MinimumCents),
			))
		default:
			logger.FromContext(c.Request.Context()).Error("checkout: intent failed", zap.Error(err))
			httpx.Internal(c)
		}
		return
	}
	c.JSON(http.StatusOK, createIntentResponse{
		OrderID: res.OrderID, OrderNumber: res.OrderNumber, ClientSecret: res.ClientSecret,
		PublishableKey: res.PublishableKey, GrandTotalAmount: res.GrandTotal, Currency: res.Currency,
	})
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
//
// ⚠ POST /checkout/quote is GONE. The platform has no delivery zones, options or fees, so there is
// nothing to quote: a checkout is the cart's items minus any discount, and the shopper chooses only an
// address.
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/checkout", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.POST("/intent", h.createIntent)
	g.POST("/confirm", h.confirm)

	// Stripe → server-to-server, no Cognito token; authenticated by the Stripe signature (raw body).
	v1.POST("/stripe/webhook", h.webhook)
}

// belowMinimum unwraps the minimum-spend refusal, or nil.
func belowMinimum(err error) *BelowMinimumError {
	var e *BelowMinimumError
	if errors.As(err, &e) {
		return e
	}
	return nil
}
