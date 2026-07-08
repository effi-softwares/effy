// Package logger builds the service's zap logger and carries the request-scoped
// derivative through the request context. The base logger is an explicit dependency
// (manual DI); only per-request enrichment travels via context (research B5).
package logger

import (
	"context"
	"fmt"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type ctxKey struct{}

// New builds the production JSON logger. Sampling is disabled in dev so no local
// diagnostics are dropped; production keeps zap's default sampler.
func New(level, env string) (*zap.Logger, error) {
	lvl, err := zapcore.ParseLevel(level)
	if err != nil {
		return nil, fmt.Errorf("logger: invalid LOG_LEVEL %q: %w", level, err)
	}

	cfg := zap.NewProductionConfig()
	cfg.Level = zap.NewAtomicLevelAt(lvl)
	cfg.EncoderConfig.TimeKey = "ts"
	cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	if env == "dev" {
		cfg.Sampling = nil
	}

	l, err := cfg.Build()
	if err != nil {
		return nil, fmt.Errorf("logger: %w", err)
	}
	return l.With(zap.String("service", "core-api"), zap.String("env", env)), nil
}

// WithContext returns a context carrying the request-scoped logger.
func WithContext(ctx context.Context, l *zap.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, l)
}

// FromContext returns the request-scoped logger, or a no-op logger outside a request.
// Handlers always run under the logging middleware, so the fallback never drops
// request logs — it only silences misuse from non-request code paths.
func FromContext(ctx context.Context) *zap.Logger {
	if l, ok := ctx.Value(ctxKey{}).(*zap.Logger); ok {
		return l
	}
	return zap.NewNop()
}
