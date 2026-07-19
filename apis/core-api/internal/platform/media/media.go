// Package media mints short-lived presigned S3 GET URLs for product images (research R7).
//
// The product-media bucket (016) is PRIVATE; core-api never proxies image bytes — it hands the client
// a signed, expiring direct-to-S3 GET URL for each product_media.storage_key. Uses the s3 service
// package's built-in PresignClient (no separate presigner module). A public CDN is a later slice.
package media

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// presignTTL is deliberately short — a URL only needs to outlive the page render (research R7).
const presignTTL = 15 * time.Minute

// Presigner is the seam services depend on; a fake implements it in tests so services never need a
// live S3 client.
type Presigner interface {
	PresignGet(ctx context.Context, storageKey string) (string, error)
}

// Resolver mints presigned GET URLs from a bucket using an s3 PresignClient.
type Resolver struct {
	bucket   string
	presign  *s3.PresignClient
	duration time.Duration
}

// NewResolver builds the resolver from an already-constructed s3 client (wired in main from awsCfg).
func NewResolver(client *s3.Client, bucket string) *Resolver {
	return &Resolver{
		bucket:   bucket,
		presign:  s3.NewPresignClient(client),
		duration: presignTTL,
	}
}

// PresignGet returns a signed GET URL for storageKey, valid for presignTTL. An empty key yields "".
func (r *Resolver) PresignGet(ctx context.Context, storageKey string) (string, error) {
	if storageKey == "" {
		return "", nil
	}
	req, err := r.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(r.bucket),
		Key:    aws.String(storageKey),
	}, s3.WithPresignExpires(r.duration))
	if err != nil {
		return "", fmt.Errorf("media: presign %q: %w", storageKey, err)
	}
	return req.URL, nil
}
