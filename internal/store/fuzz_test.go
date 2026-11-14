package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// FuzzOpenCorruptFiles makes sure arbitrary on-disk content never panics
// the loader and that loaded levels are always valid.
func FuzzOpenCorruptFiles(f *testing.F) {
	f.Add([]byte(`{"a":{"name":"A","salt":"","hash":""}}`), []byte(`{"l":[{"level":"l","score":1}]}`), []byte(`{"x":{"name":"x","width":24}}`))
	f.Fuzz(func(t *testing.T, users, scores, levels []byte) {
		dir := t.TempDir()
		os.WriteFile(filepath.Join(dir, "users.json"), users, 0o600)
		os.WriteFile(filepath.Join(dir, "scores.json"), scores, 0o600)
		os.WriteFile(filepath.Join(dir, "levels.json"), levels, 0o600)
		s, err := Open(dir)
		if err != nil {
			return
		}
		for _, m := range s.Levels() {
			l, ok := s.Level(m.ID)
			if !ok || l.Validate() != nil {
				t.Fatal("invalid level loaded")
			}
		}
		_, _ = json.Marshal(s.Scores(""))
		s.Leaderboard(5)
	})
}

func FuzzValidName(f *testing.F) {
	f.Add("Alice")
	f.Fuzz(func(t *testing.T, s string) {
		if ValidName(s) && (len(s) < 3 || len(s) > 20) {
			t.Fatal("length")
		}
	})
}
