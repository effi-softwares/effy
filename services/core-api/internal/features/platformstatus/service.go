// Service layer: business shaping, deadlines, no HTTP, no SQL. Version-NEUTRAL —
// /v1 and /v2 handlers share this service unchanged (research A3).
package platformstatus

import (
	"context"
	"time"
)

const readTimeout = 3 * time.Second

// PlatformStatus is the domain model (data-model.md §4).
type PlatformStatus struct {
	Environment       string
	DatabaseName      string
	DatabaseTime      time.Time
	MigrationVersion  int64
	MigrationsApplied int64
}

// StatusReader is the repository seam; hand-rolled fakes implement it in tests.
type StatusReader interface {
	Status(ctx context.Context) (PlatformStatus, error)
}

type Service struct {
	repo StatusReader
	env  string
}

func NewService(repo StatusReader, env string) *Service {
	return &Service{repo: repo, env: env}
}

func (s *Service) Get(ctx context.Context) (PlatformStatus, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	status, err := s.repo.Status(ctx)
	if err != nil {
		return PlatformStatus{}, err
	}
	status.Environment = s.env
	return status, nil
}
