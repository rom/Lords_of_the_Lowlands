package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"unicode/utf8"

	"github.com/rom/lords_of_the_lowlands/internal/game"
	"github.com/rom/lords_of_the_lowlands/internal/store"
)

// FuzzParseClientMsg feeds arbitrary bytes to the WebSocket message parser.
// Invariants: no panic; accepted messages respect all field limits.
func FuzzParseClientMsg(f *testing.F) {
	for _, s := range []string{
		`{"t":"ping"}`, `{"t":"chat","ch":"global","text":"hello"}`, `{"t":"chat","ch":"whisper","to":"bob","text":"hi"}`,
		`{"t":"create","level":"campaign-01","name":"x"}`, `{"t":"slot","slot":2,"kind":"ai","diff":"hard","team":3}`,
		`{"t":"cmd","cmd":{"c":"move","ids":[1,2,3],"x":1.5,"y":2.5}}`, `{"t":"cmd","cmd":{"c":"build","w":"house","x":3,"y":4,"ids":[9]}}`,
		`{"t":"quick","opp":3,"skirmish":{"theme":"mars","size":64,"startAge":3,"maxAge":5,"seed":1}}`, `{}`, `[]`, `null`, `{"t":"chat","text":"‮"}`,
	} {
		f.Add([]byte(s))
	}
	f.Fuzz(func(t *testing.T, b []byte) {
		m, err := ParseClientMsg(b)
		if err != nil {
			return
		}
		if !validTypes[m.T] || !validDiff[m.Diff] || m.Team < 0 || m.Team > 8 || m.Slot < 0 || m.Slot >= game.MaxPlayers {
			t.Fatalf("invalid message accepted: %+v", m)
		}
		if m.T == "chat" {
			if m.Text == "" || utf8.RuneCountInString(m.Text) > MaxChatLen || !utf8.ValidString(m.Text) {
				t.Fatalf("bad chat text accepted: %q", m.Text)
			}
			for _, r := range m.Text {
				if r < 0x20 || r == 0x7f {
					t.Fatalf("control character in chat: %q", m.Text)
				}
			}
		}
		if m.T == "cmd" && (m.Cmd == nil || len(m.Cmd.IDs) > game.MaxCommandIDs) {
			t.Fatal("bad command accepted")
		}
	})
}

// FuzzHTTPAPI posts arbitrary JSON bodies to every state-changing endpoint.
// Invariants: no panic, no 5xx, responses are JSON.
func FuzzHTTPAPI(f *testing.F) {
	st, err := store.Open(f.TempDir())
	if err != nil {
		f.Fatal(err)
	}
	s, _ := New(Config{Store: st})
	s.apiLimit = NewLimiter(1e9, 1e9)
	s.authLimit = NewLimiter(1e9, 1e9)
	h := s.Handler()
	paths := []string{"/api/register", "/api/login", "/api/guest", "/api/levels", "/api/generate", "/api/logout"}
	for i, b := range []string{
		`{"name":"Alice","password":"password1"}`, `{"name":"x"}`, `{"theme":"moon","size":40,"players":3}`,
		`{"name":"L","width":24,"height":24,"tiles":"0","starts":[]}`, `{}`, `"str"`, `{"name":` + "\"\xff\"" + `}`,
	} {
		f.Add(uint8(i), []byte(b))
	}
	// a logged-in session cookie so /api/levels is reachable
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/api/register", bytes.NewReader([]byte(`{"name":"Fuzzer","password":"password1"}`)))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	cookie := rr.Result().Cookies()
	f.Fuzz(func(t *testing.T, which uint8, body []byte) {
		p := paths[int(which)%len(paths)]
		req := httptest.NewRequest("POST", p, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		for _, c := range cookie {
			req.AddCookie(c)
		}
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code >= 500 {
			t.Fatalf("%s returned %d for %q", p, rr.Code, body)
		}
		var v interface{}
		if err := json.Unmarshal(rr.Body.Bytes(), &v); err != nil {
			t.Fatalf("%s: non-JSON response %q", p, rr.Body.String())
		}
		if rr.Code == http.StatusCreated && p == "/api/levels" {
			// whatever was stored must re-validate
			for _, m := range st.Levels() {
				l, _ := st.Level(m.ID)
				if err := l.Validate(); err != nil {
					t.Fatalf("stored invalid level: %v", err)
				}
			}
		}
	})
}
