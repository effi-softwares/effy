package platformstatus

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeRepo is a hand-rolled fake of the StatusReader seam (research B9: no gomock).
type fakeRepo struct {
	status PlatformStatus
	err    error
}

func (f *fakeRepo) Status(_ context.Context) (PlatformStatus, error) {
	return f.status, f.err
}

func TestServiceGet(t *testing.T) {
	dbTime := time.Date(2026, 7, 5, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name    string
		repo    *fakeRepo
		wantErr bool
		want    PlatformStatus
	}{
		{
			name: "stamps the environment onto the repository read",
			repo: &fakeRepo{status: PlatformStatus{
				DatabaseName: "effy", DatabaseTime: dbTime,
				MigrationVersion: 20260705095817, MigrationsApplied: 1,
			}},
			want: PlatformStatus{
				Environment: "dev", DatabaseName: "effy", DatabaseTime: dbTime,
				MigrationVersion: 20260705095817, MigrationsApplied: 1,
			},
		},
		{
			name:    "propagates repository errors untouched",
			repo:    &fakeRepo{err: errors.New("relation goose_db_version does not exist")},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := NewService(tt.repo, "dev")
			got, err := svc.Get(context.Background())

			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}
