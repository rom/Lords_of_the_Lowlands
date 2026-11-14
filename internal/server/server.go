// Package server implements the HTTP/WebSocket back-end: accounts,
// sessions, lobby, chat, matchmaking, game hosting, high scores and the
// level-editor API.
package server

import (
	"encoding/json"
	"errors"
	"github.com/rom/lords_of_the_lowlands/docs"
	"io"
	"io/fs"
	"log/slog"
	"mime"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/rom/lords_of_the_lowlands/internal/config"
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
	// Settings holds the YAML configuration (defaults when nil).
	Settings *config.Config
	// StaticHashes maps client file paths to SHA-256 hex digests (anti-cheat
	// integrity check); computed from Static when nil.
	StaticHashes map[string]string
}

const sessionCookie = "lotl_session"

// Server is the game back-end.
type Server struct {
	cfg       Config
	log       *slog.Logger
	mu        sync.Mutex
	sessions  map[string]*session
	apiLimit  *Limiter
	authLimit *Limiter
	hub       *Hub
	mux       *http.ServeMux
	now       func() time.Time
	set       *config.Config
	metrics   *Metrics
	started   time.Time
}

// New creates a server.
func New(cfg Config) (*Server, error) {
	if cfg.Store == nil {
		return nil, errors.New("store required")
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if cfg.Settings == nil {
		cfg.Settings = config.Default()
	}
	set := cfg.Settings
	if cfg.MaxRooms == 0 {
		cfg.MaxRooms = set.Server.MaxRooms
	}
	if cfg.StaticHashes == nil && cfg.Static != nil {
		cfg.StaticHashes = hashStatic(cfg.Static)
	}
	s := &Server{cfg: cfg, log: cfg.Logger, sessions: map[string]*session{}, set: set,
		apiLimit: NewLimiter(set.Security.APIRate, set.Security.APIBurst), authLimit: NewLimiter(set.Security.AuthRate, set.Security.AuthBurst),
		now: time.Now, metrics: newMetrics(), started: time.Now()}
	s.hub = newHub(s)
	s.routes()
	if err := s.bootstrapAdmin(); err != nil {
		return nil, err
	}
	return s, nil
}

// Hub exposes the lobby hub (for tests and shutdown).
func (s *Server) Hub() *Hub { return s.hub }

func (s *Server) routes() {
	m := http.NewServeMux()
	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok\n")) })
	m.HandleFunc("GET /readyz", s.handleReady)
	m.HandleFunc("GET /api/health", s.handleHealth)
	m.HandleFunc("GET /api/stats", s.handleStats)
	m.HandleFunc("GET /metrics", s.handleMetrics)
	m.HandleFunc("GET /api/config", s.handlePublicConfig)
	m.HandleFunc("POST /api/mfa/setup", s.handleMFASetup)
	m.HandleFunc("POST /api/mfa/enable", s.handleMFAEnable)
	m.HandleFunc("POST /api/mfa/disable", s.handleMFADisable)
	m.HandleFunc("GET /api/saves", s.handleSaves)
	m.HandleFunc("DELETE /api/saves/{id}", s.handleDeleteSave)
	m.HandleFunc("GET /api/admin/users", s.admin(s.handleAdminUsers))
	m.HandleFunc("POST /api/admin/users", s.admin(s.handleAdminCreate))
	m.HandleFunc("PATCH /api/admin/users/{name}", s.admin(s.handleAdminUpdate))
	m.HandleFunc("POST /api/admin/users/{name}/password", s.admin(s.handleAdminPassword))
	m.HandleFunc("DELETE /api/admin/users/{name}", s.admin(s.handleAdminDelete))
	m.HandleFunc("GET /api/admin/audit", s.admin(s.handleAdminAudit))
	m.HandleFunc("GET /api/admin/rooms", s.admin(s.handleAdminRooms))
	m.HandleFunc("POST /api/admin/kick/{name}", s.admin(s.handleAdminKick))
	m.HandleFunc("POST /api/register", s.handleRegister)
	m.HandleFunc("POST /api/login", s.handleLogin)
	m.HandleFunc("POST /api/guest", s.handleGuest)
	m.HandleFunc("POST /api/logout", s.handleLogout)
	m.HandleFunc("GET /api/me", s.handleMe)
	m.HandleFunc("GET /api/defs", s.handleDefs)
	m.HandleFunc("GET /api/docs/{name}", s.handleDoc)
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
	return s.recoverer(s.instrument(s.securityHeaders(s.limit(s.mux))))
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
				r.Body = http.MaxBytesReader(w, r.Body, s.set.Security.MaxBodyBytes)
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
// Game data & levels

// handleDoc serves the player manual and FAQ (Markdown) for the in-game viewer.
func (s *Server) handleDoc(w http.ResponseWriter, r *http.Request) {
	b, ok := docs.Player(r.PathValue("name"))
	if !ok {
		writeErr(w, http.StatusNotFound, "document not found")
		return
	}
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(b)
}

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
	MapType     string         `json:"mapType"`
}

func infoOf(l *game.Level) levelInfo {
	return levelInfo{l.ID, l.Name, l.Description, l.Author, l.Theme, l.Width, l.Height, l.StartAge, l.MaxAge, l.MaxPlayers, l.Objective, levels.Index(l.ID), l.Opponents, l.Difficulty, l.MapType}
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
	r.Body = http.MaxBytesReader(w, r.Body, game.MaxLevelBytes)
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
