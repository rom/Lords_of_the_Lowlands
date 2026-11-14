package game

import (
	"os"
	"testing"
	"time"
)

func TestLongGames(t *testing.T) {
	if testing.Short() || os.Getenv("LOTL_LONG") == "" {
		t.Skip("set LOTL_LONG=1 to run hour-long AI matches")
	}
	if testing.Short() {
		t.Skip()
	}
	for _, c := range []struct {
		start, max int
		theme      string
	}{{0, 2, "temperate"}, {7, 8, "temperate"}, {15, 16, "space"}} {
		lv := &Level{Name: "t", Theme: c.theme, Width: 64, Height: 64, StartAge: c.start, MaxAge: c.max, MaxPlayers: 2, Gen: &GenParams{Seed: 3, Forest: 0.5, Animals: 0.5, Water: 0.2, Mountains: 0.2}}
		lv.Validate()
		g, _ := NewGame(lv, []PlayerSetup{{Name: "A", Team: 0, AI: true, Difficulty: "hard"}, {Name: "B", Team: 1, AI: true, Difficulty: "easy"}}, 1)
		st := time.Now()
		i := 0
		for ; i < 10*60*60 && !g.Over; i++ {
			g.Step()
			g.Events()
		}
		t.Logf("age %d-%d: over=%v winner=%d after %.1f min (%v) %+v", c.start, c.max, g.Over, g.Winner, float64(i)/600, time.Since(st), g.Results())
	}
}
