package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/rom/lords_of_the_lowlands/internal/config"
	"github.com/rom/lords_of_the_lowlands/internal/store"
	"github.com/rom/lords_of_the_lowlands/internal/totp"
)

func (e *env) adminClient(name string) *client {
	e.t.Helper()
	if _, err := e.st.CreateUser(name, "adminpass1", store.RoleAdmin, store.StatusActive, 8); err != nil {
		e.t.Fatal(err)
	}
	c := e.client()
	if code, out, _ := c.do("POST", "/api/login", map[string]string{"name": name, "password": "adminpass1"}, nil); code != 200 || out["admin"] != true {
		e.t.Fatalf("admin login %d %v", code, out)
	}
	return c
}

func TestRegistrationModes(t *testing.T) {
	closed := newEnvWith(t, func(c *config.Config) { c.Accounts.Registration = config.RegClosed; c.Accounts.AllowGuests = false })
	c := closed.client()
	if code, _, _ := c.do("POST", "/api/register", map[string]string{"name": "Alice", "password": "password1"}, nil); code != 403 {
		t.Fatal("closed registration")
	}
	if code, _, _ := c.do("POST", "/api/guest", map[string]string{"name": "Gus"}, nil); code != 403 {
		t.Fatal("guests disabled")
	}
	if code, out, _ := c.do("GET", "/api/config", nil, nil); code != 200 || out["registration"] != "closed" || out["allowGuests"] != false {
		t.Fatal("public config", out)
	}

	appr := newEnvWith(t, func(c *config.Config) { c.Accounts.Registration = config.RegApproval })
	u := appr.client()
	code, out, _ := u.do("POST", "/api/register", map[string]string{"name": "Bob", "password": "password1"}, nil)
	if code != 202 || out["pending"] != true {
		t.Fatal("approval registration", code, out)
	}
	if code, _, _ := u.do("POST", "/api/login", map[string]string{"name": "Bob", "password": "password1"}, nil); code != 403 {
		t.Fatal("pending login must fail")
	}
	admin := appr.adminClient("Root")
	if code, _, _ := admin.do("PATCH", "/api/admin/users/bob", map[string]interface{}{"status": "active"}, nil); code != 200 {
		t.Fatal("approve")
	}
	if code, _, _ := u.do("POST", "/api/login", map[string]string{"name": "Bob", "password": "password1"}, nil); code != 200 {
		t.Fatal("approved login")
	}
	// block: the live session dies immediately
	admin.do("PATCH", "/api/admin/users/bob", map[string]interface{}{"status": "blocked"}, nil)
	if code, _, _ := u.do("GET", "/api/me", nil, nil); code != 401 {
		t.Fatal("blocked session must end")
	}
	if code, _, _ := u.do("POST", "/api/login", map[string]string{"name": "Bob", "password": "password1"}, nil); code != 403 {
		t.Fatal("blocked login")
	}
}

func TestAdminAPI(t *testing.T) {
	e := newEnv(t)
	anon := e.client()
	if code, _, _ := anon.do("GET", "/api/admin/users", nil, nil); code != 401 {
		t.Fatal("anon admin")
	}
	user := e.client()
	user.do("POST", "/api/register", map[string]string{"name": "Pleb", "password": "password1"}, nil)
	if code, _, _ := user.do("GET", "/api/admin/users", nil, nil); code != 403 {
		t.Fatal("non-admin")
	}
	a := e.adminClient("Boss")
	code, out, _ := a.do("GET", "/api/admin/users", nil, nil)
	if code != 200 || len(out["users"].([]interface{})) != 2 {
		t.Fatal("list", out)
	}
	if code, _, _ := a.do("POST", "/api/admin/users", map[string]interface{}{"name": "Newbie", "password": "password9", "mfaRequired": true, "note": "hi\x01"}, nil); code != 201 {
		t.Fatal("create")
	}
	if code, _, _ := a.do("POST", "/api/admin/users", map[string]interface{}{"name": "Newbie", "password": "password9"}, nil); code != 409 {
		t.Fatal("dup create")
	}
	if code, _, _ := a.do("POST", "/api/admin/users", map[string]interface{}{"name": "x", "password": "password9"}, nil); code != 400 {
		t.Fatal("bad create")
	}
	if code, _, _ := a.do("POST", "/api/admin/users", map[string]interface{}{"name": "Odd", "password": "password9", "role": "king"}, nil); code != 400 {
		t.Fatal("bad role")
	}
	if code, _, _ := a.do("PATCH", "/api/admin/users/pleb", map[string]interface{}{"role": "wizard"}, nil); code != 400 {
		t.Fatal("bad role update")
	}
	if code, _, _ := a.do("PATCH", "/api/admin/users/ghost", map[string]interface{}{}, nil); code != 404 {
		t.Fatal("missing user")
	}
	// last admin protection
	if code, _, _ := a.do("PATCH", "/api/admin/users/boss", map[string]interface{}{"role": "user"}, nil); code != 409 {
		t.Fatal("demote last admin")
	}
	if code, _, _ := a.do("DELETE", "/api/admin/users/boss", nil, nil); code != 409 {
		t.Fatal("delete self")
	}
	// password reset logs the user out
	if code, _, _ := a.do("POST", "/api/admin/users/pleb/password", map[string]string{"password": "brandnew99"}, nil); code != 200 {
		t.Fatal("reset")
	}
	if code, _, _ := user.do("GET", "/api/me", nil, nil); code != 401 {
		t.Fatal("old session after reset")
	}
	if code, _, _ := a.do("POST", "/api/admin/users/pleb/password", map[string]string{"password": "x"}, nil); code != 400 {
		t.Fatal("weak reset")
	}
	if code, _, _ := a.do("POST", "/api/admin/users/ghost/password", map[string]string{"password": "brandnew99"}, nil); code != 404 {
		t.Fatal("reset missing")
	}
	a.do("PATCH", "/api/admin/users/pleb", map[string]interface{}{"note": "watch", "clearFlags": true, "resetMfa": true, "mfaRequired": false, "role": "admin"}, nil)
	if u, _ := e.st.GetUser("pleb"); !u.IsAdmin() || u.Note != "watch" {
		t.Fatal("update fields")
	}
	if code, _, _ := a.do("DELETE", "/api/admin/users/pleb", nil, nil); code != 200 {
		t.Fatal("delete")
	}
	if code, _, _ := a.do("DELETE", "/api/admin/users/pleb", nil, nil); code != 404 {
		t.Fatal("delete twice")
	}
	if code, _, _ := a.do("POST", "/api/admin/kick/nobody", map[string]string{}, nil); code != 404 {
		t.Fatal("kick offline")
	}
	g := e.client()
	g.guest("Kicky")
	g.dial()
	if code, _, _ := a.do("POST", "/api/admin/kick/kicky", map[string]string{}, nil); code != 200 {
		t.Fatal("kick")
	}
	req, _ := http.NewRequest("GET", e.ts.URL+"/api/admin/audit", nil)
	resp, _ := a.hc.Do(req)
	var audit []store.AuditEntry
	json.NewDecoder(resp.Body).Decode(&audit)
	resp.Body.Close()
	if len(audit) < 4 {
		t.Fatalf("audit %d", len(audit))
	}
	resp, _ = a.hc.Get(e.ts.URL + "/api/admin/rooms")
	if resp.StatusCode != 200 {
		t.Fatal("rooms")
	}
	resp.Body.Close()
}

func TestMFAFlow(t *testing.T) {
	e := newEnvWith(t, func(c *config.Config) { c.Accounts.RequireAdminMFA = true })
	e.st.CreateUser("Mia", "password1", store.RoleUser, store.StatusActive, 8)
	e.st.UpdateUser("Mia", func(u *store.User) error { u.MFARequired = true; return nil })
	c := e.client()
	code, out, _ := c.do("POST", "/api/login", map[string]string{"name": "Mia", "password": "password1"}, nil)
	if code != 200 || out["mfaSetup"] != true {
		t.Fatal("setup required", out)
	}
	// restricted session: no API, no WebSocket
	if code, _, _ := c.do("GET", "/api/saves", nil, nil); code != 401 {
		t.Fatal("restricted session used API")
	}
	if code, out, _ := c.do("GET", "/api/me", nil, nil); code != 200 || out["mfaSetup"] != true {
		t.Fatal("me restricted")
	}
	if code, _, _ := c.do("POST", "/api/mfa/enable", map[string]string{"code": "123456"}, nil); code != 400 {
		t.Fatal("enable before setup")
	}
	_, setup, _ := c.do("POST", "/api/mfa/setup", map[string]string{}, nil)
	secret := setup["secret"].(string)
	if !strings.HasPrefix(setup["uri"].(string), "otpauth://") {
		t.Fatal("uri")
	}
	if code, _, _ := c.do("POST", "/api/mfa/enable", map[string]string{"code": "000000"}, nil); code != 400 {
		t.Fatal("wrong code")
	}
	now := time.Now()
	code0, _ := totp.Code(secret, now.Unix()/totp.Step)
	if code, _, _ := c.do("POST", "/api/mfa/enable", map[string]string{"code": code0}, nil); code != 200 {
		t.Fatal("enable")
	}
	if code, _, _ := c.do("GET", "/api/saves", nil, nil); code != 200 {
		t.Fatal("session should be full after enrolment")
	}
	// login now needs the code; codes cannot be replayed
	d := e.client()
	if code, out, _ := d.do("POST", "/api/login", map[string]string{"name": "Mia", "password": "password1"}, nil); code != 401 || out["mfa"] != true {
		t.Fatal("code required")
	}
	if code, _, _ := d.do("POST", "/api/login", map[string]string{"name": "Mia", "password": "password1", "code": code0}, nil); code != 401 {
		t.Fatal("replayed code accepted")
	}
	e.srv.now = func() time.Time { return now.Add(31 * time.Second) }
	code1, _ := totp.Code(secret, now.Add(31*time.Second).Unix()/totp.Step)
	if code, _, _ := d.do("POST", "/api/login", map[string]string{"name": "Mia", "password": "password1", "code": code1}, nil); code != 200 {
		t.Fatal("login with code")
	}
	// required MFA cannot be disabled
	if code, _, _ := d.do("POST", "/api/mfa/disable", map[string]string{"code": code1}, nil); code != 403 {
		t.Fatal("disable required MFA")
	}
	e.st.UpdateUser("Mia", func(u *store.User) error { u.MFARequired = false; return nil })
	e.srv.now = func() time.Time { return now.Add(62 * time.Second) }
	if code, _, _ := d.do("POST", "/api/mfa/disable", map[string]string{"code": "999999"}, nil); code != 400 {
		t.Fatal("disable wrong code")
	}
	code2, _ := totp.Code(secret, now.Add(62*time.Second).Unix()/totp.Step)
	if code, _, _ := d.do("POST", "/api/mfa/disable", map[string]string{"code": code2}, nil); code != 200 {
		t.Fatal("disable")
	}
	if code, _, _ := d.do("POST", "/api/mfa/disable", map[string]string{"code": code2}, nil); code != 400 {
		t.Fatal("disable when off")
	}
	g := e.client()
	g.guest("Gman")
	if code, _, _ := g.do("POST", "/api/mfa/setup", map[string]string{}, nil); code != 401 {
		t.Fatal("guest mfa")
	}
}

func TestBootstrapAdmin(t *testing.T) {
	st, _ := store.Open(t.TempDir())
	set := config.Default()
	set.Accounts.BootstrapAdmin = "Root"
	t.Setenv("LOTL_ADMIN_PASSWORD", "")
	if _, err := New(Config{Store: st, Settings: set}); err == nil {
		t.Fatal("missing password")
	}
	t.Setenv("LOTL_ADMIN_PASSWORD", "superSecret1")
	set.Accounts.RequireAdminMFA = true
	if _, err := New(Config{Store: st, Settings: set}); err != nil {
		t.Fatal(err)
	}
	u, ok := st.GetUser("root")
	if !ok || !u.IsAdmin() || !u.MFARequired {
		t.Fatal("bootstrap admin")
	}
	// an existing non-admin account is promoted
	st.UpdateUser("root", func(u *store.User) error { u.Role = store.RoleUser; return nil })
	if _, err := New(Config{Store: st, Settings: set}); err != nil {
		t.Fatal(err)
	}
	if u, _ := st.GetUser("root"); !u.IsAdmin() {
		t.Fatal("promote")
	}
}

func TestDiagnostics(t *testing.T) {
	e := newEnvWith(t, func(c *config.Config) { c.Metrics.Token = "0123456789abcdef0123" })
	c := e.client()
	if code, out, _ := c.do("GET", "/api/health", nil, nil); code != 200 || out["status"] != "ok" {
		t.Fatal("health")
	}
	resp, _ := http.Get(e.ts.URL + "/readyz")
	if resp.StatusCode != 200 {
		t.Fatal("ready")
	}
	resp.Body.Close()
	if code, _, _ := c.do("GET", "/api/stats", nil, nil); code != 403 {
		t.Fatal("stats without token")
	}
	hdr := map[string]string{"Authorization": "Bearer 0123456789abcdef0123"}
	code, st, _ := c.do("GET", "/api/stats", nil, hdr)
	if code != 200 || st["counters"] == nil || st["runtime"] == nil {
		t.Fatal("stats", st)
	}
	req, _ := http.NewRequest("GET", e.ts.URL+"/metrics", nil)
	req.Header.Set("Authorization", "Bearer 0123456789abcdef0123")
	resp, _ = http.DefaultClient.Do(req)
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	for _, want := range []string{"lotl_uptime_seconds", "lotl_http_requests_total", "lotl_tick_duration_seconds_bucket", "lotl_go_goroutines"} {
		if !strings.Contains(string(b), want) {
			t.Fatalf("metrics missing %s", want)
		}
	}
	resp, _ = http.Get(e.ts.URL + "/metrics")
	if resp.StatusCode != 403 {
		t.Fatal("metrics without token")
	}
	resp.Body.Close()
	// admins may always read; loopback without token; public mode
	a := e.adminClient("Ops")
	if code, _, _ := a.do("GET", "/api/stats", nil, nil); code != 200 {
		t.Fatal("admin stats")
	}
	lo := newEnv(t)
	if code, _, _ := lo.client().do("GET", "/api/stats", nil, nil); code != 200 {
		t.Fatal("loopback stats")
	}
	pub := newEnvWith(t, func(c *config.Config) { c.Metrics.Public = true })
	if code, _, _ := pub.client().do("GET", "/api/stats", nil, nil); code != 200 {
		t.Fatal("public stats")
	}
	var l latency
	if l.pct(0.5) != 0 {
		t.Fatal("empty pct")
	}
	for i := 0; i < 2000; i++ {
		l.observe(float64(i) / 1000)
	}
	if l.pct(0.99) <= l.pct(0.5) || l.max < 1.9 {
		t.Fatal("pct")
	}
}

func startQuick(t *testing.T, c *client, level string) map[string]interface{} {
	t.Helper()
	c.send(map[string]interface{}{"t": "quick", "level": level, "opp": 1})
	st := c.expect("start")
	c.expect("snap")
	return st
}

func TestAntiCheat(t *testing.T) {
	e := newEnvWith(t, func(c *config.Config) {
		c.AntiCheat.MaxAPM = 60
		c.AntiCheat.WarnScore = 20
		c.AntiCheat.KickScore = 60
	})
	c := e.client()
	c.do("POST", "/api/register", map[string]string{"name": "Sneaky", "password": "password1"}, nil)
	c.dial()
	if c.hello["signed"] != true || c.hello["key"] == "" {
		t.Fatal("hello must carry the signing key")
	}
	// integrity: correct report is fine, modified files are flagged
	c.send(map[string]interface{}{"t": "integrity", "h": e.srv.cfg.StaticHashes})
	startQuick(t, c, "campaign-01")
	// unsigned and badly signed commands are rejected and scored
	c.send(map[string]interface{}{"t": "cmd", "cmd": map[string]interface{}{"c": "stop"}})
	c.send(map[string]interface{}{"t": "cmd", "p": `{"c":"stop"}`, "n": 1, "mac": strings.Repeat("0", 64)})
	c.expect("warn")
	// replay (sequence reuse) is rejected
	c.cmd(map[string]interface{}{"c": "stop"})
	c.seq--
	c.cmd(map[string]interface{}{"c": "stop"})
	c.send(map[string]interface{}{"t": "integrity", "h": map[string]string{"/js/main.js": strings.Repeat("a", 64)}, "wd": true})
	// eventually removed from the game and flagged
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for {
		if _, _, err := c.ws.Read(ctx); err != nil {
			break
		}
	}
	u, _ := e.st.GetUser("Sneaky")
	if len(u.Flags) == 0 {
		t.Fatal("account should be flagged")
	}
	if e.srv.metrics.cheatKicks.Load() == 0 {
		t.Fatal("kick counter")
	}
}

func TestMapHackDetection(t *testing.T) {
	e := newEnvWith(t, func(c *config.Config) { c.AntiCheat.WarnScore = 10; c.AntiCheat.KickScore = 1000 })
	c := e.client()
	c.guest("Seer")
	c.dial()
	startQuick(t, c, "campaign-01")
	e.srv.hub.mu.Lock()
	var r *Room
	for _, x := range e.srv.hub.rooms {
		r = x
	}
	e.srv.hub.mu.Unlock()
	r.mu.Lock()
	var hidden, theirs int
	for id := 1; id < 2000; id++ {
		if o, ok := r.g.OwnerOf(id); ok && o == 1 {
			if !r.g.Knows(0, id) {
				hidden = id
			}
			theirs = id
		}
	}
	r.mu.Unlock()
	if hidden == 0 {
		t.Skip("no hidden enemy entity")
	}
	c.cmd(map[string]interface{}{"c": "attack", "ids": []int{theirs}, "t": hidden})
	c.cmd(map[string]interface{}{"c": "build", "ids": []int{1}, "x": 50, "y": 50, "w": "house"})
	c.expect("warn")
}

func TestSaveRestoreAndDemo(t *testing.T) {
	e := newEnv(t)
	c := e.client()
	c.do("POST", "/api/register", map[string]string{"name": "Saver", "password": "password1"}, nil)
	c.dial()
	c.send(map[string]interface{}{"t": "save", "name": "nothing"})
	c.expect("error")
	startQuick(t, c, "campaign-04")
	c.send(map[string]interface{}{"t": "save", "name": "Before the storm"})
	saved := c.expect("saved")
	id := saved["id"].(string)
	req, _ := http.NewRequest("GET", e.ts.URL+"/api/saves", nil)
	resp, _ := c.hc.Do(req)
	var list []store.SaveMeta
	json.NewDecoder(resp.Body).Decode(&list)
	resp.Body.Close()
	if len(list) != 1 || list[0].Name != "Before the storm" || len(list[0].Players) != 2 {
		t.Fatalf("saves %+v", list)
	}
	// rate limit on saving
	c.send(map[string]interface{}{"t": "save"})
	c.send(map[string]interface{}{"t": "save"})
	c.expect("error")
	c.send(map[string]string{"t": "leave"})
	time.Sleep(100 * time.Millisecond)
	c.send(map[string]interface{}{"t": "restore", "save": "s-0000000000000000"})
	c.expect("error")
	c.send(map[string]interface{}{"t": "restore", "save": id})
	room := c.expect("room")
	if !strings.Contains(room["name"].(string), "restored") {
		t.Fatal("restored room", room)
	}
	c.send(map[string]string{"t": "start"})
	st := c.expect("start")
	if st["map"] == nil {
		t.Fatal("restored start")
	}
	c.send(map[string]string{"t": "leave"})
	if code, _, _ := c.do("DELETE", "/api/saves/"+id, nil, nil); code != 200 {
		t.Fatal("delete save")
	}
	if code, _, _ := c.do("DELETE", "/api/saves/"+id, nil, nil); code != 404 {
		t.Fatal("delete twice")
	}
	g := e.client()
	g.guest("Ghosty")
	if code, _, _ := g.do("GET", "/api/saves", nil, nil); code != 401 {
		t.Fatal("guest saves")
	}
	g.dial()
	g.send(map[string]interface{}{"t": "save"})
	g.expect("error")
	g.send(map[string]interface{}{"t": "restore", "save": id})
	g.expect("error")
	// demo mode: a spectator view of an AI match, rotated on expiry
	e.srv.set.Game.Demo.RotateMinutes = 0.002
	g.send(map[string]string{"t": "demo"})
	d := g.expect("start")
	if d["demo"] != true || d["you"].(float64) != -1 {
		t.Fatal("demo start", d)
	}
	snap := g.expect("snap")
	if len(snap["s"].(map[string]interface{})["ents"].([]interface{})) == 0 {
		t.Fatal("demo snapshot")
	}
	g.expect("start") // rotated to the next showcase
	g.send(map[string]string{"t": "demo"})
	g.expect("error") // already in a room
	g.send(map[string]string{"t": "leave"})
	time.Sleep(150 * time.Millisecond)
	e.srv.hub.mu.Lock()
	n := len(e.srv.hub.rooms)
	e.srv.hub.mu.Unlock()
	if n != 0 {
		t.Fatal("demo room not removed")
	}
	e.srv.set.Game.Demo.Enabled = false
	g.send(map[string]string{"t": "demo"})
	g.expect("error")
}
