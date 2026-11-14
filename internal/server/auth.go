package server

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/rom/lords_of_the_lowlands/internal/config"
	"github.com/rom/lords_of_the_lowlands/internal/store"
	"github.com/rom/lords_of_the_lowlands/internal/totp"
)

// session is a logged-in browser. A session with MFASetup set may only
// enrol an authenticator (the account requires MFA but has none yet).
type session struct {
	Name     string
	Guest    bool
	Admin    bool
	MFASetup bool
	Pending  string // MFA secret awaiting confirmation
	Expires  time.Time
}

func newToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func (s *Server) createSession(w http.ResponseWriter, sess *session) {
	tok := newToken()
	ttl := s.set.Security.SessionTTL
	s.mu.Lock()
	now := s.now()
	for k, v := range s.sessions {
		if now.After(v.Expires) {
			delete(s.sessions, k)
		}
	}
	sess.Expires = now.Add(ttl)
	s.sessions[tok] = sess
	s.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: tok, Path: "/", HttpOnly: true,
		Secure: s.cfg.SecureCookies, SameSite: http.SameSiteStrictMode, MaxAge: int(ttl.Seconds())})
}

// rawSession returns any valid session (including restricted MFA-setup
// sessions). Registered accounts are re-checked against the store on every
// request so blocking, deletion or role changes take effect immediately.
func (s *Server) rawSession(r *http.Request) (*session, string) {
	c, err := r.Cookie(sessionCookie)
	if err != nil || len(c.Value) != 43 {
		return nil, ""
	}
	s.mu.Lock()
	ss := s.sessions[c.Value]
	if ss == nil || s.now().After(ss.Expires) {
		delete(s.sessions, c.Value)
		s.mu.Unlock()
		return nil, ""
	}
	cp := *ss
	s.mu.Unlock()
	if !cp.Guest {
		u, ok := s.cfg.Store.GetUser(cp.Name)
		if !ok || u.Status == store.StatusBlocked || u.Status == store.StatusPending {
			s.dropSession(c.Value)
			return nil, ""
		}
		cp.Admin = u.IsAdmin()
	}
	return &cp, c.Value
}

// sessionFor returns a fully authorised session.
func (s *Server) sessionFor(r *http.Request) (*session, string) {
	ss, tok := s.rawSession(r)
	if ss == nil || ss.MFASetup {
		return nil, ""
	}
	return ss, tok
}

func (s *Server) dropSession(tok string) {
	s.mu.Lock()
	delete(s.sessions, tok)
	s.mu.Unlock()
}

// dropSessionsOf ends every session of a user (after block/delete/password reset).
func (s *Server) dropSessionsOf(name string) {
	s.mu.Lock()
	for k, v := range s.sessions {
		if strings.EqualFold(v.Name, name) {
			delete(s.sessions, k)
		}
	}
	s.mu.Unlock()
}

func (s *Server) updateSession(tok string, fn func(*session)) {
	s.mu.Lock()
	if ss := s.sessions[tok]; ss != nil {
		fn(ss)
	}
	s.mu.Unlock()
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

// bootstrapAdmin creates the configured administrator account on start-up
// when it does not exist yet. The password comes from LOTL_ADMIN_PASSWORD.
func (s *Server) bootstrapAdmin() error {
	name := s.set.Accounts.BootstrapAdmin
	if name == "" {
		return nil
	}
	if u, ok := s.cfg.Store.GetUser(name); ok {
		if !u.IsAdmin() {
			return s.cfg.Store.UpdateUser(name, func(u *store.User) error { u.Role, u.Status = store.RoleAdmin, store.StatusActive; return nil })
		}
		return nil
	}
	pw := os.Getenv("LOTL_ADMIN_PASSWORD")
	if pw == "" {
		return errors.New("accounts.bootstrapAdmin is set but LOTL_ADMIN_PASSWORD is empty")
	}
	if _, err := s.cfg.Store.CreateUser(name, pw, store.RoleAdmin, store.StatusActive, s.set.Accounts.MinPasswordLength); err != nil {
		return err
	}
	if s.set.Accounts.RequireAdminMFA {
		_ = s.cfg.Store.UpdateUser(name, func(u *store.User) error { u.MFARequired = true; return nil })
	}
	s.cfg.Store.Audit("system", "bootstrap-admin", name, "")
	return nil
}

type credentials struct {
	Name     string `json:"name"`
	Password string `json:"password"`
	Code     string `json:"code,omitempty"`
}

func (s *Server) handlePublicConfig(w http.ResponseWriter, r *http.Request) {
	a := s.set.Accounts
	d := s.set.Game.Demo
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"registration": a.Registration, "allowGuests": a.AllowGuests, "minPasswordLength": a.MinPasswordLength,
		"demo":           map[string]interface{}{"enabled": d.Enabled, "idleMinutes": d.IdleMinutes, "rotateMinutes": d.RotateMinutes},
		"signedCommands": s.set.AntiCheat.Enabled && s.set.AntiCheat.SignedCmds,
	})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if !s.authLimit.Allow(clientIP(r, s.cfg.TrustProxy)) {
		writeErr(w, http.StatusTooManyRequests, "too many attempts, try later")
		return
	}
	reg := s.set.Accounts.Registration
	if reg == config.RegClosed {
		writeErr(w, http.StatusForbidden, "registration is closed on this server; ask an administrator for an account")
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
	status := store.StatusActive
	if reg == config.RegApproval {
		status = store.StatusPending
	}
	u, err := s.cfg.Store.CreateUser(c.Name, c.Password, store.RoleUser, status, s.set.Accounts.MinPasswordLength)
	if err != nil {
		code := http.StatusBadRequest
		if errors.Is(err, store.ErrExists) {
			code = http.StatusConflict
		}
		writeErr(w, code, err.Error())
		return
	}
	s.cfg.Store.Audit(u.Name, "register", u.Name, status)
	if status == store.StatusPending {
		writeJSON(w, http.StatusAccepted, map[string]interface{}{"name": u.Name, "pending": true,
			"message": "Your account awaits approval by an administrator."})
		return
	}
	s.createSession(w, &session{Name: u.Name})
	writeJSON(w, http.StatusCreated, map[string]interface{}{"name": u.Name, "guest": false})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r, s.cfg.TrustProxy)
	if !s.authLimit.Allow(ip) {
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
		s.metrics.loginFail.Add(1)
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	switch u.Status {
	case store.StatusPending:
		writeErr(w, http.StatusForbidden, "your account awaits approval by an administrator")
		return
	case store.StatusBlocked:
		s.cfg.Store.Audit(u.Name, "login-blocked", u.Name, ip)
		writeErr(w, http.StatusForbidden, "this account has been blocked")
		return
	}
	if u.MFAEnabled {
		if c.Code == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]interface{}{"error": "authenticator code required", "mfa": true})
			return
		}
		if !s.checkTOTP(u.Name, u.MFASecret, c.Code) {
			s.metrics.loginFail.Add(1)
			s.cfg.Store.Audit(u.Name, "mfa-fail", u.Name, ip)
			writeJSON(w, http.StatusUnauthorized, map[string]interface{}{"error": "invalid authenticator code", "mfa": true})
			return
		}
	}
	_ = s.cfg.Store.UpdateUser(u.Name, func(x *store.User) error { x.LastLogin = s.now().UTC(); return nil })
	s.metrics.loginOK.Add(1)
	needSetup := !u.MFAEnabled && (u.MFARequired || (u.IsAdmin() && s.set.Accounts.RequireAdminMFA))
	s.createSession(w, &session{Name: u.Name, MFASetup: needSetup})
	writeJSON(w, http.StatusOK, map[string]interface{}{"name": u.Name, "guest": false, "admin": u.IsAdmin(), "mfaSetup": needSetup})
}

// checkTOTP verifies a code and prevents its reuse.
func (s *Server) checkTOTP(name, secret, code string) bool {
	step, ok := totp.Verify(secret, code, s.now())
	if !ok {
		return false
	}
	err := s.cfg.Store.UpdateUser(name, func(u *store.User) error {
		if step <= u.MFALastStep {
			return errors.New("code already used")
		}
		u.MFALastStep = step
		return nil
	})
	return err == nil
}

func (s *Server) handleGuest(w http.ResponseWriter, r *http.Request) {
	if !s.set.Accounts.AllowGuests {
		writeErr(w, http.StatusForbidden, "guest play is disabled on this server")
		return
	}
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
	s.createSession(w, &session{Name: c.Name, Guest: true})
	writeJSON(w, http.StatusOK, map[string]interface{}{"name": c.Name, "guest": true})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if _, tok := s.rawSession(r); tok != "" {
		s.dropSession(tok)
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: s.cfg.SecureCookies, SameSite: http.SameSiteStrictMode})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	ss, _ := s.rawSession(r)
	if ss == nil {
		writeErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	out := map[string]interface{}{"name": ss.Name, "guest": ss.Guest, "admin": ss.Admin, "mfaSetup": ss.MFASetup}
	if u, ok := s.cfg.Store.GetUser(ss.Name); ok && !ss.Guest {
		out["stats"] = u.Public()
		out["mfaEnabled"] = u.MFAEnabled
		out["mfaRequired"] = u.MFARequired
	}
	writeJSON(w, http.StatusOK, out)
}

// ---------------------------------------------------------------------------
// MFA enrolment

func (s *Server) handleMFASetup(w http.ResponseWriter, r *http.Request) {
	ss, tok := s.rawSession(r)
	if ss == nil || ss.Guest {
		writeErr(w, http.StatusUnauthorized, "log in with an account first")
		return
	}
	secret := totp.NewSecret()
	s.updateSession(tok, func(x *session) { x.Pending = secret })
	writeJSON(w, http.StatusOK, map[string]string{"secret": secret, "uri": totp.URI(s.set.Accounts.MFAIssuer, ss.Name, secret)})
}

type codeReq struct {
	Code string `json:"code"`
}

func (s *Server) handleMFAEnable(w http.ResponseWriter, r *http.Request) {
	ss, tok := s.rawSession(r)
	if ss == nil || ss.Guest || ss.Pending == "" {
		writeErr(w, http.StatusBadRequest, "start MFA setup first")
		return
	}
	var c codeReq
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	step, ok := totp.Verify(ss.Pending, c.Code, s.now())
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid code — check your authenticator's clock")
		return
	}
	err := s.cfg.Store.UpdateUser(ss.Name, func(u *store.User) error {
		u.MFASecret, u.MFAEnabled, u.MFALastStep = ss.Pending, true, step
		return nil
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save")
		return
	}
	s.updateSession(tok, func(x *session) { x.Pending, x.MFASetup = "", false })
	s.cfg.Store.Audit(ss.Name, "mfa-enable", ss.Name, "")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleMFADisable(w http.ResponseWriter, r *http.Request) {
	ss, _ := s.sessionFor(r)
	if ss == nil || ss.Guest {
		writeErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	var c codeReq
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	u, _ := s.cfg.Store.GetUser(ss.Name)
	if u == nil || !u.MFAEnabled {
		writeErr(w, http.StatusBadRequest, "MFA is not enabled")
		return
	}
	if u.MFARequired || (u.IsAdmin() && s.set.Accounts.RequireAdminMFA) {
		writeErr(w, http.StatusForbidden, "MFA is required for this account")
		return
	}
	if !s.checkTOTP(u.Name, u.MFASecret, c.Code) {
		writeErr(w, http.StatusBadRequest, "invalid code")
		return
	}
	_ = s.cfg.Store.UpdateUser(u.Name, func(x *store.User) error { x.MFASecret, x.MFAEnabled = "", false; return nil })
	s.cfg.Store.Audit(u.Name, "mfa-disable", u.Name, "")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
