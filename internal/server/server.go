// Package server implements the HTTP/WebSocket back-end: accounts,
// sessions, lobby, chat, matchmaking, game hosting, high scores and the
// level-editor API.
package server

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"mime"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/rom/lords_of_the_lowlands/internal/game"
	"github.com/rom/lords_of_the_lowlands/internal/levels"
	"github.com/rom/lords_of_the_lowlands/internal/store"
)

// Config holds server settings.
type Config struct {
	Static        fs.FS
	Store         *store.Store
	Logger        *slog.Logger
	SecureCookies bool
	TrustProxy    bool
	// AllowedOrigins lists extra Origin hosts accepted for WebSockets and
	// state-changing requests (the request Host is always accepted).
	AllowedOrigins []string
	MaxRooms       int
}

const (
	sessionCookie = "lotl_session"
	sessionTTL    = 7 * 24 * time.Hour
	maxBody       = 1 << 20
)

type session struct {
	Name    string
	Guest   bool
	Expires time.Time
}

// Server is the game back-end.
type Server struct {
	cfg      Config
	log      *slog.Logger
	mu       sync.Mutex
	sessions map[string]*session
	apiLimit *Limiter
	authLimit *Limiter
	hub      *Hub
	mux      *http.ServeMux
	now      func() time.Time
}

// New creates a server.
func New(cfg Config) (*Server, error) {
	if cfg.Store == nil {
		return nil, errors.New("store required")
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if cfg.MaxRooms == 0 {
		cfg.MaxRooms = 200
	}
	s := &Server{cfg: cfg, log: cfg.Logger, sessions: map[string]*session{},
		apiLimit: NewLimiter(20, 60), authLimit: NewLimiter(0.2, 8), now: time.Now}
	s.hub = newHub(s)
	s.routes()
	return s, nil
}

// Hub exposes the lobby hub (for tests and shutdown).
func (s *Server) Hub() *Hub { return s.hub }

func (s *Server) routes() {
	m := http.NewServeMux()
	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok\n")) })
	m.HandleFunc("POST /api/register", s.handleRegister)
	m.HandleFunc("POST /api/login", s.handleLogin)
	m.HandleFunc("POST /api/guest", s.handleGuest)
	m.HandleFunc("POST /api/logout", s.handleLogout)
	m.HandleFunc("GET /api/me", s.handleMe)
	m.HandleFunc("GET /api/defs", s.handleDefs)
	m.HandleFunc("GET /api/levels", s.handleLevels)
	m.HandleFunc("GET /api/levels/{id}", s.handleLevel)
	m.HandleFunc("POST /api/levels", s.handleSaveLevel)
	m.HandleFunc("DELETE /api/levels/{id}", s.handleDeleteLevel)
	m.HandleFunc("POST /api/generate", s.handleGenerate)
	m.HandleFunc("GET /api/scores", s.handleScores)
	m.HandleFunc("GET /api/leaderboard", s.handleLeaderboard)
	m.HandleFunc("GET /api/online", s.handleOnline)
	m.HandleFunc("GET /api/players/{name}", s.handlePlayer)
	m.HandleFunc("GET /ws", s.hub.serveWS)
	if s.cfg.Static != nil {
		fsrv := http.FileServer(http.FS(s.cfg.Static))
		m.Handle("GET /", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasSuffix(r.URL.Path, ".js") {
				w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
			}
			w.Header().Set("Cache-Control", "no-cache")
			fsrv.ServeHTTP(w, r)
		}))
	}
	s.mux = m
}

func init() {
	_ = mime.AddExtensionType(".js", "text/javascript")
}

// Handler returns the HTTP handler with all middleware applied.
func (s *Server) Handler() http.Handler {
	return s.recoverer(s.securityHeaders(s.limit(s.mux)))
}

func (s *Server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				s.log.Error("panic", "err", v, "path", r.URL.Path)
				http.Error(w, "internal error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

const csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; " +
	"media-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; " +
	"form-action 'self'; frame-ancestors 'none'; worker-src 'self' blob:"

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
		if s.cfg.SecureCookies {
			h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if !s.apiLimit.Allow(clientIP(r, s.cfg.TrustProxy)) {
				writeErr(w, http.StatusTooManyRequests, "rate limit exceeded")
				return
			}
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				if !s.sameOrigin(r) {
					writeErr(w, http.StatusForbidden, "cross-origin request refused")
					return
				}
				ct, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
				if ct != "application/json" && r.Method != http.MethodDelete {
					writeErr(w, http.StatusUnsupportedMediaType, "content-type must be application/json")
					return
				}
				r.Body = http.MaxBytesReader(w, r.Body, maxBody)
			}
		}
		next.ServeHTTP(w, r)
	})
}

// sameOrigin implements CSRF protection: state-changing requests must carry
// an Origin (or Referer) that matches the Host or an allowed origin.
func (s *Server) sameOrigin(r *http.Request) bool {
	o := r.Header.Get("Origin")
	if o == "" {
		o = r.Header.Get("Referer")
	}
	if o == "" {
		// Non-browser clients (no Origin) are allowed; browsers always send
		// Origin on cross-origin POSTs and the cookie is SameSite=Strict.
		return r.Header.Get("Sec-Fetch-Site") == "" || r.Header.Get("Sec-Fetch-Site") == "same-origin"
	}
	host := o
	if i := strings.Index(host, "://"); i >= 0 {
		host = host[i+3:]
	}
	if i := strings.IndexByte(host, '/'); i >= 0 {
		host = host[:i]
	}
	if strings.EqualFold(host, r.Host) {
		return true
	}
	for _, a := range s.cfg.AllowedOrigins {
		if strings.EqualFold(a, host) {
			return true
		}
	}
	return false
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func decode(r *http.Request, v interface{}) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return errors.New("invalid JSON body")
	}
	if dec.More() {
		return errors.New("trailing data")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Sessions

func newToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func (s *Server) createSession(w http.ResponseWriter, name string, guest bool) {
	tok := newToken()
	s.mu.Lock()
	now := s.now()
	for k, v := range s.sessions {
		if now.After(v.Expires) {
			delete(s.sessions, k)
		}
	}
	s.sessions[tok] = &session{Name: name, Guest: guest, Expires: now.Add(sessionTTL)}
	s.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: tok, Path: "/", HttpOnly: true,
		Secure: s.cfg.SecureCookies, SameSite: http.SameSiteStrictMode, MaxAge: int(sessionTTL.Seconds())})
}

// sessionFor returns the session of a request, if any.
func (s *Server) sessionFor(r *http.Request) (*session, string) {
	c, err := r.Cookie(sessionCookie)
	if err != nil || len(c.Value) != 43 {
		return nil, ""
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	ss := s.sessions[c.Value]
	if ss == nil || s.now().After(ss.Expires) {
		delete(s.sessions, c.Value)
		return nil, ""
	}
	cp := *ss
	return &cp, c.Value
}

func (s *Server) nameInUse(name string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	for _, v := range s.sessions {
		if strings.EqualFold(v.Name, name) && now.Before(v.Expires) {
			return true
		}
	}
	return false
}

type credentials struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if !s.authLimit.Allow(clientIP(r, s.cfg.TrustProxy)) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts, try later")
		return
	}
	var c credentials
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if s.nameInUse(c.Name) {
		writeErr(w, http.StatusConflict, store.ErrExists.Error())
		return
	}
	u, err := s.cfg.Store.Register(c.Name, c.Password)
	if err != nil {
		code := http.StatusBadRequest
		if errors.Is(err, store.ErrExists) {
			code = http.StatusConflict
		}
		writeErr(w, code, err.Error())
		return
	}
	s.createSession(w, u.Name, false)
	writeJSON(w, http.StatusCreated, map[string]interface{}{"name": u.Name, "guest": false})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if !s.authLimit.Allow(clientIP(r, s.cfg.TrustProxy)) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts, try later")
		return
	}
	var c credentials
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	u, err := s.cfg.Store.Authenticate(c.Name, c.Password)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	s.createSession(w, u.Name, false)
	writeJSON(w, http.StatusOK, map[string]interface{}{"name": u.Name, "guest": false})
}

func (s *Server) handleGuest(w http.ResponseWriter, r *http.Request) {
	var c struct {
		Name string `json:"name"`
	}
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if !store.ValidName(c.Name) {
		writeErr(w, http.StatusBadRequest, store.ErrBadName.Error())
		return
	}
	if s.cfg.Store.Exists(c.Name) || s.nameInUse(c.Name) {
		writeErr(w, http.StatusConflict, "name is registered or in use")
		return
	}
	s.createSession(w, c.Name, true)
	writeJSON(w, http.StatusOK, map[string]interface{}{"name": c.Name, "guest": true})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if _, tok := s.sessionFor(r); tok != "" {
		s.mu.Lock()
		delete(s.sessions, tok)
		s.mu.Unlock()
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: s.cfg.SecureCookies, SameSite: http.SameSiteStrictMode})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	ss, _ := s.sessionFor(r)
	if ss == nil {
		writeErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	out := map[string]interface{}{"name": ss.Name, "guest": ss.Guest}
	if u, ok := s.cfg.Store.User(ss.Name); ok {
		out["stats"] = u
	}
	writeJSON(w, http.StatusOK, out)
}

// ---------------------------------------------------------------------------
// Game data & levels

func (s *Server) handleDefs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, game.AllDefs())
}

type levelInfo struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Author      string         `json:"author"`
	Theme       string         `json:"theme"`
	Width       int            `json:"width"`
	Height      int            `json:"height"`
	StartAge    int            `json:"startAge"`
	MaxAge      int            `json:"maxAge"`
	MaxPlayers  int            `json:"maxPlayers"`
	Objective   game.Objective `json:"objective"`
	Campaign    int            `json:"campaign,omitempty"`
	Opponents   int            `json:"opponents"`
	Difficulty  string         `json:"difficulty"`
}

func infoOf(l *game.Level) levelInfo {
	return levelInfo{l.ID, l.Name, l.Description, l.Author, l.Theme, l.Width, l.Height, l.StartAge, l.MaxAge, l.MaxPlayers, l.Objective, levels.Index(l.ID), l.Opponents, l.Difficulty}
}

func (s *Server) handleLevels(w http.ResponseWriter, r *http.Request) {
	var camp []levelInfo
	for _, l := range levels.Campaign() {
		camp = append(camp, infoOf(l))
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"campaign": camp, "custom": s.cfg.Store.Levels()})
}

// findLevel resolves a built-in or custom level id.
func (s *Server) findLevel(id string) (*game.Level, bool) {
	if l, ok := levels.Get(id); ok {
		return l, true
	}
	return s.cfg.Store.Level(id)
}

func (s *Server) handleLevel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	l, ok := s.findLevel(id)
	if !ok {
		writeErr(w, http.StatusNotFound, "level not found")
		return
	}
	// Built-in levels are materialised so the editor can open them.
	m := l.Materialize(l.MaxPlayers)
	m.Gen = nil
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) handleSaveLevel(w http.ResponseWriter, r *http.Request) {
	ss, _ := s.sessionFor(r)
	if ss == nil || ss.Guest {
		writeErr(w, http.StatusUnauthorized, "log in with an account to save levels")
		return
	}
	var l game.Level
	if err := decode(r, &l); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	id, err := s.cfg.Store.SaveLevel(ss.Name, &l)
	if err != nil {
		code := http.StatusBadRequest
		if errors.Is(err, store.ErrForbidden) {
			code = http.StatusForbidden
		} else if errors.Is(err, store.ErrLimit) {
			code = http.StatusTooManyRequests
		}
		writeErr(w, code, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (s *Server) handleDeleteLevel(w http.ResponseWriter, r *http.Request) {
	ss, _ := s.sessionFor(r)
	if ss == nil || ss.Guest {
		writeErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	err := s.cfg.Store.DeleteLevel(ss.Name, r.PathValue("id"))
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, http.StatusNotFound, err.Error())
	case errors.Is(err, store.ErrForbidden):
		writeErr(w, http.StatusForbidden, err.Error())
	case err != nil:
		writeErr(w, http.StatusInternalServerError, "could not delete")
	default:
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func (s *Server) handleGenerate(w http.ResponseWriter, r *http.Request) {
	var o levels.SkirmishOptions
	if err := decode(r, &o); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if o.Players < 2 || o.Players > game.MaxPlayers {
		o.Players = 2
	}
	l, err := levels.Skirmish(o)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	m := l.Materialize(o.Players)
	m.Gen = nil
	m.ID = ""
	m.Name = "New Level"
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) handleScores(w http.ResponseWriter, r *http.Request) {
	lvl := r.URL.Query().Get("level")
	if len(lvl) > 64 {
		writeErr(w, http.StatusBadRequest, "bad level")
		return
	}
	writeJSON(w, http.StatusOK, s.cfg.Store.Scores(lvl))
}

func (s *Server) handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.cfg.Store.Leaderboard(25))
}

func (s *Server) handleOnline(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.hub.onlineNames())
}

func (s *Server) handlePlayer(w http.ResponseWriter, r *http.Request) {
	u, ok := s.cfg.Store.User(r.PathValue("name"))
	if !ok {
		writeErr(w, http.StatusNotFound, "no such player")
		return
	}
	writeJSON(w, http.StatusOK, u)
}
