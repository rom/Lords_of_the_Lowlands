package levels

import (
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
