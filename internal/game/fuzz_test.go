package game

import (
	"encoding/json"
	"strings"
	"testing"
	"unicode/utf8"
)

// FuzzLevelJSON validates arbitrary level documents; valid ones must be
// playable without panics.
func FuzzLevelJSON(f *testing.F) {
	good, _ := json.Marshal(flatLevel(Object{"tree", 3, 3}, Object{"deer", 10, 12}))
	f.Add(good)
	f.Add([]byte(`{"name":"g","width":30,"height":30,"maxPlayers":2,"gen":{"seed":3,"water":0.9,"river":true}}`))
	f.Add([]byte(`{"name":"x","width":24,"height":24,"tiles":"0","starts":[{"x":3,"y":3}]}`))
	f.Add([]byte(`{}`))
	f.Fuzz(func(t *testing.T, b []byte) {
		var l Level
		if json.Unmarshal(b, &l) != nil {
			return
		}
		if l.Validate() != nil {
			return
		}
		if utf8.RuneCountInString(l.Name) > MaxNameLen || l.Width*l.Height > MaxMapSize*MaxMapSize {
			t.Fatal("limits not enforced")
		}
		if l.Width*l.Height > 48*48 { // keep iterations fast
			return
		}
		n := 2
		if l.Tiles != "" {
			n = len(l.Starts)
		}
		setups := make([]PlayerSetup, n)
		for i := range setups {
			setups[i] = PlayerSetup{Name: "p", Team: i, AI: true}
		}
		g, err := NewGame(&l, setups, 1)
		if err != nil {
			return
		}
		for i := 0; i < 30; i++ {
			g.Step()
		}
		g.Snapshot(0, g.Events(), true)
	})
}

// FuzzApply sends arbitrary commands to a running game.
func FuzzApply(f *testing.F) {
	f.Add(0, "move", 1, 10.0, 10.0, 0, "", 0)
	f.Add(0, "build", 5, 10.0, 6.0, 0, "house", 0)
	f.Add(0, "train", 0, 0.0, 0.0, 1, "worker", 3)
	f.Add(1, "smart", 7, 25.0, 25.0, 3, "", 0)
	f.Add(0, "research", 0, 0.0, 0.0, 1, "age", 0)
	f.Add(0, "cancel", 0, 0.0, 0.0, 1, "", -1)
	f.Fuzz(func(t *testing.T, player int, typ string, id int, x, y float64, target int, what string, idx int) {
		g, err := NewGame(flatLevel(Object{"tree", 12, 12}, Object{"deer", 14, 9}), []PlayerSetup{{Name: "a", Team: 1}, {Name: "b", Team: 2}}, 1)
		if err != nil {
			t.Fatal(err)
		}
		for _, p := range g.Players {
			p.Res = Res{1e4, 1e4, 1e4, 1e4, 1e4}
		}
		c := Command{Player: player, Type: typ, IDs: []int{id, id + 1, id + 2}, X: x, Y: y, Target: target, What: what, Index: idx}
		_ = g.Apply(c)
		for i := 0; i < 20; i++ {
			g.Step()
		}
		for _, p := range g.Players {
			for r, v := range p.Res {
				if v < -1e-6 {
					t.Fatalf("negative resource %d: %v", r, v)
				}
			}
		}
		for _, e := range g.Ents {
			if e.X < -1 || e.Y < -1 || e.X > float64(g.W)+1 || e.Y > float64(g.H)+1 {
				t.Fatalf("entity out of map: %v,%v", e.X, e.Y)
			}
		}
	})
}

// FuzzFog checks the fog codec round-trips and rejects garbage safely.
func FuzzFog(f *testing.F) {
	f.Add([]byte{1, 0, 2, 2, 1}, "21,13,")
	f.Fuzz(func(t *testing.T, states []byte, garbage string) {
		vis := make([]bool, len(states))
		exp := make([]bool, len(states))
		for i, s := range states {
			vis[i] = s%3 == 2
			exp[i] = s%3 >= 1
		}
		dec, ok := DecodeFog(EncodeFog(vis, exp), len(states))
		if !ok || len(dec) != len(states) {
			t.Fatal("round trip")
		}
		for i := range dec {
			want := 0
			if vis[i] {
				want = 2
			} else if exp[i] {
				want = 1
			}
			if dec[i] != want {
				t.Fatal("mismatch")
			}
		}
		DecodeFog(garbage, 64)
	})
}

// FuzzCleanText ensures sanitised text has no control or bidi characters.
func FuzzCleanText(f *testing.F) {
	f.Add("hello\x00‮world\n", 20)
	f.Fuzz(func(t *testing.T, s string, max int) {
		if max < 0 || max > 1000 {
			return
		}
		out := CleanText(s, max)
		if !utf8.ValidString(out) || utf8.RuneCountInString(out) > max {
			t.Fatalf("bad output %q", out)
		}
		if strings.ContainsAny(out, "\x00\x1b‮⁦") {
			t.Fatalf("dangerous characters kept: %q", out)
		}
	})
}
