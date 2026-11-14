package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/coder/websocket"

	"github.com/rom/lords_of_the_lowlands/internal/config"
	"github.com/rom/lords_of_the_lowlands/internal/game"
	"github.com/rom/lords_of_the_lowlands/internal/store"
)

type env struct {
	t   *testing.T
	srv *Server
	ts  *httptest.Server
	st  *store.Store
}

func newEnv(t *testing.T) *env { return newEnvWith(t, nil) }

func newEnvWith(t *testing.T, mod func(c *config.Config)) *env {
	t.Helper()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	set := config.Default()
	if mod != nil {
		mod(set)
	}
	static := fstest.MapFS{"index.html": {Data: []byte("<h1>hi</h1>")}, "js/main.js": {Data: []byte("console.log(1)")}}
	s, err := New(Config{Static: static, Store: st, AllowedOrigins: []string{"game.example"}, Settings: set})
	if err != nil {
		t.Fatal(err)
	}
	// generous limits in tests
	s.apiLimit = NewLimiter(1000, 1000)
	s.authLimit = NewLimiter(1000, 1000)
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(func() { s.Hub().Shutdown(); ts.Close() })
	return &env{t, s, ts, st}
}

type client struct {
	e     *env
	hc    *http.Client
	ws    *websocket.Conn
	ctx   context.Context
	hello map[string]interface{}
	key   []byte
	seq   int64
}

func (e *env) client() *client {
	jar, _ := cookiejar.New(nil)
	return &client{e: e, hc: &http.Client{Jar: jar}, ctx: context.Background()}
}

func (c *client) do(method, path string, body interface{}, hdr map[string]string) (int, map[string]interface{}, http.Header) {
	c.e.t.Helper()
	var r io.Reader
	if body != nil {
		switch b := body.(type) {
		case string:
			r = strings.NewReader(b)
		default:
			j, _ := json.Marshal(body)
			r = bytes.NewReader(j)
		}
	}
	req, _ := http.NewRequest(method, c.e.ts.URL+path, r)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := c.hc.Do(req)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out map[string]interface{}
	_ = json.Unmarshal(raw, &out)
	if out == nil {
		out = map[string]interface{}{"_raw": string(raw)}
	}
	return resp.StatusCode, out, resp.Header
}

func (c *client) guest(name string) {
	c.e.t.Helper()
	if code, out, _ := c.do("POST", "/api/guest", map[string]string{"name": name}, nil); code != 200 {
		c.e.t.Fatalf("guest %d %v", code, out)
	}
}

func (c *client) dial() {
	c.e.t.Helper()
	u, _ := url.Parse(c.e.ts.URL)
	hdr := http.Header{}
	for _, ck := range c.hc.Jar.Cookies(u) {
		hdr.Add("Cookie", ck.Name+"="+ck.Value)
	}
	ws, _, err := websocket.Dial(c.ctx, "ws"+strings.TrimPrefix(c.e.ts.URL, "http")+"/ws", &websocket.DialOptions{HTTPHeader: hdr})
	if err != nil {
		c.e.t.Fatal(err)
	}
	ws.SetReadLimit(1 << 24)
	c.ws = ws
	c.hello = nil
	c.seq = 0
	c.hello = c.expect("hello")
	c.key, _ = base64.StdEncoding.DecodeString(c.hello["key"].(string))
}

// cmd sends a signed game command.
func (c *client) cmd(v map[string]interface{}) {
	b, _ := json.Marshal(v)
	c.seq++
	c.send(map[string]interface{}{"t": "cmd", "p": string(b), "n": c.seq, "mac": Mac(c.key, c.seq, string(b))})
}

func (c *client) send(v interface{}) {
	b, _ := json.Marshal(v)
	if err := c.ws.Write(c.ctx, websocket.MessageText, b); err != nil {
		c.e.t.Fatal(err)
	}
}

// expect reads messages until one of type typ arrives (or times out).
func (c *client) expect(typ string) map[string]interface{} {
	c.e.t.Helper()
	if typ == "hello" && c.hello != nil {
		return c.hello
	}
	ctx, cancel := context.WithTimeout(c.ctx, 5*time.Second)
	defer cancel()
	for {
		_, b, err := c.ws.Read(ctx)
		if err != nil {
			c.e.t.Fatalf("waiting for %s: %v", typ, err)
		}
		var m map[string]interface{}
		json.Unmarshal(b, &m)
		if m["t"] == typ {
			return m
		}
	}
}

func (c *client) expectAny(types ...string) map[string]interface{} {
	c.e.t.Helper()
	ctx, cancel := context.WithTimeout(c.ctx, 5*time.Second)
	defer cancel()
	for {
		_, b, err := c.ws.Read(ctx)
		if err != nil {
			c.e.t.Fatalf("waiting for %v: %v", types, err)
		}
		var m map[string]interface{}
		json.Unmarshal(b, &m)
		for _, t := range types {
			if m["t"] == t {
				return m
			}
		}
	}
}

func TestAuthFlow(t *testing.T) {
	e := newEnv(t)
	c := e.client()
	if code, _, _ := c.do("GET", "/api/me", nil, nil); code != 401 {
		t.Fatal("me without session")
	}
	if code, _, _ := c.do("POST", "/api/register", map[string]string{"name": "Al", "password": "password1"}, nil); code != 400 {
		t.Fatal("bad name")
	}
	if code, _, _ := c.do("POST", "/api/register", `{"name":"Alice","password":"password1","x":1}`, nil); code != 400 {
		t.Fatal("unknown field")
	}
	if code, _, _ := c.do("POST", "/api/register", `{"name":"Alice","password":"password1"}{}`, nil); code != 400 {
		t.Fatal("trailing data")
	}
	code, out, h := c.do("POST", "/api/register", map[string]string{"name": "Alice", "password": "password1"}, nil)
	if code != 201 || out["name"] != "Alice" {
		t.Fatal(code, out)
	}
	ck := h.Get("Set-Cookie")
	if !strings.Contains(ck, "HttpOnly") || !strings.Contains(ck, "SameSite=Strict") {
		t.Fatalf("cookie flags: %s", ck)
	}
	if code, out, _ := c.do("GET", "/api/me", nil, nil); code != 200 || out["name"] != "Alice" || out["stats"] == nil {
		t.Fatal("me", code, out)
	}
	c2 := e.client()
	if code, _, _ := c2.do("POST", "/api/register", map[string]string{"name": "alice", "password": "password1"}, nil); code != 409 {
		t.Fatal("dup register")
	}
	if code, _, _ := c2.do("POST", "/api/guest", map[string]string{"name": "alice"}, nil); code != 409 {
		t.Fatal("guest with registered name")
	}
	if code, _, _ := c2.do("POST", "/api/guest", map[string]string{"name": "!!"}, nil); code != 400 {
		t.Fatal("guest bad name")
	}
	if code, _, _ := c2.do("POST", "/api/guest", "{", nil); code != 400 {
		t.Fatal("guest bad json")
	}
	if code, _, _ := c2.do("POST", "/api/login", map[string]string{"name": "alice", "password": "nope-nope"}, nil); code != 401 {
		t.Fatal("bad login")
	}
	if code, _, _ := c2.do("POST", "/api/login", "[]", nil); code != 400 {
		t.Fatal("bad login json")
	}
	if code, _, _ := c2.do("POST", "/api/login", map[string]string{"name": "alice", "password": "password1"}, nil); code != 200 {
		t.Fatal("login")
	}
	if code, _, _ := c.do("POST", "/api/logout", map[string]string{}, nil); code != 200 {
		t.Fatal("logout")
	}
	if code, _, _ := c.do("GET", "/api/me", nil, nil); code != 401 {
		t.Fatal("me after logout")
	}
	g := e.client()
	g.guest("Wanderer")
	if code, out, _ := g.do("GET", "/api/me", nil, nil); code != 200 || out["guest"] != true {
		t.Fatal("guest me")
	}
	if code, _, _ := e.client().do("POST", "/api/guest", map[string]string{"name": "wanderer"}, nil); code != 409 {
		t.Fatal("guest name in use")
	}
	if code, _, _ := e.client().do("POST", "/api/register", map[string]string{"name": "Wanderer", "password": "password1"}, nil); code != 409 {
		t.Fatal("register name in use by guest")
	}
	// expired sessions
	e.srv.now = func() time.Time { return time.Now().Add(30 * 24 * time.Hour) }
	if code, _, _ := g.do("GET", "/api/me", nil, nil); code != 401 {
		t.Fatal("expired session")
	}
}

func TestSecurityMiddleware(t *testing.T) {
	e := newEnv(t)
	c := e.client()
	code, _, h := c.do("GET", "/", nil, nil)
	if code != 200 {
		t.Fatal("index")
	}
	for _, k := range []string{"Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Cross-Origin-Opener-Policy", "Permissions-Policy"} {
		if h.Get(k) == "" {
			t.Fatalf("missing header %s", k)
		}
	}
	if !strings.Contains(h.Get("Content-Security-Policy"), "script-src 'self'") {
		t.Fatal("csp")
	}
	if _, _, h := c.do("GET", "/js/main.js", nil, nil); !strings.HasPrefix(h.Get("Content-Type"), "text/javascript") {
		t.Fatal("js mime")
	}
	// CSRF: foreign origin rejected, allowed origin accepted
	if code, _, _ := c.do("POST", "/api/guest", map[string]string{"name": "Eve"}, map[string]string{"Origin": "https://evil.example"}); code != 403 {
		t.Fatal("cross-origin accepted")
	}
	if code, _, _ := c.do("POST", "/api/guest", map[string]string{"name": "Eve"}, map[string]string{"Referer": "https://evil.example/x"}); code != 403 {
		t.Fatal("cross-origin referer accepted")
	}
	if code, _, _ := c.do("POST", "/api/guest", map[string]string{"name": "Eve"}, map[string]string{"Sec-Fetch-Site": "cross-site"}); code != 403 {
		t.Fatal("cross-site fetch accepted")
	}
	if code, _, _ := c.do("POST", "/api/guest", map[string]string{"name": "Eve"}, map[string]string{"Origin": "http://game.example"}); code != 200 {
		t.Fatal("allowed origin")
	}
	u, _ := url.Parse(e.ts.URL)
	if code, _, _ := e.client().do("POST", "/api/guest", map[string]string{"name": "Eve2"}, map[string]string{"Origin": "http://" + u.Host}); code != 200 {
		t.Fatal("same origin")
	}
	// content type enforced
	req, _ := http.NewRequest("POST", e.ts.URL+"/api/guest", strings.NewReader(`{"name":"Zed"}`))
	req.Header.Set("Content-Type", "text/plain")
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != 415 {
		t.Fatal("content type")
	}
	resp.Body.Close()
	// body size limit
	big := `{"name":"` + strings.Repeat("a", 2<<20) + `"}`
	if code, _, _ := c.do("POST", "/api/guest", big, nil); code != 400 {
		t.Fatal("big body")
	}
	// rate limiting
	e.srv.apiLimit = NewLimiter(0.001, 2)
	c.do("GET", "/api/defs", nil, nil)
	c.do("GET", "/api/defs", nil, nil)
	if code, _, _ := c.do("GET", "/api/defs", nil, nil); code != 429 {
		t.Fatal("rate limit")
	}
	e.srv.apiLimit = NewLimiter(1000, 1000)
	e.srv.authLimit = NewLimiter(0.001, 1)
	c.do("POST", "/api/login", map[string]string{"name": "a", "password": "b"}, nil)
	if code, _, _ := c.do("POST", "/api/login", map[string]string{"name": "a", "password": "b"}, nil); code != 429 {
		t.Fatal("auth rate limit")
	}
	if code, _, _ := c.do("POST", "/api/register", map[string]string{"name": "a", "password": "b"}, nil); code != 429 {
		t.Fatal("register rate limit")
	}
	if code, _, _ := c.do("GET", "/healthz", nil, nil); code != 200 {
		t.Fatal("health")
	}
	// HSTS only with secure cookies
	st, _ := store.Open(t.TempDir())
	s2, _ := New(Config{Store: st, SecureCookies: true})
	rr := httptest.NewRecorder()
	s2.Handler().ServeHTTP(rr, httptest.NewRequest("GET", "/healthz", nil))
	if rr.Header().Get("Strict-Transport-Security") == "" {
		t.Fatal("hsts")
	}
	if _, err := New(Config{}); err == nil {
		t.Fatal("store required")
	}
}

func TestRecoverer(t *testing.T) {
	e := newEnv(t)
	h := e.srv.recoverer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { panic("boom") }))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest("GET", "/", nil))
	if rr.Code != 500 {
		t.Fatal("recover")
	}
	defer func() {
		if recover() != http.ErrAbortHandler {
			t.Fatal("abort handler must propagate")
		}
	}()
	e.srv.recoverer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { panic(http.ErrAbortHandler) })).ServeHTTP(rr, httptest.NewRequest("GET", "/", nil))
}

func TestLevelsAPI(t *testing.T) {
	e := newEnv(t)
	c := e.client()
	code, out, _ := c.do("GET", "/api/levels", nil, nil)
	camp, _ := out["campaign"].([]interface{})
	if code != 200 || len(camp) < 15 {
		t.Fatal("levels list")
	}
	code, lvl, _ := c.do("GET", "/api/levels/campaign-03", nil, nil)
	if code != 200 || len(lvl["tiles"].(string)) == 0 || lvl["gen"] != nil {
		t.Fatal("materialized level")
	}
	if code, _, _ := c.do("GET", "/api/levels/nope", nil, nil); code != 404 {
		t.Fatal("missing level")
	}
	// generate a map for the editor
	code, gen, _ := c.do("POST", "/api/generate", map[string]interface{}{"theme": "winter", "size": 40, "players": 3, "seed": 5}, nil)
	if code != 200 || len(gen["starts"].([]interface{})) != 3 {
		t.Fatal("generate", code, gen)
	}
	if code, _, _ := c.do("POST", "/api/generate", map[string]interface{}{"theme": "lava"}, nil); code != 400 {
		t.Fatal("generate bad theme")
	}
	if code, _, _ := c.do("POST", "/api/generate", "nope", nil); code != 400 {
		t.Fatal("generate bad json")
	}
	if code, _, _ := c.do("POST", "/api/generate", map[string]interface{}{"players": 50}, nil); code != 200 {
		t.Fatal("generate clamps players")
	}
	// saving requires an account
	gen["name"] = "My Polder"
	delete(gen, "id")
	if code, _, _ := c.do("POST", "/api/levels", gen, nil); code != 401 {
		t.Fatal("anonymous save")
	}
	c.guest("Guesty")
	if code, _, _ := c.do("POST", "/api/levels", gen, nil); code != 401 {
		t.Fatal("guest save")
	}
	a := e.client()
	a.do("POST", "/api/register", map[string]string{"name": "Builder", "password": "password1"}, nil)
	code, saved, _ := a.do("POST", "/api/levels", gen, nil)
	if code != 201 {
		t.Fatal("save", code, saved)
	}
	id := saved["id"].(string)
	if code, _, _ := a.do("POST", "/api/levels", `{"name":""}`, nil); code != 400 {
		t.Fatal("invalid level")
	}
	if code, _, _ := a.do("POST", "/api/levels", `{"name":"`+strings.Repeat("x", 600*1024)+`"}`, nil); code != 400 {
		t.Fatal("oversized level")
	}
	if code, _, _ := a.do("POST", "/api/levels", `nope`, nil); code != 400 {
		t.Fatal("bad json level")
	}
	if code, l, _ := c.do("GET", "/api/levels/"+id, nil, nil); code != 200 || l["author"] != "Builder" {
		t.Fatal("custom level fetch")
	}
	b := e.client()
	b.do("POST", "/api/register", map[string]string{"name": "Other", "password": "password1"}, nil)
	gen["id"] = id
	if code, _, _ := b.do("POST", "/api/levels", gen, nil); code != 403 {
		t.Fatal("overwrite foreign level")
	}
	if code, _, _ := b.do("DELETE", "/api/levels/"+id, nil, nil); code != 403 {
		t.Fatal("delete foreign level")
	}
	if code, _, _ := c.do("DELETE", "/api/levels/"+id, nil, nil); code != 401 {
		t.Fatal("guest delete")
	}
	if code, _, _ := a.do("DELETE", "/api/levels/nope", nil, nil); code != 404 {
		t.Fatal("delete missing")
	}
	if code, _, _ := a.do("DELETE", "/api/levels/"+id, nil, nil); code != 200 {
		t.Fatal("delete")
	}
	// limits
	delete(gen, "id")
	for i := 0; i < store.MaxLevelsPerUser; i++ {
		a.do("POST", "/api/levels", gen, nil)
	}
	if code, _, _ := a.do("POST", "/api/levels", gen, nil); code != 429 {
		t.Fatal("level limit")
	}
}

func TestScoresAPI(t *testing.T) {
	e := newEnv(t)
	e.st.Register("Champ", "password1")
	e.st.RecordGame("Champ", store.Score{Level: "campaign-01", Score: 500, Won: true}, 1)
	c := e.client()
	req, _ := http.NewRequest("GET", e.ts.URL+"/api/scores?level=campaign-01", nil)
	resp, _ := c.hc.Do(req)
	var sc []store.Score
	json.NewDecoder(resp.Body).Decode(&sc)
	resp.Body.Close()
	if len(sc) != 1 || sc[0].Name != "Champ" {
		t.Fatal("scores")
	}
	if code, _, _ := c.do("GET", "/api/scores?level="+strings.Repeat("x", 100), nil, nil); code != 400 {
		t.Fatal("long level param")
	}
	resp, _ = c.hc.Get(e.ts.URL + "/api/leaderboard")
	var lb []store.PublicUser
	json.NewDecoder(resp.Body).Decode(&lb)
	resp.Body.Close()
	if len(lb) != 1 || lb[0].Wins != 1 {
		t.Fatal("leaderboard")
	}
	if code, out, _ := c.do("GET", "/api/players/champ", nil, nil); code != 200 || out["name"] != "Champ" {
		t.Fatal("player")
	}
	if code, _, _ := c.do("GET", "/api/players/nobody", nil, nil); code != 404 {
		t.Fatal("no player")
	}
	if code, out, _ := c.do("GET", "/api/defs", nil, nil); code != 200 || out["ages"] == nil {
		t.Fatal("defs")
	}
}

func TestWebSocketRequiresSession(t *testing.T) {
	e := newEnv(t)
	_, resp, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(e.ts.URL, "http")+"/ws", nil)
	if err == nil || resp.StatusCode != 401 {
		t.Fatal("ws without session")
	}
	// cross-origin websocket is refused
	c := e.client()
	c.guest("Origin")
	u, _ := url.Parse(e.ts.URL)
	hdr := http.Header{"Origin": {"https://evil.example"}}
	for _, ck := range c.hc.Jar.Cookies(u) {
		hdr.Add("Cookie", ck.Name+"="+ck.Value)
	}
	if _, _, err := websocket.Dial(context.Background(), "ws"+strings.TrimPrefix(e.ts.URL, "http")+"/ws", &websocket.DialOptions{HTTPHeader: hdr}); err == nil {
		t.Fatal("cross-origin websocket accepted")
	}
}

func TestLobbyChatAndMatch(t *testing.T) {
	e := newEnv(t)
	alice, bob := e.client(), e.client()
	alice.guest("Alice")
	bob.guest("Bob")
	alice.dial()
	alice.expect("hello")
	alice.expect("lobby")
	bob.dial()
	bob.expect("hello")
	if code, _, _ := alice.do("GET", "/api/online", nil, nil); code != 200 {
		t.Fatal("online")
	}
	// global chat with history and whisper
	alice.send(map[string]string{"t": "chat", "ch": "global", "text": "hello <b>world</b>"})
	m := bob.expect("chat")
	if m["from"] != "Alice" || m["text"] != "hello <b>world</b>" {
		t.Fatalf("chat %v", m)
	}
	bob.send(map[string]string{"t": "chat", "ch": "whisper", "to": "alice", "text": "psst"})
	for {
		w := alice.expect("chat")
		if w["ch"] == "whisper" {
			if w["to"] != "Alice" || w["from"] != "Bob" {
				t.Fatal("whisper", w)
			}
			break
		}
	}
	bob.send(map[string]string{"t": "chat", "ch": "whisper", "to": "nobody", "text": "x"})
	bob.expect("error")
	bob.send(map[string]string{"t": "chat", "ch": "room", "text": "x"})
	bob.expect("error")
	bob.send(map[string]string{"t": "nonsense"})
	bob.expect("error")
	bob.send(map[string]string{"t": "start"})
	bob.expect("error")
	bob.send(map[string]string{"t": "join", "room": "r999"})
	bob.expect("error")
	bob.send(map[string]string{"t": "create", "level": "nope"})
	bob.expect("error")
	bob.send(map[string]string{"t": "ping"})
	bob.expect("pong")

	// Alice creates a room on campaign level 2; Bob joins
	alice.send(map[string]interface{}{"t": "create", "level": "campaign-02", "name": "Duel"})
	room := alice.expect("room")
	if room["host"] != "Alice" || room["state"] != "lobby" {
		t.Fatal("room", room)
	}
	id := room["id"].(string)
	alice.send(map[string]interface{}{"t": "create", "level": "campaign-02"})
	alice.expect("error")
	bob.send(map[string]interface{}{"t": "join", "room": id})
	bob.expect("room")
	// team change, slot changes (host only), AI slot
	bob.send(map[string]interface{}{"t": "team", "team": 3})
	bob.send(map[string]interface{}{"t": "slot", "slot": 2, "kind": "ai", "team": 3, "diff": "easy"})
	bob.expect("error") // not host
	alice.send(map[string]interface{}{"t": "slot", "slot": 1, "kind": "ai"})
	alice.expect("error") // slot taken by Bob
	alice.send(map[string]interface{}{"t": "slot", "slot": 2, "kind": "ai", "team": 3, "diff": "easy"})
	alice.send(map[string]interface{}{"t": "slot", "slot": 3, "kind": "closed"})
	alice.send(map[string]interface{}{"t": "slot", "slot": 0, "kind": "open", "team": 1})
	alice.send(map[string]interface{}{"t": "slot", "slot": 7, "kind": "ai"})
	alice.expect("error") // bad slot (level has 4)
	// room chat and team chat
	bob.send(map[string]string{"t": "chat", "ch": "room", "text": "gl hf"})
	if m := alice.expect("chat"); m["ch"] != "room" {
		t.Fatal("room chat")
	}
	bob.send(map[string]string{"t": "chat", "ch": "team", "text": "team only"})
	for {
		if m := bob.expect("chat"); m["text"] == "team only" {
			break
		}
	}
	alice.send(map[string]string{"t": "start"})
	start := alice.expect("start")
	if start["you"].(float64) != 0 || start["map"] == nil {
		t.Fatal("start", start)
	}
	bob.expect("start")
	snap := alice.expect("snap")
	s := snap["s"].(map[string]interface{})
	if len(s["ents"].([]interface{})) == 0 {
		t.Fatal("snapshot empty")
	}
	// joining a running game fails
	carol := e.client()
	carol.guest("Carol")
	carol.dial()
	carol.send(map[string]interface{}{"t": "join", "room": id})
	carol.expect("error")
	// issue a command; invalid commands produce cmderr
	alice.cmd(map[string]interface{}{"c": "train", "t": 99999, "w": "worker"})
	alice.expect("cmderr")
	var tc float64
	for _, x := range s["ents"].([]interface{}) {
		en := x.(map[string]interface{})
		if en["t"] == "town_center" && en["o"].(float64) == 0 {
			tc = en["i"].(float64)
		}
	}
	alice.cmd(map[string]interface{}{"c": "train", "t": tc, "w": "worker"})
	time.Sleep(300 * time.Millisecond)
	// Bob disconnects and reconnects: he is put back into the game
	bob.ws.Close(websocket.StatusNormalClosure, "")
	time.Sleep(200 * time.Millisecond)
	bob.dial()
	if st := bob.expect("start"); st["room"] != id {
		t.Fatal("rejoin")
	}
	// Bob resigns by leaving; Alice resigns too -> AI team wins, game ends
	bob.send(map[string]string{"t": "leave"})
	alice.cmd(map[string]interface{}{"c": "resign"})
	end := alice.expect("end")
	if end["results"] == nil {
		t.Fatal("end")
	}
	alice.send(map[string]string{"t": "leave"})
	time.Sleep(100 * time.Millisecond)
	e.srv.hub.mu.Lock()
	n := len(e.srv.hub.rooms)
	e.srv.hub.mu.Unlock()
	if n != 0 {
		t.Fatalf("rooms not cleaned up: %d", n)
	}
}

func TestQuickGameAndScores(t *testing.T) {
	e := newEnv(t)
	c := e.client()
	c.do("POST", "/api/register", map[string]string{"name": "Solo", "password": "password1"}, nil)
	c.dial()
	c.expect("hello")
	c.send(map[string]interface{}{"t": "quick", "level": "nope"})
	c.expect("error")
	c.send(map[string]interface{}{"t": "quick", "skirmish": map[string]interface{}{"theme": "lava"}})
	c.expect("error")
	c.send(map[string]interface{}{"t": "quick", "opp": 1, "diff": "easy", "skirmish": map[string]interface{}{"theme": "desert", "size": 40, "startAge": 2, "maxAge": 3, "seed": 7}})
	st := c.expect("start")
	if st["level"].(map[string]interface{})["theme"] != "desert" {
		t.Fatal("skirmish theme")
	}
	c.expect("snap")
	// speed up: run the room's game to completion by resigning the AI
	e.srv.hub.mu.Lock()
	var r *Room
	for _, x := range e.srv.hub.rooms {
		r = x
	}
	e.srv.hub.mu.Unlock()
	r.mu.Lock()
	r.g.Resign(1)
	r.mu.Unlock()
	end := c.expect("end")
	res := end["results"].([]interface{})
	if res[0].(map[string]interface{})["won"] != true {
		t.Fatal("solo should win")
	}
	time.Sleep(100 * time.Millisecond)
	if u, _ := e.st.User("Solo"); u.Games != 1 || u.Wins != 1 {
		t.Fatalf("game not recorded: %+v", u)
	}
	if len(e.st.Scores("skirmish")) != 1 {
		t.Fatal("score not recorded")
	}
	// campaign quick game; second login from another window kicks the first
	c.send(map[string]string{"t": "leave"})
	c.send(map[string]interface{}{"t": "quick", "level": "campaign-01", "opp": 5})
	if m := c.expectAny("start", "error"); m["t"] != "start" {
		t.Fatal(m)
	}
	c2 := &client{e: e, hc: c.hc, ctx: context.Background()}
	c2.dial()
	c2.expect("start") // rejoined the running game
	// the replaced connection is closed by the server
	rctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for {
		if _, _, err := c.ws.Read(rctx); err != nil {
			break
		}
	}
	// server shutdown stops games
	e.srv.Hub().Shutdown()
}

func TestRoomFullAndHostHandover(t *testing.T) {
	e := newEnv(t)
	e.srv.cfg.MaxRooms = 1
	a, b := e.client(), e.client()
	a.guest("Host")
	b.guest("Guest")
	a.dial()
	b.dial()
	a.send(map[string]interface{}{"t": "create", "skirmish": map[string]interface{}{"theme": "temperate", "size": 40}})
	r := a.expect("room")
	b.send(map[string]interface{}{"t": "create", "level": "campaign-01"})
	b.expect("error") // server full
	b.send(map[string]interface{}{"t": "join", "room": r["id"]})
	b.expect("room")
	// fill remaining seats then try to start with all on the same team
	a.send(map[string]interface{}{"t": "slot", "slot": 2, "kind": "closed"})
	a.send(map[string]interface{}{"t": "slot", "slot": 3, "kind": "closed"})
	a.send(map[string]interface{}{"t": "team", "team": 5})
	b.send(map[string]interface{}{"t": "team", "team": 5})
	time.Sleep(100 * time.Millisecond)
	a.send(map[string]string{"t": "start"})
	if m := a.expect("error"); !strings.Contains(m["msg"].(string), "same team") {
		t.Fatal(m)
	}
	// host leaves: Guest becomes host
	a.send(map[string]string{"t": "leave"})
	for {
		m := b.expect("room")
		if m["host"] == "Guest" {
			break
		}
	}
	b.send(map[string]string{"t": "start"})
	if m := b.expect("error"); !strings.Contains(m["msg"].(string), "two players") {
		t.Fatal(m)
	}
	a.send(map[string]interface{}{"t": "join", "room": r["id"]})
	a.expect("room")
	c := e.client()
	c.guest("Third")
	c.dial()
	c.send(map[string]interface{}{"t": "join", "room": r["id"]})
	c.expect("error") // full (others closed)
	// slow client handling: a full send queue drops lossy messages
	cl := &Client{send: make(chan []byte, 1), closed: make(chan struct{})}
	cl.enqueue([]byte("a"), true)
	cl.enqueue([]byte("b"), true)
	if len(cl.send) != 1 {
		t.Fatal("lossy drop")
	}
	cl.enqueue([]byte("c"), false)
	select {
	case <-cl.closed:
	default:
		t.Fatal("slow client should be closed")
	}
	cl.sendJSON(func() {}, false) // unmarshalable: ignored
}

func TestChatRateLimit(t *testing.T) {
	e := newEnv(t)
	c := e.client()
	c.guest("Spammer")
	c.dial()
	c.expect("hello")
	for i := 0; i < 8; i++ {
		c.send(map[string]string{"t": "chat", "ch": "global", "text": "spam"})
	}
	for {
		m := c.expect("error")
		if strings.Contains(m["msg"].(string), "too fast") {
			break
		}
	}
}

func TestParseClientMsg(t *testing.T) {
	ok := []string{
		`{"t":"ping"}`, `{"t":"chat","ch":"global","text":"hi"}`, `{"t":"chat","ch":"whisper","to":"a","text":"hi"}`,
		`{"t":"create","level":"campaign-01"}`, `{"t":"slot","slot":1,"kind":"ai","diff":"hard"}`,
		`{"t":"cmd","cmd":{"c":"move","ids":[1,2],"x":3,"y":4}}`, `{"t":"quick","skirmish":{"size":64,"startAge":1,"maxAge":2}}`,
	}
	for _, s := range ok {
		if _, err := ParseClientMsg([]byte(s)); err != nil {
			t.Errorf("%s: %v", s, err)
		}
	}
	bad := []string{
		`not json`, `{"t":"x"}`, `{"t":"ping","diff":"godlike"}`, `{"t":"ping","team":99}`, `{"t":"ping","slot":-1}`,
		`{"t":"ping","room":"` + strings.Repeat("r", 40) + `"}`, `{"t":"chat","ch":"global","text":"\u0000"}`,
		`{"t":"chat","ch":"pirate","text":"arr"}`, `{"t":"chat","ch":"whisper","text":"hi"}`,
		`{"t":"slot","kind":"wizard"}`, `{"t":"cmd"}`, `{"t":"cmd","cmd":{"c":"x","w":"<script>"}}`,
		`{"t":"quick","skirmish":{"size":9999}}`, `{"t":"cmd","cmd":{"ids":[` + strings.Repeat("1,", 200) + `1]}}`,
		`{"t":"ping","x":"` + strings.Repeat("a", MaxMessageBytes) + `"}`,
	}
	for _, s := range bad {
		if _, err := ParseClientMsg([]byte(s)); err == nil {
			t.Errorf("accepted %.60s", s)
		}
	}
	m, _ := ParseClientMsg([]byte(`{"t":"create","name":"  "}`))
	if m.Name != "Battle" {
		t.Fatal("default room name")
	}
}

func TestLimiterAndClientIP(t *testing.T) {
	l := NewLimiter(1, 2)
	now := time.Unix(0, 0)
	l.now = func() time.Time { return now }
	if !l.Allow("a") || !l.Allow("a") || l.Allow("a") {
		t.Fatal("burst")
	}
	now = now.Add(time.Second)
	if !l.Allow("a") {
		t.Fatal("refill")
	}
	now = now.Add(20 * time.Minute)
	l.Allow("b") // triggers GC of "a"
	l.mu.Lock()
	_, ok := l.buckets["a"]
	l.mu.Unlock()
	if ok {
		t.Fatal("gc")
	}
	for i := 0; i <= 100001; i++ {
		l.buckets[strconv.Itoa(i)] = &bucket{last: now}
	}
	if l.Allow("new-key") {
		t.Fatal("bounded memory")
	}
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.1:1234"
	r.Header.Set("X-Forwarded-For", "1.2.3.4, 5.6.7.8 ")
	if clientIP(r, false) != "10.0.0.1" || clientIP(r, true) != "5.6.7.8" {
		t.Fatal("client ip")
	}
	r.Header.Set("X-Forwarded-For", "garbage")
	if clientIP(r, true) != "10.0.0.1" {
		t.Fatal("bad xff")
	}
	r.RemoteAddr = "weird"
	if clientIP(r, false) != "weird" {
		t.Fatal("no port")
	}
	if trimSpace("\t x \t") != "x" {
		t.Fatal("trim")
	}
}

func TestRoomUnit(t *testing.T) {
	// exercise helpers without the network
	l := &game.Level{Name: "x", Width: 32, Height: 32, MaxPlayers: 1}
	slots := defaultSlots(l, &Client{name: "h"}, 1, "easy")
	if len(slots) != 2 || slots[1].Kind != SlotAI || aiName(1) == "" {
		t.Fatal("default slots")
	}
	if newToken() == newToken() || len(newToken()) != 43 {
		t.Fatal("token")
	}
}
