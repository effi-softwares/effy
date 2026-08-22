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

type createIntentRequest struct {
	AddressID        string `json:"addressId"`
	BillingAddressID string `json:"billingAddressId"`
	// 047: the order-level delivery preference ("same_day" or "standard", default standard). Applied per
	// package where offered; the server prices it and never takes a fee from the client (FR-036/044).
	DeliveryMethod string `json:"deliveryMethod"`
}

type createIntentResponse struct {
	OrderID          string `json:"orderId"`
	OrderNumber      string `json:"orderNumber"`
	ClientSecret     string `json:"clientSecret"`
	PublishableKey   string `json:"publishableKey"`
	GrandTotalAmount string `json:"grandTotalAmount"`
	Currency         string `json:"currency"`
}

type quoteRequest struct {
	AddressID string `json:"addressId"`
}

// Delivery quote DTOs (047) — mirror @effy/shared-types DeliveryQuoteDTO. Money is a 2-dp decimal string.
type quoteOptionDTO struct {
	Method       string  `json:"method"`
	FeeAmount    string  `json:"feeAmount"`
	PromisedFrom *string `json:"promisedFrom"`
	PromisedTo   *string `json:"promisedTo"`
}

type quotePackageDTO struct {
	ShopRef string           `json:"shopRef"`
	Options []quoteOptionDTO `json:"options"`
}

type deliveryQuoteDTO struct {
	Postcode              string            `json:"postcode"`
	Serviced              bool              `json:"serviced"`
	SameDayAvailableUntil *string           `json:"sameDayAvailableUntil"`
	Packages              []quotePackageDTO `json:"packages"`
	ExpiresAt             string            `json:"expiresAt"`
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
		IntentInput{AddressID: req.AddressID, BillingAddressID: req.BillingAddressID, DeliveryMethod: req.DeliveryMethod}, time.Now())
	if err != nil {
		switch {
		case errors.Is(err, ErrEmptyCart):
			httpx.ValidationFailed(c, "your cart has no items available to purchase")
		case errors.Is(err, ErrAddressNotFound):
			httpx.ValidationFailed(c, "choose a valid delivery address")
		case errors.Is(err, ErrNotServiceable):
			// 047 FR-002: the single "we don't deliver there yet" outcome.
			httpx.ValidationFailed(c, "we don't deliver to this address yet")
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

// quote previews delivery for the cart to a chosen address (047 US1): the GST-inclusive standard fee per
// package and the order total, shown BEFORE payment so the fee is never a surprise (no drip). Reinstated
// after delivery was withdrawn — for US1 there is one option (standard); same-day joins it in US2.
func (h *Handler) quote(c *gin.Context) {
	var req quoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "addressId is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	q, err := h.svc.QuoteForCheckout(c.Request.Context(), cust.ID, req.AddressID, time.Now())
	if err != nil {
		if errors.Is(err, ErrAddressNotFound) {
			httpx.ValidationFailed(c, "choose a valid delivery address")
			return
		}
		logger.FromContext(c.Request.Context()).Error("checkout: quote failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	out := deliveryQuoteDTO{Postcode: q.Postcode, Serviced: q.Serviced, Packages: []quotePackageDTO{}}
	if q.Serviced {
		out.ExpiresAt = q.ExpiresAt.Format(time.RFC3339)
		if q.SameDayUntil != nil {
			s := q.SameDayUntil.Format(time.RFC3339)
			out.SameDayAvailableUntil = &s
		}
		for _, p := range q.Packages {
			opts := make([]quoteOptionDTO, 0, len(p.Options))
			for _, o := range p.Options {
				opts = append(opts, quoteOptionDTO{Method: o.Method, FeeAmount: money.FormatCents(o.FeeCents)})
			}
			out.Packages = append(out.Packages, quotePackageDTO{ShopRef: p.ShopRef, Options: opts})
		}
	}
	c.JSON(http.StatusOK, out)
}

// Register mounts the customer checkout routes (auth+identity) and the public signature-verified webhook.
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/checkout", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.POST("/quote", h.quote) // 047: delivery preview before payment
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
