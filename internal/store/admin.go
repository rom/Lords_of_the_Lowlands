package store

import (
	"bufio"
	"crypto/rand"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

func validRole(r string) bool   { return r == RoleUser || r == RoleAdmin }
func validStatus(s string) bool { return s == StatusActive || s == StatusPending || s == StatusBlocked }

// GetUser returns a copy of the full account record.
func (s *Store) GetUser(name string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u := s.users[strings.ToLower(name)]
	if u == nil {
		return nil, false
	}
	cp := *u
	cp.Flags = append([]Flag(nil), u.Flags...)
	return &cp, true
}

// ListUsers returns all accounts for the admin page, sorted by name.
func (s *Store) ListUsers() []AdminUser {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AdminUser, 0, len(s.users))
	for _, u := range s.users {
		out = append(out, u.Admin())
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out
}

// CountAdmins returns the number of active administrators.
func (s *Store) CountAdmins() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	n := 0
	for _, u := range s.users {
		if u.IsAdmin() {
			n++
		}
	}
	return n
}

// UpdateUser applies fn to an account under the store lock and persists it.
// If fn returns an error nothing is saved.
func (s *Store) UpdateUser(name string, fn func(u *User) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u := s.users[strings.ToLower(name)]
	if u == nil {
		return ErrNotFound
	}
	cp := *u
	if err := fn(&cp); err != nil {
		return err
	}
	if !validRole(cp.role()) || !validStatus(cp.status()) {
		return ErrInvalid
	}
	old := *u
	*u = cp
	if err := s.save("users.json", s.users); err != nil {
		*u = old
		return err
	}
	return nil
}

// SetPassword replaces an account's password.
func (s *Store) SetPassword(name, pw string, minLen int) error {
	if minLen < MinPasswordLen {
		minLen = MinPasswordLen
	}
	if len(pw) < minLen || len(pw) > MaxPasswordLen {
		return ErrBadPassword
	}
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return err
	}
	h := hashPassword(pw, salt)
	return s.UpdateUser(name, func(u *User) error { u.Salt, u.Hash = salt, h; return nil })
}

// DeleteUser removes an account (scores and levels stay as history).
func (s *Store) DeleteUser(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := strings.ToLower(name)
	u := s.users[key]
	if u == nil {
		return ErrNotFound
	}
	delete(s.users, key)
	if err := s.save("users.json", s.users); err != nil {
		s.users[key] = u
		return err
	}
	_ = os.RemoveAll(filepath.Join(s.dir, "saves", key))
	return nil
}

// AddFlag records an anti-cheat finding against an account.
func (s *Store) AddFlag(name string, f Flag) error {
	return s.UpdateUser(name, func(u *User) error {
		u.Flags = append(u.Flags, f)
		if len(u.Flags) > 50 {
			u.Flags = u.Flags[len(u.Flags)-50:]
		}
		return nil
	})
}

// ---------------------------------------------------------------------------
// Audit log

// AuditEntry is one administrative or security-relevant event.
type AuditEntry struct {
	Time   time.Time `json:"time"`
	Actor  string    `json:"actor"`
	Action string    `json:"action"`
	Target string    `json:"target,omitempty"`
	Detail string    `json:"detail,omitempty"`
}

// Audit appends an entry to audit.log (JSON lines).
func (s *Store) Audit(actor, action, target, detail string) {
	e := AuditEntry{time.Now().UTC(), actor, action, target, detail}
	b, _ := json.Marshal(e)
	s.mu.Lock()
	defer s.mu.Unlock()
	f, err := os.OpenFile(filepath.Join(s.dir, "audit.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(b, '\n'))
}

// AuditLog returns the newest n audit entries, newest first.
func (s *Store) AuditLog(n int) []AuditEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	f, err := os.Open(filepath.Join(s.dir, "audit.log"))
	if err != nil {
		return nil
	}
	defer f.Close()
	var all []AuditEntry
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		var e AuditEntry
		if json.Unmarshal(sc.Bytes(), &e) == nil {
			all = append(all, e)
			if len(all) > 4*n {
				all = all[len(all)-n:]
			}
		}
	}
	if len(all) > n {
		all = all[len(all)-n:]
	}
	for i, j := 0, len(all)-1; i < j; i, j = i+1, j-1 {
		all[i], all[j] = all[j], all[i]
	}
	return all
}

// ---------------------------------------------------------------------------
// Saved games

// SaveMeta describes a saved game.
type SaveMeta struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Level   string    `json:"level"`
	Age     int       `json:"age"`
	Minutes float64   `json:"minutes"`
	Players []string  `json:"players"`
	Created time.Time `json:"created"`
	Size    int       `json:"size"`
}

// MaxSaveBytes bounds one saved game.
const MaxSaveBytes = 8 << 20

func (s *Store) saveDir(owner string) string {
	return filepath.Join(s.dir, "saves", strings.ToLower(owner))
}

func validSaveID(id string) bool {
	if len(id) != 18 || !strings.HasPrefix(id, "s-") {
		return false
	}
	for _, c := range id[2:] {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}

// SaveGame stores a saved game for owner, keeping at most max saves.
func (s *Store) SaveGame(owner string, meta SaveMeta, blob []byte, max int) (string, error) {
	if len(blob) > MaxSaveBytes {
		return "", ErrLimit
	}
	if !s.Exists(owner) {
		return "", ErrNotFound
	}
	list := s.ListSaves(owner)
	if len(list) >= max {
		return "", ErrLimit
	}
	dir := s.saveDir(owner)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	id := strings.Replace(newID(), "u-", "s-", 1)
	meta.ID, meta.Created, meta.Size = id, time.Now().UTC(), len(blob)
	env, err := json.Marshal(struct {
		Meta SaveMeta        `json:"meta"`
		Game json.RawMessage `json:"game"`
	}{meta, blob})
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sub := &Store{dir: dir}
	if err := sub.save(id+".json", json.RawMessage(env)); err != nil {
		return "", err
	}
	return id, nil
}

// ListSaves lists an owner's saved games, newest first.
func (s *Store) ListSaves(owner string) []SaveMeta {
	ents, err := os.ReadDir(s.saveDir(owner))
	if err != nil {
		return []SaveMeta{}
	}
	out := []SaveMeta{}
	for _, e := range ents {
		id := strings.TrimSuffix(e.Name(), ".json")
		if !validSaveID(id) {
			continue
		}
		if m, _, err := s.readSave(owner, id, false); err == nil {
			out = append(out, m)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Created.After(out[j].Created) })
	return out
}

func (s *Store) readSave(owner, id string, withGame bool) (SaveMeta, []byte, error) {
	if !validSaveID(id) {
		return SaveMeta{}, nil, ErrNotFound
	}
	b, err := os.ReadFile(filepath.Join(s.saveDir(owner), id+".json"))
	if err != nil {
		return SaveMeta{}, nil, ErrNotFound
	}
	var env struct {
		Meta SaveMeta        `json:"meta"`
		Game json.RawMessage `json:"game"`
	}
	if err := json.Unmarshal(b, &env); err != nil {
		return SaveMeta{}, nil, errors.New("corrupt save")
	}
	if !withGame {
		env.Game = nil
	}
	return env.Meta, env.Game, nil
}

// LoadSave returns a saved game owned by owner.
func (s *Store) LoadSave(owner, id string) (SaveMeta, []byte, error) {
	return s.readSave(owner, id, true)
}

// DeleteSave removes a saved game.
func (s *Store) DeleteSave(owner, id string) error {
	if !validSaveID(id) {
		return ErrNotFound
	}
	if err := os.Remove(filepath.Join(s.saveDir(owner), id+".json")); err != nil {
		return ErrNotFound
	}
	return nil
}

// Dir returns the data directory.
func (s *Store) Dir() string { return s.dir }
