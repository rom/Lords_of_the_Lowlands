package server

import (
	"errors"
	"net/http"
	"sort"
	"strings"

	"github.com/rom/lords_of_the_lowlands/internal/store"
)

// admin wraps a handler so only active administrators (who have completed
// any required MFA enrolment) may call it.
func (s *Server) admin(h func(w http.ResponseWriter, r *http.Request, actor string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ss, _ := s.sessionFor(r)
		if ss == nil || ss.Guest {
			writeErr(w, http.StatusUnauthorized, "log in as an administrator")
			return
		}
		if !ss.Admin {
			writeErr(w, http.StatusForbidden, "administrators only")
			return
		}
		h(w, r, ss.Name)
	}
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request, actor string) {
	users := s.cfg.Store.ListUsers()
	online := map[string]bool{}
	for _, n := range s.hub.onlineNames() {
		online[strings.ToLower(n)] = true
	}
	type row struct {
		store.AdminUser
		Online bool `json:"online"`
	}
	out := make([]row, 0, len(users))
	for _, u := range users {
		out = append(out, row{u, online[strings.ToLower(u.Name)]})
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"users": out, "registration": s.set.Accounts.Registration})
}

type adminCreate struct {
	Name        string `json:"name"`
	Password    string `json:"password"`
	Role        string `json:"role"`
	MFARequired bool   `json:"mfaRequired"`
	Note        string `json:"note"`
}

func (s *Server) handleAdminCreate(w http.ResponseWriter, r *http.Request, actor string) {
	var c adminCreate
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if c.Role == "" {
		c.Role = store.RoleUser
	}
	u, err := s.cfg.Store.CreateUser(c.Name, c.Password, c.Role, store.StatusActive, s.set.Accounts.MinPasswordLength)
	if err != nil {
		code := http.StatusBadRequest
		if errors.Is(err, store.ErrExists) {
			code = http.StatusConflict
		}
		writeErr(w, code, err.Error())
		return
	}
	_ = s.cfg.Store.UpdateUser(u.Name, func(x *store.User) error {
		x.MFARequired, x.Note = c.MFARequired, cleanNote(c.Note)
		return nil
	})
	s.cfg.Store.Audit(actor, "user-create", u.Name, c.Role)
	writeJSON(w, http.StatusCreated, map[string]string{"name": u.Name})
}

func cleanNote(n string) string {
	if len(n) > 300 {
		n = n[:300]
	}
	return strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, n)
}

// adminUpdate holds optional changes; nil fields are left alone.
type adminUpdate struct {
	Role        *string `json:"role"`
	Status      *string `json:"status"`
	MFARequired *bool   `json:"mfaRequired"`
	ResetMFA    bool    `json:"resetMfa"`
	ClearFlags  bool    `json:"clearFlags"`
	Note        *string `json:"note"`
}

func (s *Server) handleAdminUpdate(w http.ResponseWriter, r *http.Request, actor string) {
	name := r.PathValue("name")
	var c adminUpdate
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	target, ok := s.cfg.Store.GetUser(name)
	if !ok {
		writeErr(w, http.StatusNotFound, "no such user")
		return
	}
	// never lock the server out of administration
	demote := c.Role != nil && *c.Role != store.RoleAdmin || c.Status != nil && *c.Status != store.StatusActive
	if target.IsAdmin() && demote && s.cfg.Store.CountAdmins() <= 1 {
		writeErr(w, http.StatusConflict, "cannot demote or block the last administrator")
		return
	}
	var changes []string
	err := s.cfg.Store.UpdateUser(name, func(u *store.User) error {
		if c.Role != nil {
			u.Role = *c.Role
			changes = append(changes, "role="+*c.Role)
		}
		if c.Status != nil {
			u.Status = *c.Status
			changes = append(changes, "status="+*c.Status)
		}
		if c.MFARequired != nil {
			u.MFARequired = *c.MFARequired
			changes = append(changes, "mfaRequired")
		}
		if c.ResetMFA {
			u.MFASecret, u.MFAEnabled, u.MFALastStep = "", false, 0
			changes = append(changes, "resetMfa")
		}
		if c.ClearFlags {
			u.Flags = nil
			changes = append(changes, "clearFlags")
		}
		if c.Note != nil {
			u.Note = cleanNote(*c.Note)
		}
		return nil
	})
	if err != nil {
		code := http.StatusInternalServerError
		if errors.Is(err, store.ErrInvalid) {
			code = http.StatusBadRequest
		}
		writeErr(w, code, err.Error())
		return
	}
	if c.Status != nil && *c.Status != store.StatusActive || c.ResetMFA || c.MFARequired != nil && *c.MFARequired {
		s.dropSessionsOf(target.Name)
		s.hub.kick(target.Name, "your account was changed by an administrator")
	}
	s.cfg.Store.Audit(actor, "user-update", target.Name, strings.Join(changes, ","))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleAdminPassword(w http.ResponseWriter, r *http.Request, actor string) {
	name := r.PathValue("name")
	var c struct {
		Password string `json:"password"`
	}
	if err := decode(r, &c); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	err := s.cfg.Store.SetPassword(name, c.Password, s.set.Accounts.MinPasswordLength)
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, http.StatusNotFound, "no such user")
	case err != nil:
		writeErr(w, http.StatusBadRequest, err.Error())
	default:
		s.dropSessionsOf(name)
		s.hub.kick(name, "your password was reset by an administrator")
		s.cfg.Store.Audit(actor, "password-reset", name, "")
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}

func (s *Server) handleAdminDelete(w http.ResponseWriter, r *http.Request, actor string) {
	name := r.PathValue("name")
	if strings.EqualFold(name, actor) {
		writeErr(w, http.StatusConflict, "you cannot delete your own account")
		return
	}
	if u, ok := s.cfg.Store.GetUser(name); ok && u.IsAdmin() && s.cfg.Store.CountAdmins() <= 1 {
		writeErr(w, http.StatusConflict, "cannot delete the last administrator")
		return
	}
	if err := s.cfg.Store.DeleteUser(name); err != nil {
		writeErr(w, http.StatusNotFound, "no such user")
		return
	}
	s.dropSessionsOf(name)
	s.hub.kick(name, "your account was removed")
	s.cfg.Store.Audit(actor, "user-delete", name, "")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleAdminAudit(w http.ResponseWriter, r *http.Request, actor string) {
	writeJSON(w, http.StatusOK, s.cfg.Store.AuditLog(300))
}

func (s *Server) handleAdminRooms(w http.ResponseWriter, r *http.Request, actor string) {
	s.hub.mu.Lock()
	rooms := make([]*Room, 0, len(s.hub.rooms))
	for _, rm := range s.hub.rooms {
		rooms = append(rooms, rm)
	}
	s.hub.mu.Unlock()
	out := make([]roomSummary, 0, len(rooms))
	for _, rm := range rooms {
		out = append(out, rm.summary())
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleAdminKick(w http.ResponseWriter, r *http.Request, actor string) {
	name := r.PathValue("name")
	if !s.hub.kick(name, "you were disconnected by an administrator") {
		writeErr(w, http.StatusNotFound, "player is not online")
		return
	}
	s.cfg.Store.Audit(actor, "kick", name, "")
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------------------------------------------------------------------------
// Saved games (REST part; saving/restoring happens over the WebSocket)

func (s *Server) handleSaves(w http.ResponseWriter, r *http.Request) {
	ss, _ := s.sessionFor(r)
	if ss == nil || ss.Guest {
		writeErr(w, http.StatusUnauthorized, "log in with an account to use saved games")
		return
	}
	writeJSON(w, http.StatusOK, s.cfg.Store.ListSaves(ss.Name))
}

func (s *Server) handleDeleteSave(w http.ResponseWriter, r *http.Request) {
	ss, _ := s.sessionFor(r)
	if ss == nil || ss.Guest {
		writeErr(w, http.StatusUnauthorized, "not logged in")
		return
	}
	if err := s.cfg.Store.DeleteSave(ss.Name, r.PathValue("id")); err != nil {
		writeErr(w, http.StatusNotFound, "no such save")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
