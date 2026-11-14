// Package store persists accounts, high scores and user-made levels as
// JSON files written atomically into a single data directory.
package store

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"

	"github.com/rom/lords_of_the_lowlands/internal/game"
)

// Argon2id parameters (OWASP 2023 recommendation: m=19 MiB, t=2, p=1).
const (
	argonTime    = 2
	argonMemory  = 19 * 1024
	argonThreads = 1
	argonKeyLen  = 32
	saltLen      = 16
)

// Limits.
const (
	MinPasswordLen   = 8
	MaxPasswordLen   = 128
	MaxScoresPerLvl  = 25
	MaxLevelsPerUser = 50
	MaxLevelsTotal   = 5000
)

var nameRE = regexp.MustCompile(`^[A-Za-z0-9_\-]{3,20}$`)

// ValidName reports whether s is an acceptable player name.
func ValidName(s string) bool { return nameRE.MatchString(s) }

// Errors.
var (
	ErrExists      = errors.New("name already taken")
	ErrBadName     = errors.New("name must be 3-20 letters, digits, _ or -")
	ErrBadPassword = errors.New("password must be 8-128 characters")
	ErrAuth        = errors.New("invalid name or password")
	ErrNotFound    = errors.New("not found")
	ErrForbidden   = errors.New("forbidden")
	ErrLimit       = errors.New("limit reached")
	ErrInvalid     = errors.New("invalid value")
)

// User is a registered account.
type User struct {
	Name      string    `json:"name"`
	Salt      []byte    `json:"salt"`
	Hash      []byte    `json:"hash"`
	Created   time.Time `json:"created"`
	Games     int       `json:"games"`
	Wins      int       `json:"wins"`
	Losses    int       `json:"losses"`
	BestScore int       `json:"bestScore"`
	Campaign  int       `json:"campaign"` // highest campaign level completed
	Role      string    `json:"role,omitempty"`   // "user" or "admin"
	Status    string    `json:"status,omitempty"` // active, pending, blocked
	// TOTP multi-factor authentication.
	MFASecret   string    `json:"mfaSecret,omitempty"`
	MFAEnabled  bool      `json:"mfaEnabled,omitempty"`
	MFARequired bool      `json:"mfaRequired,omitempty"`
	MFALastStep int64     `json:"mfaLastStep,omitempty"`
	LastLogin   time.Time `json:"lastLogin,omitempty"`
	Flags       []Flag    `json:"flags,omitempty"` // anti-cheat findings
	Note        string    `json:"note,omitempty"`
}

// Flag is an anti-cheat finding recorded against an account.
type Flag struct {
	Time   time.Time `json:"time"`
	Reason string    `json:"reason"`
	Score  float64   `json:"score"`
	Game   string    `json:"game"`
}

// Roles and statuses.
const (
	RoleUser      = "user"
	RoleAdmin     = "admin"
	StatusActive  = "active"
	StatusPending = "pending"
	StatusBlocked = "blocked"
)

// AdminUser is the administrator's view of an account (no secrets).
type AdminUser struct {
	PublicUser
	Role        string    `json:"role"`
	Status      string    `json:"status"`
	Created     time.Time `json:"created"`
	LastLogin   time.Time `json:"lastLogin"`
	MFAEnabled  bool      `json:"mfaEnabled"`
	MFARequired bool      `json:"mfaRequired"`
	Flags       []Flag    `json:"flags"`
	Note        string    `json:"note"`
}

func (u *User) role() string {
	if u.Role == "" {
		return RoleUser
	}
	return u.Role
}

func (u *User) status() string {
	if u.Status == "" {
		return StatusActive
	}
	return u.Status
}

// Admin returns the administrator view.
func (u *User) Admin() AdminUser {
	return AdminUser{u.Public(), u.role(), u.status(), u.Created, u.LastLogin, u.MFAEnabled, u.MFARequired, u.Flags, u.Note}
}

// IsAdmin reports whether the account is an active administrator.
func (u *User) IsAdmin() bool { return u.role() == RoleAdmin && u.status() == StatusActive }

// PublicUser is the externally visible part of a User.
type PublicUser struct {
	Name      string `json:"name"`
	Games     int    `json:"games"`
	Wins      int    `json:"wins"`
	Losses    int    `json:"losses"`
	BestScore int    `json:"bestScore"`
	Campaign  int    `json:"campaign"`
}

// Public strips secrets.
func (u *User) Public() PublicUser {
	return PublicUser{u.Name, u.Games, u.Wins, u.Losses, u.BestScore, u.Campaign}
}

// Score is a high-score entry.
type Score struct {
	Level string    `json:"level"`
	Name  string    `json:"name"`
	Score int       `json:"score"`
	Won   bool      `json:"won"`
	Age   int       `json:"age"`
	Mins  float64   `json:"mins"`
	Date  time.Time `json:"date"`
}

// LevelMeta describes a stored custom level.
type LevelMeta struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Author      string    `json:"author"`
	Description string    `json:"description"`
	Width       int       `json:"width"`
	Height      int       `json:"height"`
	StartAge    int       `json:"startAge"`
	MaxAge      int       `json:"maxAge"`
	MaxPlayers  int       `json:"maxPlayers"`
	Theme       string    `json:"theme"`
	Created     time.Time `json:"created"`
}

// Store is a concurrency-safe JSON-file database.
type Store struct {
	mu     sync.RWMutex
	dir    string
	users  map[string]*User // keyed by lower-case name
	scores map[string][]Score
	levels map[string]*game.Level
	meta   map[string]LevelMeta
}

// Open loads (or initialises) a store in dir.
func Open(dir string) (*Store, error) {
	if dir == "" {
		return nil, errors.New("data directory required")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	s := &Store{dir: dir, users: map[string]*User{}, scores: map[string][]Score{}, levels: map[string]*game.Level{}, meta: map[string]LevelMeta{}}
	if err := s.load("users.json", &s.users); err != nil {
		return nil, err
	}
	if err := s.load("scores.json", &s.scores); err != nil {
		return nil, err
	}
	if err := s.load("levels.json", &s.levels); err != nil {
		return nil, err
	}
	for id, l := range s.levels {
		if l == nil || l.Validate() != nil {
			delete(s.levels, id)
			continue
		}
		s.meta[id] = metaOf(l, time.Time{})
	}
	return s, nil
}

func (s *Store) load(name string, v interface{}) error {
	b, err := os.ReadFile(filepath.Join(s.dir, name))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if len(b) == 0 {
		return nil
	}
	if err := json.Unmarshal(b, v); err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	return nil
}

// save writes v atomically: temp file, fsync, rename.
func (s *Store) save(name string, v interface{}) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(s.dir, "."+name+".tmp*")
	if err != nil {
		return err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	if err := f.Chmod(0o600); err != nil {
		f.Close()
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(s.dir, name))
}

func hashPassword(pw string, salt []byte) []byte {
	return argon2.IDKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
}

// Register creates an account.
func (s *Store) Register(name, pw string) (*User, error) {
	return s.CreateUser(name, pw, RoleUser, StatusActive, MinPasswordLen)
}

// CreateUser creates an account with a role and status.
func (s *Store) CreateUser(name, pw, role, status string, minLen int) (*User, error) {
	if !ValidName(name) {
		return nil, ErrBadName
	}
	if minLen < MinPasswordLen {
		minLen = MinPasswordLen
	}
	if len(pw) < minLen || len(pw) > MaxPasswordLen {
		return nil, ErrBadPassword
	}
	if !validRole(role) || !validStatus(status) {
		return nil, ErrInvalid
	}
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	h := hashPassword(pw, salt)
	s.mu.Lock()
	defer s.mu.Unlock()
	key := strings.ToLower(name)
	if _, ok := s.users[key]; ok {
		return nil, ErrExists
	}
	u := &User{Name: name, Salt: salt, Hash: h, Created: time.Now().UTC(), Role: role, Status: status}
	s.users[key] = u
	if err := s.save("users.json", s.users); err != nil {
		delete(s.users, key)
		return nil, err
	}
	cp := *u
	return &cp, nil
}

// dummySalt is used to equalise timing for unknown users.
var dummySalt = make([]byte, saltLen)

// Authenticate verifies credentials in constant time with respect to the
// existence of the account.
func (s *Store) Authenticate(name, pw string) (*User, error) {
	if len(pw) > MaxPasswordLen {
		return nil, ErrAuth
	}
	s.mu.RLock()
	u := s.users[strings.ToLower(name)]
	s.mu.RUnlock()
	if u == nil {
		hashPassword(pw, dummySalt)
		return nil, ErrAuth
	}
	if subtle.ConstantTimeCompare(hashPassword(pw, u.Salt), u.Hash) != 1 {
		return nil, ErrAuth
	}
	s.mu.RLock()
	cp := *u
	s.mu.RUnlock()
	return &cp, nil
}

// User returns the public record of a user.
func (s *Store) User(name string) (PublicUser, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u := s.users[strings.ToLower(name)]
	if u == nil {
		return PublicUser{}, false
	}
	return u.Public(), true
}

// Exists reports whether a registered account uses this name.
func (s *Store) Exists(name string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.users[strings.ToLower(name)]
	return ok
}

// RecordGame stores a finished game for a registered user.
func (s *Store) RecordGame(name string, sc Score, campaignLevel int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u := s.users[strings.ToLower(name)]
	if u == nil {
		return ErrNotFound
	}
	u.Games++
	if sc.Won {
		u.Wins++
		if campaignLevel > u.Campaign {
			u.Campaign = campaignLevel
		}
	} else {
		u.Losses++
	}
	if sc.Score > u.BestScore {
		u.BestScore = sc.Score
	}
	sc.Name = u.Name
	sc.Date = time.Now().UTC()
	list := append(s.scores[sc.Level], sc)
	sort.SliceStable(list, func(i, j int) bool { return list[i].Score > list[j].Score })
	if len(list) > MaxScoresPerLvl {
		list = list[:MaxScoresPerLvl]
	}
	s.scores[sc.Level] = list
	if err := s.save("users.json", s.users); err != nil {
		return err
	}
	return s.save("scores.json", s.scores)
}

// Scores returns the high-score table of a level ("" for all levels merged).
func (s *Store) Scores(level string) []Score {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Score
	if level != "" {
		out = append(out, s.scores[level]...)
	} else {
		for _, l := range s.scores {
			out = append(out, l...)
		}
		sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
		if len(out) > 50 {
			out = out[:50]
		}
	}
	return out
}

// Leaderboard returns the top users by wins then best score.
func (s *Store) Leaderboard(n int) []PublicUser {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []PublicUser
	for _, u := range s.users {
		out = append(out, u.Public())
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Wins != out[j].Wins {
			return out[i].Wins > out[j].Wins
		}
		if out[i].BestScore != out[j].BestScore {
			return out[i].BestScore > out[j].BestScore
		}
		return out[i].Name < out[j].Name
	})
	if len(out) > n {
		out = out[:n]
	}
	return out
}

func metaOf(l *game.Level, created time.Time) LevelMeta {
	return LevelMeta{l.ID, l.Name, l.Author, l.Description, l.Width, l.Height, l.StartAge, l.MaxAge, l.MaxPlayers, l.Theme, created}
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "u-" + hex.EncodeToString(b)
}

// SaveLevel validates and stores a user level. If l.ID names an existing
// level owned by author it is replaced; otherwise a new ID is assigned.
func (s *Store) SaveLevel(author string, l *game.Level) (string, error) {
	l.Gen = nil
	l.Author = author
	if err := l.Validate(); err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if old, ok := s.levels[l.ID]; ok {
		if old.Author != author {
			return "", ErrForbidden
		}
	} else {
		n := 0
		for _, m := range s.levels {
			if m.Author == author {
				n++
			}
		}
		if n >= MaxLevelsPerUser || len(s.levels) >= MaxLevelsTotal {
			return "", ErrLimit
		}
		l.ID = newID()
	}
	s.levels[l.ID] = l
	s.meta[l.ID] = metaOf(l, time.Now().UTC())
	if err := s.save("levels.json", s.levels); err != nil {
		delete(s.levels, l.ID)
		delete(s.meta, l.ID)
		return "", err
	}
	return l.ID, nil
}

// Level returns a stored level.
func (s *Store) Level(id string) (*game.Level, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	l, ok := s.levels[id]
	if !ok {
		return nil, false
	}
	cp := *l
	return &cp, true
}

// Levels lists stored custom levels sorted by name.
func (s *Store) Levels() []LevelMeta {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]LevelMeta, 0, len(s.meta))
	for _, m := range s.meta {
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Name < out[j].Name || (out[i].Name == out[j].Name && out[i].ID < out[j].ID)
	})
	return out
}

// DeleteLevel removes a level owned by author.
func (s *Store) DeleteLevel(author, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	l, ok := s.levels[id]
	if !ok {
		return ErrNotFound
	}
	if l.Author != author {
		return ErrForbidden
	}
	delete(s.levels, id)
	delete(s.meta, id)
	return s.save("levels.json", s.levels)
}
