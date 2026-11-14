package game

import (
	"math"
	"testing"
)

func navalGame(t *testing.T, mapType string) *Game {
	t.Helper()
	lv := &Level{Name: "n", Theme: "temperate", Width: 64, Height: 64, StartAge: 4, MaxAge: 5, MaxPlayers: 2, MapType: mapType,
		Gen: &GenParams{Seed: 11, Forest: 0.5, Animals: 0.5, Water: 0.3}}
	if err := lv.Validate(); err != nil {
		t.Fatal(err)
	}
	g, err := NewGame(lv, []PlayerSetup{{Name: "A", Team: 1, AI: true, Difficulty: "hard"}, {Name: "B", Team: 2, AI: true, Difficulty: "normal"}}, 5)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func TestMapTypesGenerate(t *testing.T) {
	for _, mt := range MapTypes {
		g := navalGame(t, mt)
		water, fish := 0, 0
		for _, tt := range g.Tiles {
			if tt == TWater {
				water++
			}
		}
		for _, e := range g.Ents {
			if e.Type == "fish" {
				fish++
			}
		}
		t.Logf("%s: water %.1f%% fish %d naval %v", mt, 100*float64(water)/float64(len(g.Tiles)), fish, g.Naval)
		if NavalMap(mt, "temperate") && (!g.Naval || fish == 0) {
			t.Fatalf("%s should be naval with fish", mt)
		}
		if mt == MapDesert && (g.Naval || fish != 0) {
			t.Fatal("desert must not be naval")
		}
	}
	if NavalMap(MapCoastal, "space") || !ValidMapType("") || ValidMapType("ocean") {
		t.Fatal("naval/valid")
	}
	l := flatLevel()
	l.MapType = "ocean"
	if l.Validate() == nil {
		t.Fatal("bad map type accepted")
	}
}

func TestAIFishesAndSails(t *testing.T) {
	g := navalGame(t, MapCoastal)
	steps(g, 10*60*10)
	fishers, ships, docks := 0, 0, 0
	for _, e := range g.Ents {
		if e.U != nil && e.U.Class == ClassFisher {
			fishers++
		}
		if e.U != nil && e.U.Class == ClassNaval {
			ships++
		}
		if e.Type == "dock" {
			docks++
		}
	}
	t.Logf("docks %d fishers %d ships %d fish gathered A=%v", docks, fishers, ships, g.Players[0].Gathered[Food])
	if docks == 0 || fishers == 0 {
		t.Fatal("AI should build docks and fishing boats on coastal maps")
	}
	// boats stay on water
	for _, e := range g.Ents {
		if e.U != nil && e.U.Naval {
			tt := g.Tiles[int(e.Y)*g.W+int(e.X)]
			if tt != TWater && tt != TShallow {
				t.Fatalf("boat on land at %.1f,%.1f", e.X, e.Y)
			}
		}
	}
}

func TestMapTechs(t *testing.T) {
	l := flatLevel()
	l.MapType = MapDesert
	g := newGame(t, l, false)
	p := g.Players[0]
	p.Res = Res{1e5, 1e5, 1e5, 1e5, 1e5}
	p.Age = 4
	ac := g.placeBuilding("academy", 0, 10, 10, true)
	if err := g.Apply(Command{Player: 0, Type: CmdResearch, Target: ac.ID, What: "fishing_nets"}); err != ErrAge {
		t.Fatal("fishing nets in the desert")
	}
	for _, id := range []string{"irrigation", "deep_mining", "caravans"} {
		if err := g.Apply(Command{Player: 0, Type: CmdResearch, Target: ac.ID, What: id}); err != nil {
			t.Fatal(id, err)
		}
	}
	steps(g, 1500)
	if p.farmMul <= 1 || p.miningMul <= 1 || g.farmBase >= 1 {
		t.Fatal("map techs not applied")
	}
	ws := own(g, 0, ClassWorker)
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 3, Y: 11, What: "dock"}); err != ErrPlacement {
		t.Fatal("dock without water")
	}
	ship := g.spawnUnit("bireme", 0, 16, 16)
	soldier := g.spawnUnit("clubman", 0, 17, 17.5)
	foe := g.spawnUnit("clubman", 1, 17, 17)
	foe.MaxHP, foe.HP = 1e6, 1e6
	shot := func(u *Entity) float64 {
		u.Cooldown = 0
		n := len(g.hits)
		g.attackStep(u, foe, false)
		if len(g.hits) != n+1 {
			t.Fatal(u.Type, "did not fire")
		}
		return g.hits[n].dmg
	}
	shipBefore, soldierBefore := shot(ship), shot(soldier)
	hpBefore := ship.MaxHP
	g.applyTech(p, "navigation")
	g.applyTech(p, "fishing_nets")
	if p.navalMul <= 1 || p.fishMul <= 1 {
		t.Fatal("naval techs")
	}
	if got := shot(ship); math.Abs(got-shipBefore*1.2) > 1e-9 {
		t.Fatalf("warship attack %.3f -> %.3f after navigation, want x1.2", shipBefore, got)
	}
	if ship.MaxHP <= hpBefore {
		t.Fatal("warship hit points not raised by navigation")
	}
	if got := shot(soldier); got != soldierBefore {
		t.Fatalf("navigation changed land attack %.3f -> %.3f", soldierBefore, got)
	}
	if Counter(ClassNaval, ClassBuilding) <= 1 || Counter(ClassNaval, ClassFisher) <= 1 {
		t.Fatal("naval counters")
	}
	if !Techs["irrigation"].AllowedOn(MapDesert) || Techs["irrigation"].AllowedOn(MapCoastal) || !Techs["attack_0"].AllowedOn("x") {
		t.Fatal("allowed on")
	}
}

func TestPlayerFishing(t *testing.T) {
	l := flatLevel(Object{"fish", 15, 6}, Object{"fish", 16, 7}, Object{"fish", 15, 9})
	b := []byte(l.Tiles)
	for y := 2; y <= 12; y++ {
		for x := 12; x <= 20; x++ {
			b[y*32+x] = '3'
		}
	}
	l.Tiles = string(b)
	l.MapType = MapLakes
	l.StartAge = 2
	g := newGame(t, l, false)
	if !g.Naval {
		t.Fatal("lake map should be naval")
	}
	p := g.Players[0]
	p.Res = Res{1e4, 1e4, 1e4, 1e4, 0}
	for i := range p.Explored {
		p.Explored[i] = true
	}
	tc := own(g, 0, "town_center")[0]
	ws := own(g, 0, ClassWorker)
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 9, Y: 2, What: "dock"}); err != nil {
		t.Fatal(err)
	}
	steps(g, 600)
	dock := own(g, 0, "dock")[0]
	if !dock.Built {
		t.Fatal("dock not built")
	}
	if err := g.Apply(Command{Player: 0, Type: CmdTrain, Target: dock.ID, What: ClassFisher, Index: 2}); err != nil {
		t.Fatal(err)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdTrain, Target: dock.ID, What: ClassNaval}); err != nil {
		t.Fatal(err)
	}
	f0 := p.Gathered[Food]
	steps(g, 1500)
	boats := own(g, 0, ClassFisher)
	if len(boats) != 2 || len(own(g, 0, ClassNaval)) != 1 {
		t.Fatal("boats not trained")
	}
	if p.Gathered[Food] <= f0 {
		t.Fatal("boats should fish")
	}
	// smart: worker on fish moves instead of gathering; boat on dock returns
	var fish *Entity
	for _, e := range g.Ents {
		if e.Type == "fish" {
			fish = e
			break
		}
	}
	g.smart(ws[0], fish, CmdSmart)
	if ws[0].Order != OMove {
		t.Fatal("worker cannot fish")
	}
	g.smart(boats[0], dock, CmdSmart)
	g.smart(boats[1], tc, CmdSmart)
	if boats[1].Order != OMove {
		t.Fatal("boat on land target moves")
	}
}

func TestAIDefendFlag(t *testing.T) {
	for _, diff := range Difficulties {
		g := newGame(t, flatLevel(), true)
		p := g.Players[1]
		p.ai = newAI(diff)
		tc := own(g, 1, "town_center")[0]
		guard := g.spawnUnit("clubman", 1, tc.X+3, tc.Y)
		raider := g.spawnUnit("clubman", 0, tc.X-3, tc.Y)
		p.Visible[int(raider.Y)*g.W+int(raider.X)] = true
		p.ai.military(g, p, p.ai.survey(g, p))
		defended := guard.Order == OAttack && guard.Target == raider.ID
		if defended != p.ai.prof.Defend {
			t.Fatalf("%s: defended=%v, profile Defend=%v", diff, defended, p.ai.prof.Defend)
		}
		if diff == "super_easy" && defended {
			t.Fatal("super_easy should not defend")
		}
	}
}
