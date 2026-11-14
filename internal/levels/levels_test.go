package levels

import (
	"strings"
	"testing"

	"github.com/rom/lords_of_the_lowlands/internal/game"
)

func TestCampaign(t *testing.T) {
	c := Campaign()
	if len(c) < 15 {
		t.Fatalf("need at least 15 levels, have %d", len(c))
	}
	prevStart := -1
	for i, l := range c {
		if l.StartAge < prevStart {
			t.Fatalf("level %d goes back in time", i+1)
		}
		prevStart = l.StartAge
		if Index(l.ID) != i+1 {
			t.Fatal("index")
		}
		g, ok := Get(l.ID)
		if !ok || g == l || g.Gen == l.Gen {
			t.Fatal("Get must return a copy")
		}
		m := g.Materialize(l.Opponents + 1)
		m.Gen = nil
		if err := m.Validate(); err != nil {
			t.Fatalf("level %d invalid: %v", i+1, err)
		}
		gm, err := game.NewGame(g, []game.PlayerSetup{{Name: "h", Team: 1}, {Name: "a", Team: 2, AI: true}}, 1)
		if err != nil {
			t.Fatal(err)
		}
		for k := 0; k < 20; k++ {
			gm.Step()
		}
	}
	if c[0].StartAge != 0 || c[len(c)-1].MaxAge != game.MaxAge || c[len(c)-1].Theme != "space" {
		t.Fatal("campaign must run from the dawn to space")
	}
	if _, ok := Get("nope"); ok || Index("nope") != 0 {
		t.Fatal("unknown")
	}
}

func TestSkirmish(t *testing.T) {
	l, err := Skirmish(SkirmishOptions{Theme: "mars", StartAge: 5, MaxAge: 3, Water: 7})
	if err != nil {
		t.Fatal(err)
	}
	if l.Width != 112 || l.MaxPlayers != 2 || l.MaxAge != 5 || l.Gen.Water != 0.3 {
		t.Fatalf("defaults %+v", l)
	}
	if _, err := Skirmish(SkirmishOptions{Theme: "lava"}); err == nil {
		t.Fatal("bad theme")
	}
	if _, err := Skirmish(SkirmishOptions{Size: 5000}); err == nil {
		t.Fatal("bad size")
	}
}

func TestMapSizePresets(t *testing.T) {
	if n, ok := SizeTiles(""); !ok || n != 0 {
		t.Fatal("empty size must keep the level size")
	}
	if _, ok := SizeTiles("gigantic"); ok {
		t.Fatal("unknown preset accepted")
	}
	camp := Campaign()[0]
	for _, z := range game.MapSizes {
		for _, players := range []int{2, 4, 8} {
			l, err := Skirmish(SkirmishOptions{Theme: "temperate", Players: players, Seed: 9, MapType: "coastal"})
			if err != nil {
				t.Fatal(err)
			}
			if l, err = Resize(l, z.ID); err != nil {
				t.Fatalf("%s: %v", z.ID, err)
			}
			m := l.Materialize(players)
			if m.Width != z.Tiles || len(m.Starts) < players {
				t.Fatalf("%s/%d players: %dx%d starts=%d", z.ID, players, m.Width, m.Height, len(m.Starts))
			}
		}
		r, err := Resize(camp, z.ID)
		if err != nil || r.Width != z.Tiles || r.ID != camp.ID {
			t.Fatalf("campaign resize %s: %v", z.ID, err)
		}
	}
	if camp.Width == game.MapSizes[0].Tiles {
		t.Fatal("resizing must not modify the built-in level")
	}
	fixed := *camp
	fixed.Tiles = strings.Repeat("0", camp.Width*camp.Height)
	if _, err := Resize(&fixed, "huge"); err == nil {
		t.Fatal("hand-made map resized")
	}
	if same, err := Resize(&fixed, ""); err != nil || same != &fixed {
		t.Fatal("default size must return the level unchanged")
	}
}
