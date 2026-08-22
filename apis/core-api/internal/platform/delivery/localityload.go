package delivery

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// LocalityRow is one parsed CSV row of the au-localities reference dataset.
type LocalityRow struct {
	Postcode     string
	Name         string
	State        string
	Latitude     string // decimal string or "" — a locality with no G-NAF point; stored NULL
	Longitude    string
	AddressCount int
}

// LoadResult reports a load run's outcome. On a clean re-run Upserted == Read (030 idempotence).
type LoadResult struct {
	Read     int
	Upserted int
}

// LoadLocalities upserts every row of an au-localities CSV, idempotent on the (name,state,postcode)
// triple. Expected header (order-independent): postcode, locality|name, state, latitude, longitude,
// address_count. Lat/lng may be blank. A row that violates a table CHECK (bad state, non-4-digit
// postcode) fails LOUDLY rather than being skipped — the dataset is the source of truth and a silent
// drop would hide a corrupt file.
func LoadLocalities(ctx context.Context, q db.DBTX, r io.Reader) (LoadResult, error) {
	cr := csv.NewReader(r)
	cr.FieldsPerRecord = -1
	cr.TrimLeadingSpace = true

	header, err := cr.Read()
	if err != nil {
		return LoadResult{}, fmt.Errorf("load-localities: read header: %w", err)
	}
	idx, err := headerIndex(header)
	if err != nil {
		return LoadResult{}, err
	}

	var res LoadResult
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return res, fmt.Errorf("load-localities: read row %d: %w", res.Read+1, err)
		}
		res.Read++
		row, err := parseRow(rec, idx)
		if err != nil {
			return res, fmt.Errorf("load-localities: row %d: %w", res.Read, err)
		}
		if err := upsertLocality(ctx, q, row); err != nil {
			return res, fmt.Errorf("load-localities: upsert row %d (%s %s %s): %w",
				res.Read, row.Name, row.State, row.Postcode, err)
		}
		res.Upserted++
	}
	return res, nil
}

type colIndex struct{ postcode, name, state, lat, lng, count int }

func headerIndex(header []string) (colIndex, error) {
	pos := map[string]int{}
	for i, h := range header {
		pos[strings.ToLower(strings.TrimSpace(h))] = i
	}
	get := func(names ...string) int {
		for _, n := range names {
			if i, ok := pos[n]; ok {
				return i
			}
		}
		return -1
	}
	idx := colIndex{
		postcode: get("postcode"),
		name:     get("locality", "name", "suburb"),
		state:    get("state"),
		lat:      get("latitude", "lat"),
		lng:      get("longitude", "lng", "long"),
		count:    get("address_count", "addresses", "count"),
	}
	if idx.postcode < 0 || idx.name < 0 || idx.state < 0 {
		return idx, fmt.Errorf("load-localities: header must include postcode, locality/name and state (got %v)", header)
	}
	return idx, nil
}

func parseRow(rec []string, idx colIndex) (LocalityRow, error) {
	at := func(i int) string {
		if i < 0 || i >= len(rec) {
			return ""
		}
		return strings.TrimSpace(rec[i])
	}
	row := LocalityRow{
		Postcode:  at(idx.postcode),
		Name:      at(idx.name),
		State:     strings.ToUpper(at(idx.state)),
		Latitude:  at(idx.lat),
		Longitude: at(idx.lng),
	}
	if c := at(idx.count); c != "" {
		n, err := strconv.Atoi(c)
		if err != nil {
			return row, fmt.Errorf("bad address_count %q: %w", c, err)
		}
		row.AddressCount = n
	}
	return row, nil
}

func upsertLocality(ctx context.Context, q db.DBTX, r LocalityRow) error {
	const sql = `
		INSERT INTO public.locality (name, state, postcode, latitude, longitude, address_count)
		VALUES ($1, $2, $3, NULLIF($4, '')::numeric, NULLIF($5, '')::numeric, $6)
		ON CONFLICT (name, state, postcode) DO UPDATE
		SET latitude      = EXCLUDED.latitude,
		    longitude     = EXCLUDED.longitude,
		    address_count = EXCLUDED.address_count`
	_, err := q.Exec(ctx, sql, r.Name, r.State, r.Postcode, r.Latitude, r.Longitude, r.AddressCount)
	return err
}
