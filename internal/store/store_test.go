package store

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rom/lords_of_the_lowlands/internal/game"
)

func level(name string) *game.Level {
	return &game.Level{Name: name, Theme: "desert", Width: 32, Height: 32, MaxAge: 2,
		Tiles: strings.Repeat("0", 1024), Starts: []game.Point{{X: 5, Y: 5}, {X: 20, Y: 20}}}
}

func TestOpenErrors(t *testing.T) {
	if _, err := Open(""); err == nil {
		t.Fatal("empty dir")
	}
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "users.json"), []byte("{bad"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(dir); err == nil {
		t.Fatal("corrupt file should fail")
	}
	f := filepath.Join(t.TempDir(), "file")
	os.WriteFile(f, nil, 0o600)
	if _, err := Open(filepath.Join(f, "sub")); err == nil {
		t.Fatal("dir under a file")
	}
	// empty files are fine; directories in place of files are not
	d2 := t.TempDir()
	os.WriteFile(filepath.Join(d2, "scores.json"), nil, 0o600)
	if _, err := Open(d2); err != nil {
		t.Fatal(err)
	}
	d3 := t.TempDir()
	os.Mkdir(filepath.Join(d3, "levels.json"), 0o700)
	if _, err := Open(d3); err == nil {
		t.Fatal("unreadable file")
	}
}

func TestAccounts(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Register("x", "password123"); !errors.Is(err, ErrBadName) {
		t.Fatal("short name")
	}
	if _, err := s.Register("Bad Name!", "password123"); !errors.Is(err, ErrBadName) {
		t.Fatal("bad chars")
	}
	if _, err := s.Register("Alice", "short"); !errors.Is(err, ErrBadPassword) {
		t.Fatal("short pw")
	}
	if _, err := s.Register("Alice", strings.Repeat("p", 200)); !errors.Is(err, ErrBadPassword) {
		t.Fatal("long pw")
	}
	u, err := s.Register("Alice", "correct horse")
	if err != nil || u.Name != "Alice" {
		t.Fatal(err)
	}
	if _, err := s.Register("alice", "another pw!"); !errors.Is(err, ErrExists) {
		t.Fatal("case-insensitive duplicate")
	}
	if _, err := s.Authenticate("ALICE", "correct horse"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Authenticate("Alice", "wrong horse"); !errors.Is(err, ErrAuth) {
		t.Fatal("wrong password")
	}
	if _, err := s.Authenticate("Bob", "whatever1"); !errors.Is(err, ErrAuth) {
		t.Fatal("unknown user")
	}
	if _, err := s.Authenticate("Alice", strings.Repeat("x", 500)); !errors.Is(err, ErrAuth) {
		t.Fatal("long password")
	}
	if !s.Exists("alice") || s.Exists("bob") {
		t.Fatal("exists")
	}
	if pu, ok := s.User("alice"); !ok || pu.Name != "Alice" {
		t.Fatal("user")
	}
	if _, ok := s.User("nobody"); ok {
		t.Fatal("nobody")
	}
	// file permissions and persistence
	st, err := os.Stat(filepath.Join(dir, "users.json"))
	if err != nil || st.Mode().Perm() != 0o600 {
		t.Fatalf("perm %v %v", st.Mode(), err)
	}
	b, _ := os.ReadFile(filepath.Join(dir, "users.json"))
	if strings.Contains(string(b), "correct horse") {
		t.Fatal("plaintext password stored")
	}
	s2, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s2.Authenticate("alice", "correct horse"); err != nil {
		t.Fatal("persisted login", err)
	}
}

func TestScores(t *testing.T) {
	s, _ := Open(t.TempDir())
	if err := s.RecordGame("ghost", Score{Level: "x", Score: 5}, 0); !errors.Is(err, ErrNotFound) {
		t.Fatal("unknown user")
	}
	s.Register("Alice", "password1")
	s.Register("Bob", "password2")
	for i := 0; i < 30; i++ {
		if err := s.RecordGame("alice", Score{Level: "campaign-01", Score: i * 10, Won: i%2 == 0}, 1); err != nil {
			t.Fatal(err)
		}
	}
	s.RecordGame("bob", Score{Level: "campaign-02", Score: 9999, Won: true}, 2)
	sc := s.Scores("campaign-01")
	if len(sc) != MaxScoresPerLvl || sc[0].Score != 290 || sc[0].Name != "Alice" {
		t.Fatalf("scores %+v", sc[0])
	}
	all := s.Scores("")
	if all[0].Score != 9999 {
		t.Fatal("merged scores")
	}
	lb := s.Leaderboard(1)
	if len(lb) != 1 || lb[0].Name != "Alice" {
		t.Fatalf("leaderboard %+v", lb)
	}
	u, _ := s.User("bob")
	if u.Campaign != 2 || u.Wins != 1 || u.BestScore != 9999 {
		t.Fatalf("stats %+v", u)
	}
	a, _ := s.User("alice")
	if a.Games != 30 || a.Losses != 15 {
		t.Fatalf("alice %+v", a)
	}
	full := s.Leaderboard(10)
	if len(full) != 2 {
		t.Fatal("leaderboard size")
	}
	for i := 0; i < 60; i++ {
		s.RecordGame("bob", Score{Level: "l" + string(rune('a'+i%26)), Score: i}, 0)
	}
	if len(s.Scores("")) != 50 {
		t.Fatal("merged cap")
	}
}

func TestLevels(t *testing.T) {
	dir := t.TempDir()
	s, _ := Open(dir)
	bad := level("")
	if _, err := s.SaveLevel("alice", bad); err == nil {
		t.Fatal("invalid level saved")
	}
	l := level("Polder")
	l.Gen = &game.GenParams{Seed: 1}
	id, err := s.SaveLevel("alice", l)
	if err != nil || !strings.HasPrefix(id, "u-") {
		t.Fatal(err)
	}
	got, ok := s.Level(id)
	if !ok || got.Name != "Polder" || got.Author != "alice" || got.Gen != nil {
		t.Fatal("load")
	}
	if _, ok := s.Level("nope"); ok {
		t.Fatal("missing level")
	}
	// update by owner keeps id; others are forbidden
	l2 := level("Polder 2")
	l2.ID = id
	if id2, err := s.SaveLevel("alice", l2); err != nil || id2 != id {
		t.Fatal("update")
	}
	l3 := level("Hijack")
	l3.ID = id
	if _, err := s.SaveLevel("mallory", l3); !errors.Is(err, ErrForbidden) {
		t.Fatal("forbidden update")
	}
	if ls := s.Levels(); len(ls) != 1 || ls[0].Name != "Polder 2" {
		t.Fatalf("list %+v", ls)
	}
	if err := s.DeleteLevel("mallory", id); !errors.Is(err, ErrForbidden) {
		t.Fatal("forbidden delete")
	}
	if err := s.DeleteLevel("alice", "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatal("delete missing")
	}
	// per-user limit
	for i := 0; i < MaxLevelsPerUser-1; i++ {
		if _, err := s.SaveLevel("alice", level("L")); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.SaveLevel("alice", level("L")); !errors.Is(err, ErrLimit) {
		t.Fatal("limit")
	}
	// reload: corrupt entries are dropped
	s2, err := Open(dir)
	if err != nil || len(s2.Levels()) != MaxLevelsPerUser {
		t.Fatal("reload", err)
	}
	if err := s.DeleteLevel("alice", id); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(dir, "levels.json"), []byte(`{"x":{"name":""},"y":null}`), 0o600)
	s3, err := Open(dir)
	if err != nil || len(s3.Levels()) != 0 {
		t.Fatal("invalid levels dropped")
	}
	if ValidName("ok_name-1") != true || ValidName("no") {
		t.Fatal("valid name")
	}
}

func TestSaveFailure(t *testing.T) {
	dir := t.TempDir()
	s, _ := Open(dir)
	// make the directory read-only so writes fail
	if err := os.Chmod(dir, 0o500); err != nil {
		t.Skip(err)
	}
	defer os.Chmod(dir, 0o700)
	if f, err := os.CreateTemp(dir, "probe"); err == nil {
		f.Close()
		os.Remove(f.Name())
		t.Skip("running as root: permissions are not enforced")
	}
	if _, err := s.Register("Carol", "password9"); err == nil {
		t.Fatal("register should fail on read-only dir")
	}
	if s.Exists("carol") {
		t.Fatal("failed registration must be rolled back")
	}
	if _, err := s.SaveLevel("carol", level("x")); err == nil {
		t.Fatal("save level should fail")
	}
}
