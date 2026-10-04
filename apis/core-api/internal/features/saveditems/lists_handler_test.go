package saveditems

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// ── Refusals on the wire (068 contract §2) ──────────────────────────────────────────────────────
//
// A client tells refusals apart by the LAST SEGMENT of the problem's `type`. This pins each one to
// its status and reason: the web chooser, the mobile sheet and the heart all switch on these.

func TestRefusalsCarryAStatusAndAReasonAClientCanSwitchOn(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct {
		err    error
		status int
		reason string
	}{
		{ErrInNamedLists, http.StatusConflict, "in-named-lists"},
		{ErrNameTaken, http.StatusConflict, "name-taken"},
		{ErrListNotFound, http.StatusNotFound, "list-not-found"},
		{ErrInvalidName, http.StatusBadRequest, "invalid-name"},
		{ErrListLimit, http.StatusBadRequest, "list-limit"},
		{ErrDefaultList, http.StatusBadRequest, "default-list"},
		{ErrCapReached, http.StatusBadRequest, "saved-items-cap-reached"},
	}
	for _, tc := range cases {
		t.Run(tc.reason, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/lists", nil)

			(&Handler{}).respond(c, tc.err)

			require.Equal(t, tc.status, w.Code)
			var p struct {
				Type   string `json:"type"`
				Detail string `json:"detail"`
			}
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &p))
			require.Equal(t, "https://effyshopping.com/problems/"+tc.reason, p.Type)
			require.NotEmpty(t, p.Detail)
		})
	}
}

// TestARefusalCannotEchoAName — FR-040. `respond` is handed the ERROR and nothing else: the sentinel
// errors carry no request data, so there is no path by which a shopper's list name could reach a
// refusal body or the log line beside it. This asserts the sentinels stay that way.
func TestARefusalCannotEchoAName(t *testing.T) {
	for _, err := range []error{ErrNameTaken, ErrInvalidName, ErrListLimit, ErrDefaultList, ErrListNotFound, ErrInNamedLists} {
		require.NotContains(t, err.Error(), "%", "a sentinel must not be a format string")
	}
	_, err := NormaliseListName("zz-sentinel-068 " + string(make([]byte, 0)) + "this name is far longer than forty characters")
	require.Error(t, err)
	require.NotContains(t, err.Error(), "zz-sentinel-068")
}

func TestSuccessIsNoContent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodDelete, "/v1/lists/x", nil)
	(&Handler{}).respond(c, nil)
	c.Writer.WriteHeaderNow()
	require.Equal(t, http.StatusNoContent, w.Code)
}
