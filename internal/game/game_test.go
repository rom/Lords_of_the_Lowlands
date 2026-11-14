package game

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

// flatLevel returns a 32x32 grass map with two starts and the given objects.
func flatLevel(objs ...Object) *Level {
	w, h := 32, 32
	l := &Level{Name: "Test", Theme: "temperate", Width: w, Height: h, StartAge: 0, MaxAge: 3,
		Tiles: strings.Repeat("0", w*h), Objects: objs, Starts: []Point{{6, 6}, {25, 25}}}
	if err := l.Validate(); err != nil {
		panic(err)
	}
	return l
}

func newGame(t *testing.T, l *Level, ai bool) *Game {
	t.Helper()
	g, err := NewGame(l, []PlayerSetup{{Name: "P0", Team: 1}, {Name: "P1", Team: 2, AI: ai, Difficulty: "normal"}}, 1)
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func steps(g *Game, n int) {
	for i := 0; i < n; i++ {
		g.Step()
		g.Events()
	}
}

func own(g *Game, p int, typ string) []*Entity {
	var out []*Entity
	for _, id := range g.order {
		if e := g.Ents[id]; e != nil && e.Owner == p && (typ == "" || e.Type == typ || (e.U != nil && e.U.Class == typ)) {
			out = append(out, e)
		}
	}
	return out
}

func ids(es []*Entity) []int {
	var out []int
	for _, e := range es {
		out = append(out, e.ID)
	}
	return out
}

func TestDefsComplete(t *testing.T) {
	if len(Ages) != 17 {
		t.Fatalf("want 17 ages, got %d", len(Ages))
	}
	for c, line := range UnitLine {
		if len(line) != len(Ages) {
			t.Fatalf("%s line length %d", c, len(line))
		}
	}
	for age := 0; age <= MaxAge; age++ {
		for _, c := range []string{ClassWorker, ClassInfantry, ClassRanged} {
			if BestUnit(c, age) == "" {
				t.Fatalf("no %s at age %d", c, age)
			}
		}
		if age >= 3 && BestUnit(ClassSiege, age) == "" {
			t.Fatalf("no siege at age %d", age)
		}
		generic := 0
		for _, id := range SortedTechs(age) {
			if len(Techs[id].MapTypes) == 0 {
				generic++
			}
		}
		if generic != 4*(age+1) {
			t.Fatalf("tech count at age %d", age)
		}
	}
	if BestUnit(ClassMounted, 1) != "" || BestUnit("nope", 3) != "" {
		t.Fatal("unexpected unit")
	}
	// power grows with age; cost-efficiency stays within bounds
	a, b := Units[BestUnit(ClassInfantry, 0)], Units[BestUnit(ClassInfantry, 16)]
	if b.HP <= a.HP || b.Attack <= a.Attack {
		t.Fatal("later units must be stronger")
	}
	if Units["starfighter"].Flying != true || Units["starfighter"].Cost[Energy] == 0 {
		t.Fatal("space units fly and cost energy")
	}
	if Units["clubman"].Cost[Gold] != 0 {
		t.Fatal("no gold before copper age")
	}
	d := AllDefs()
	if len(d.Units) == 0 || len(d.Techs) == 0 || len(d.BuildingNames) == 0 {
		t.Fatal("defs incomplete")
	}
	if _, err := json.Marshal(d); err != nil {
		t.Fatal(err)
	}
	if BuildingName("town_center", 0) != "Camp Fire" || BuildingName("town_center", 16) != "Command Nexus" || BuildingName("generator", 0) == "" || BuildingName("x", 0) != "x" {
		t.Fatal("building names")
	}
	if AgeEra(-1) != EraStone || AgeEra(99) != EraSpace {
		t.Fatal("age era clamp")
	}
	if AgeCost(MaxAge).Total() != 0 || AgeCost(0).Total() == 0 {
		t.Fatal("age cost")
	}
}

func TestCounters(t *testing.T) {
	cases := []struct {
		a, b string
		want float64
	}{
		{ClassInfantry, ClassMounted, 1.6}, {ClassInfantry, ClassSiege, 1.4}, {ClassRanged, ClassInfantry, 1.4},
		{ClassRanged, ClassBuilding, 0.4}, {ClassMounted, ClassRanged, 1.6}, {ClassMounted, ClassSiege, 1.8},
		{ClassSiege, ClassBuilding, 3.5}, {ClassSiege, ClassInfantry, 0.7}, {ClassWorker, ClassBuilding, 0.3},
		{ClassWorker, ClassInfantry, 1}, {ClassInfantry, ClassRanged, 1},
	}
	for _, c := range cases {
		if got := Counter(c.a, c.b); got != c.want {
			t.Errorf("Counter(%s,%s)=%v want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestResOps(t *testing.T) {
	a := Res{10, 20, 30, 40, 50}
	b := Res{1, 2, 3, 4, 5}
	if a.Add(b) != (Res{11, 22, 33, 44, 55}) || a.Sub(b) != (Res{9, 18, 27, 36, 45}) {
		t.Fatal("add/sub")
	}
	if !a.Covers(b) || b.Covers(a) || a.Total() != 150 || b.Scale(2) != (Res{2, 4, 6, 8, 10}) {
		t.Fatal("covers/total/scale")
	}
}

func TestCleanText(t *testing.T) {
	if got := CleanText("  hi\x00there‮  ", 50); got != "hithere" {
		t.Fatalf("got %q", got)
	}
	if got := CleanText("abcdef", 3); got != "abc" {
		t.Fatalf("got %q", got)
	}
	if got := CleanText(string([]byte{0xff, 'a'}), 10); got != "a" {
		t.Fatalf("got %q", got)
	}
	long := strings.Repeat("x", 200)
	if got := CleanText("a\nb"+long, 300); !strings.HasPrefix(got, "a b") {
		t.Fatalf("newline handling %q", got[:5])
	}
}

func TestLevelValidate(t *testing.T) {
	good := func() *Level {
		return &Level{Name: "L", Theme: "temperate", Width: 32, Height: 32, MaxAge: 2, Tiles: strings.Repeat("0", 1024), Starts: []Point{{5, 5}, {20, 20}}}
	}
	if err := good().Validate(); err != nil {
		t.Fatal(err)
	}
	bad := []func(*Level){
		func(l *Level) { l.Name = "\x00" },
		func(l *Level) { l.Theme = "lava" },
		func(l *Level) { l.Width = 10 },
		func(l *Level) { l.Height = 1000 },
		func(l *Level) { l.StartAge = 5; l.MaxAge = 2 },
		func(l *Level) { l.MaxAge = 40 },
		func(l *Level) { l.Objective = Objective{Type: "win"} },
		func(l *Level) { l.Objective = Objective{Type: ObjSurvive, Minutes: 0} },
		func(l *Level) { l.Objective = Objective{Type: ObjAdvance}; l.MaxAge = 0 },
		func(l *Level) { l.StartRes = Res{-1} },
		func(l *Level) { l.StartRes = Res{math.NaN()} },
		func(l *Level) { l.Difficulty = "godmode" },
		func(l *Level) { l.Tiles = "0" },
		func(l *Level) { l.Tiles = strings.Repeat("9", 1024) },
		func(l *Level) { l.Objects = []Object{{"dragon", 1, 1}} },
		func(l *Level) { l.Objects = []Object{{"tree", 99, 1}} },
		func(l *Level) { l.Objects = make([]Object, MaxObjects+1) },
		func(l *Level) { l.Starts = []Point{{5, 5}} },
		func(l *Level) { l.Starts = []Point{{0, 5}, {20, 20}} },
		func(l *Level) {
			l.Tiles = "3" + strings.Repeat("0", 1023)
			l.Starts = []Point{{2, 2}, {20, 20}}
			l.Tiles = strings.Repeat("0", 2*32+2) + "3" + strings.Repeat("0", 1024-2*32-3)
		},
	}
	for i, f := range bad {
		l := good()
		f(l)
		if err := l.Validate(); err == nil {
			t.Errorf("case %d: expected error", i)
		}
	}
	// generator-only levels
	l := &Level{Name: "G", Width: 40, Height: 40, MaxPlayers: 4, Gen: &GenParams{Seed: 1}}
	if err := l.Validate(); err != nil || l.Theme != "temperate" || l.Objective.Type != ObjConquest {
		t.Fatal(err)
	}
	l.MaxPlayers = 1
	if l.Validate() == nil {
		t.Fatal("maxPlayers")
	}
	s := good()
	s.Objective = Objective{Type: ObjSurvive, Minutes: 10}
	s.Opponents = 9
	if err := s.Validate(); err != nil || s.Opponents != 1 {
		t.Fatal("opponents clamp", err)
	}
	if len(ObjectKinds()) != 9 || Passable(TWater) || !Passable(TShallow) {
		t.Fatal("kinds/passable")
	}
}

func TestGenerateDeterministic(t *testing.T) {
	for _, th := range Themes {
		l := &Level{Name: "G", Theme: th, Width: 64, Height: 64, MaxPlayers: 4, StartAge: 10, MaxAge: 12,
			Gen: &GenParams{Seed: 42, Water: 0.5, Mountains: 0.5, Forest: 0.6, River: true, Animals: 1, Riches: 1}}
		if err := l.Validate(); err != nil {
			t.Fatal(err)
		}
		a, b := l.Materialize(4), l.Materialize(4)
		if a.Tiles != b.Tiles || len(a.Objects) != len(b.Objects) || len(a.Starts) != 4 {
			t.Fatal("not deterministic")
		}
		a.Gen = nil
		if err := a.Validate(); err != nil {
			t.Fatalf("%s: generated level invalid: %v", th, err)
		}
		// every start is reachable from every other
		g, err := NewGame(l, []PlayerSetup{{Name: "a", Team: 1}, {Name: "b", Team: 2}, {Name: "c", Team: 3}, {Name: "d", Team: 4}}, 1)
		if err != nil {
			t.Fatal(err)
		}
		x0, y0 := g.StartPos(0)
		for p := 1; p < 4; p++ {
			x1, y1 := g.StartPos(p)
			path := g.findPath(x0+2.5, y0+2.5, rect{int(x1) - 3, int(y1) - 3, int(x1) + 3, int(y1) + 3})
			if len(path) == 0 {
				t.Fatalf("%s: start %d unreachable", th, p)
			}
			last := path[len(path)-1]
			if math.Hypot(last.X-x1, last.Y-y1) > 5 {
				t.Fatalf("%s: start %d not connected (%v vs %v,%v)", th, p, last, x1, y1)
			}
		}
	}
	// materialize of explicit level copies slices; default params & clamps
	f := flatLevel(Object{"tree", 1, 1})
	m := f.Materialize(2)
	m.Objects[0].X = 9
	if f.Objects[0].X != 1 {
		t.Fatal("materialize must copy")
	}
	nl := &Level{Name: "n", Width: 40, Height: 40, MaxPlayers: 2}
	if got := nl.Materialize(1); len(got.Starts) != 2 {
		t.Fatal("min players")
	}
	if got := nl.Materialize(9); len(got.Starts) != 2 {
		t.Fatal("max players clamp")
	}
}

func TestNewGameSetup(t *testing.T) {
	if _, err := NewGame(flatLevel(), nil, 1); err == nil {
		t.Fatal("expected error for no players")
	}
	three := []PlayerSetup{{Name: "a"}, {Name: "b"}, {Name: "c"}}
	if _, err := NewGame(flatLevel(), three, 1); err == nil {
		t.Fatal("expected too few starts")
	}
	g := newGame(t, flatLevel(Object{"deer", 15, 15}, Object{"tree", 3, 3}), false)
	for p := 0; p < 2; p++ {
		if len(own(g, p, "town_center")) != 1 || len(own(g, p, ClassWorker)) != 3 {
			t.Fatal("start units")
		}
		if g.Players[p].PopCap != 10 || g.Players[p].Pop != 3 {
			t.Fatalf("pop %d/%d", g.Players[p].Pop, g.Players[p].PopCap)
		}
		if g.Players[p].Res[Food] != 200 || g.Players[p].Res[Gold] != 0 {
			t.Fatal("start resources")
		}
	}
	if len(own(g, Nature, "deer")) != 1 {
		t.Fatal("animal")
	}
	mv := g.Map()
	if len(mv.Tiles) != 32*32 || mv.Name != "Test" {
		t.Fatal("map view")
	}
	// later ages start with more
	l := flatLevel()
	l.StartAge, l.MaxAge = 12, 13
	g2 := newGame(t, l, false)
	if g2.Players[0].Res[Energy] == 0 || len(own(g2, 0, ClassWorker)) != 5 || len(own(g2, 0, ClassInfantry)) != 1 {
		t.Fatal("late start")
	}
}

func TestGatherAndDeposit(t *testing.T) {
	g := newGame(t, flatLevel(Object{"berry", 10, 7}, Object{"tree", 10, 9}, Object{"gold", 4, 10}), false)
	ws := own(g, 0, ClassWorker)
	berry := g.entityAt(10.5, 7.5)
	tree := g.entityAt(10.5, 9.5)
	if berry == nil || tree == nil {
		t.Fatal("resources missing")
	}
	if err := g.Apply(Command{Player: 0, Type: CmdGather, IDs: []int{ws[0].ID}, Target: berry.ID}); err != nil {
		t.Fatal(err)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdSmart, IDs: []int{ws[1].ID}, Target: tree.ID}); err != nil {
		t.Fatal(err)
	}
	food0, wood0 := g.Players[0].Res[Food], g.Players[0].Res[Wood]
	steps(g, 600)
	p := g.Players[0]
	if p.Res[Food] <= food0 || p.Res[Wood] <= wood0 {
		t.Fatalf("no income: food %v wood %v", p.Res[Food], p.Res[Wood])
	}
	if p.Gathered[Food] == 0 || p.Gathered[Wood] == 0 {
		t.Fatal("gathered stats")
	}
	// exhaust a resource: the gatherer moves on or idles
	berry.Amount = 0.001
	steps(g, 30)
	if !berry.dead {
		t.Fatal("depleted resource should vanish")
	}
}

func TestHuntingAndCarcass(t *testing.T) {
	g := newGame(t, flatLevel(Object{"deer", 12, 8}), false)
	deer := own(g, Nature, "deer")[0]
	ws := own(g, 0, ClassWorker)
	if err := g.Apply(Command{Player: 0, Type: CmdSmart, IDs: ids(ws), Target: deer.ID}); err != nil {
		t.Fatal(err)
	}
	steps(g, 900)
	if !deer.dead {
		t.Fatal("deer should be dead")
	}
	if g.Players[0].Gathered[Food] == 0 {
		t.Fatal("hunters should gather the carcass")
	}
}

func TestAggressiveAnimal(t *testing.T) {
	g := newGame(t, flatLevel(Object{"boar", 10, 10}), false)
	boar := own(g, Nature, "boar")[0]
	w := own(g, 0, ClassWorker)[0]
	_ = g.Apply(Command{Player: 0, Type: CmdAttack, IDs: []int{w.ID}, Target: boar.ID})
	steps(g, 60)
	if boar.Order != OAttack && !boar.dead {
		t.Fatal("boar should fight back")
	}
}

func TestBuildTrainResearch(t *testing.T) {
	g := newGame(t, flatLevel(), false)
	p := g.Players[0]
	ws := own(g, 0, ClassWorker)
	// invalid placements
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 5, Y: 5, What: "house"}); err != ErrPlacement {
		t.Fatalf("overlap: %v", err)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 31, Y: 31, What: "barracks"}); err != ErrPlacement {
		t.Fatalf("edge: %v", err)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 10, Y: 10, What: "stable"}); err != ErrAge {
		t.Fatalf("age: %v", err)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 10, Y: 10, What: "nope"}); err != ErrAge {
		t.Fatal("unknown building")
	}
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: []int{9999}, X: 10, Y: 10, What: "house"}); err != ErrNotOwner {
		t.Fatal("no workers")
	}
	wood := p.Res[Wood]
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 10, Y: 6, What: "house"}); err != nil {
		t.Fatal(err)
	}
	if p.Res[Wood] != wood-30 {
		t.Fatalf("house cost: %v", wood-p.Res[Wood])
	}
	house := own(g, 0, "house")[0]
	steps(g, 200)
	if !house.Built {
		t.Fatal("house not built")
	}
	if g.recalcPop(p); p.PopCap != 15 {
		t.Fatalf("popcap %d", p.PopCap)
	}
	// can't afford
	p.Res = Res{}
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 14, Y: 6, What: "barracks"}); err != ErrCannotAfford {
		t.Fatal("afford")
	}
	p.Res = Res{5000, 5000, 5000, 5000, 5000}
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 10, Y: 11, What: "barracks"}); err != nil {
		t.Fatal(err)
	}
	steps(g, 700)
	bar := own(g, 0, "barracks")[0]
	if !bar.Built {
		t.Fatal("barracks not built")
	}
	tc := own(g, 0, "town_center")[0]
	// training
	if err := g.Apply(Command{Player: 0, Type: CmdTrain, Target: bar.ID, What: ClassInfantry, Index: 3}); err != nil {
		t.Fatal(err)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdTrain, Target: bar.ID, What: ClassRanged}); err != ErrInvalid {
		t.Fatalf("wrong building: %v", err)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdTrain, Target: bar.ID, What: "knight"}); err != ErrAge {
		t.Fatal("future unit")
	}
	if err := g.Apply(Command{Player: 0, Type: CmdTrain, Target: tc.ID, What: "deer"}); err != ErrAge {
		t.Fatal("animal")
	}
	if err := g.Apply(Command{Player: 1, Type: CmdTrain, Target: bar.ID, What: ClassInfantry}); err != ErrNotOwner {
		t.Fatal("not owner")
	}
	if err := g.Apply(Command{Player: 0, Type: CmdRally, Target: bar.ID, X: 20, Y: 12}); err != nil {
		t.Fatal(err)
	}
	steps(g, 600)
	if n := len(own(g, 0, ClassInfantry)); n != 3 {
		t.Fatalf("trained %d", n)
	}
	// cancel refunds
	_ = g.Apply(Command{Player: 0, Type: CmdTrain, Target: tc.ID, What: ClassWorker})
	before := p.Res[Food]
	if err := g.Apply(Command{Player: 0, Type: CmdCancel, Target: tc.ID, Index: 0}); err != nil || p.Res[Food] <= before {
		t.Fatal("cancel refund", err)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdCancel, Target: tc.ID, Index: 5}); err != ErrInvalid {
		t.Fatal("cancel index")
	}
	// queue limit
	for i := 0; i < MaxQueue; i++ {
		_ = g.Apply(Command{Player: 0, Type: CmdTrain, Target: tc.ID, What: ClassWorker})
	}
	if err := g.Apply(Command{Player: 0, Type: CmdTrain, Target: tc.ID, What: ClassWorker}); err != ErrQueueFull {
		t.Fatal("queue full")
	}
	tc.Queue = nil
	// age advance
	if err := g.Apply(Command{Player: 0, Type: CmdResearch, Target: bar.ID, What: "age"}); err != ErrAge {
		t.Fatal("age only at TC")
	}
	if err := g.Apply(Command{Player: 0, Type: CmdResearch, Target: tc.ID, What: "age"}); err != nil {
		t.Fatal(err)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdResearch, Target: tc.ID, What: "age"}); err != ErrQueueFull {
		t.Fatal("double age")
	}
	steps(g, 450)
	if p.Age != 1 {
		t.Fatalf("age %d", p.Age)
	}
	// academy & tech
	_ = g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 14, Y: 15, What: "academy"})
	steps(g, 900)
	ac := own(g, 0, "academy")
	if len(ac) == 0 || !ac[0].Built {
		t.Fatal("academy")
	}
	if err := g.Apply(Command{Player: 0, Type: CmdResearch, Target: ac[0].ID, What: "attack_0"}); err != nil {
		t.Fatal(err)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdResearch, Target: ac[0].ID, What: "attack_0"}); err != ErrQueueFull {
		t.Fatal("dup tech")
	}
	if err := g.Apply(Command{Player: 0, Type: CmdResearch, Target: ac[0].ID, What: "attack_9"}); err != ErrAge {
		t.Fatal("future tech")
	}
	_ = g.Apply(Command{Player: 0, Type: CmdResearch, Target: ac[0].ID, What: "hp_0"})
	_ = g.Apply(Command{Player: 0, Type: CmdResearch, Target: ac[0].ID, What: "gather_0"})
	_ = g.Apply(Command{Player: 0, Type: CmdResearch, Target: ac[0].ID, What: "armor_0"})
	steps(g, 1200)
	if !p.Techs["attack_0"] || !p.Techs["hp_0"] || p.attackMul <= 1 || p.hpMul <= 1 || p.gatherMul <= 1 || p.armorAdd <= 0 || p.TechCount != 4 {
		t.Fatalf("techs %v", p.Techs)
	}
	g.applyTech(p, "attack_0") // idempotent
	if p.TechCount != 4 {
		t.Fatal("tech applied twice")
	}
	// max age reached
	p.Age = g.Level.MaxAge
	if err := g.Apply(Command{Player: 0, Type: CmdResearch, Target: tc.ID, What: "age"}); err != ErrAge {
		t.Fatal("beyond max age")
	}
	// cancel construction refund
	p.Res = Res{5000, 5000, 5000, 5000, 5000}
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: ids(ws), X: 3, Y: 10, What: "house"}); err != nil {
		t.Fatal(err)
	}
	hs := own(g, 0, "house")
	fnd := hs[len(hs)-1]
	if err := g.Apply(Command{Player: 0, Type: CmdCancel, Target: fnd.ID}); err != nil || !fnd.dead {
		t.Fatal("cancel construction")
	}
	if g.BuildCost(0, "house")[Wood] <= 0 {
		t.Fatal("build cost")
	}
}

func TestFarmAndHousing(t *testing.T) {
	g := newGame(t, flatLevel(), false)
	p := g.Players[0]
	ws := own(g, 0, ClassWorker)
	if err := g.Apply(Command{Player: 0, Type: CmdBuild, IDs: []int{ws[0].ID}, X: 10, Y: 6, What: "farm"}); err != nil {
		t.Fatal(err)
	}
	f0 := p.Gathered[Food]
	steps(g, 1200)
	if p.Gathered[Food] <= f0 {
		t.Fatal("farm should produce food")
	}
	farm := own(g, 0, "farm")[0]
	farm.Food = 0.01
	steps(g, 50)
	if !farm.dead {
		t.Fatal("exhausted farm should disappear")
	}
	// housing blocks training
	p.Res = Res{10000, 10000, 10000, 10000, 10000}
	tc := own(g, 0, "town_center")[0]
	for i := 0; i < 10; i++ {
		_ = g.Apply(Command{Player: 0, Type: CmdTrain, Target: tc.ID, What: ClassWorker})
	}
	steps(g, 2500)
	g.recalcPop(p)
	if p.Pop > p.PopCap {
		t.Fatalf("pop %d over cap %d", p.Pop, p.PopCap)
	}
	if len(tc.Queue) == 0 {
		t.Fatal("queue should be blocked by housing")
	}
}

func TestCombatAndVictory(t *testing.T) {
	g := newGame(t, flatLevel(), false)
	for _, p := range g.Players {
		p.Res = Res{1e5, 1e5, 1e5, 1e5, 1e5}
	}
	// spawn an army for player 0 next to player 1's base
	var army []int
	for i := 0; i < 12; i++ {
		u := g.spawnUnit("clubman", 0, 20+float64(i%4)*0.6, 20+float64(i/4)*0.6)
		army = append(army, u.ID)
	}
	tc1 := own(g, 1, "town_center")[0]
	if err := g.Apply(Command{Player: 0, Type: CmdAMove, IDs: army, X: tc1.X, Y: tc1.Y}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 10*60*6 && !g.Over; i++ {
		g.Step()
		g.Events()
		// keep attacking buildings as units go idle
		if i%50 == 0 {
			var targets []*Entity
			for _, e := range g.Ents {
				if e.Owner == 1 {
					targets = append(targets, e)
				}
			}
			if len(targets) > 0 {
				for _, u := range own(g, 0, ClassInfantry) {
					if u.Order == OIdle {
						_ = g.Apply(Command{Player: 0, Type: CmdAttack, IDs: []int{u.ID}, Target: targets[0].ID})
					}
				}
			}
		}
	}
	if !g.Over || g.Winner != 1 && g.Winner != g.Players[0].Team {
		t.Fatalf("game should end with player 0 winning: over=%v winner=%d", g.Over, g.Winner)
	}
	if !g.Players[0].Won || g.Players[1].Won || !g.Players[1].Defeated {
		t.Fatal("won flags")
	}
	r := g.Results()
	if r[0].Player != 0 || r[0].Score <= r[1].Score || g.Players[0].Kills == 0 {
		t.Fatalf("results %+v", r)
	}
	if err := g.Apply(Command{Player: 0, Type: CmdStop}); err != ErrInvalid {
		t.Fatal("commands after game over")
	}
	g.Step() // no-op
}

func TestCommandsMisc(t *testing.T) {
	g := newGame(t, flatLevel(Object{"tree", 15, 15}), false)
	ws := own(g, 0, ClassWorker)
	bad := []Command{
		{Player: -1, Type: CmdMove}, {Player: 5, Type: CmdMove}, {Player: 0, Type: "dance"},
		{Player: 0, Type: CmdMove, X: math.NaN()}, {Player: 0, Type: CmdMove, IDs: []int{12345}},
		{Player: 0, Type: CmdAttack, IDs: ids(ws), Target: 999999}, {Player: 0, Type: CmdGather, IDs: []int{424242}},
		{Player: 0, Type: CmdResearch, Target: 77777}, {Player: 0, Type: CmdCancel, Target: 77777},
		{Player: 0, Type: CmdRally, Target: 77777}, {Player: 0, Type: CmdDelete, IDs: []int{424242}},
		{Player: 0, Type: CmdTrain, Target: 4242},
	}
	for i, c := range bad {
		if err := g.Apply(c); err == nil {
			t.Errorf("bad command %d accepted", i)
		}
	}
	// move, formation, stop
	if err := g.Apply(Command{Player: 0, Type: CmdMove, IDs: append(ids(ws), ids(ws)...), X: 14, Y: 10}); err != nil {
		t.Fatal(err)
	}
	steps(g, 150)
	for _, w := range ws {
		if math.Hypot(w.X-14, w.Y-10) > 2.5 {
			t.Fatalf("worker did not arrive: %.1f,%.1f", w.X, w.Y)
		}
	}
	_ = g.Apply(Command{Player: 0, Type: CmdMove, IDs: ids(ws), X: 2, Y: 28})
	_ = g.Apply(Command{Player: 0, Type: CmdStop, IDs: ids(ws)})
	for _, w := range ws {
		if w.Order != OIdle {
			t.Fatal("stop")
		}
	}
	// smart on an invisible target falls back to move
	if err := g.Apply(Command{Player: 0, Type: CmdSmart, IDs: ids(ws), Target: 999, X: 3, Y: 3}); err != nil {
		t.Fatal(err)
	}
	// smart on own building with carried goods -> deposit
	ws[0].Carry, ws[0].CarryRes = 5, Wood
	tc := own(g, 0, "town_center")[0]
	_ = g.Apply(Command{Player: 0, Type: CmdSmart, IDs: []int{ws[0].ID}, Target: tc.ID})
	steps(g, 100)
	if ws[0].Carry != 0 {
		t.Fatal("deposit")
	}
	// enemy building: workers attack it
	tc1 := own(g, 1, "town_center")[0]
	g.Players[0].Visible[int(tc1.Y)*g.W+int(tc1.X)] = true
	_ = g.Apply(Command{Player: 0, Type: CmdSmart, IDs: []int{ws[1].ID}, Target: tc1.ID})
	if ws[1].Order != OAttack {
		t.Fatal("smart attack")
	}
	// repair a damaged own building
	tc.HP = tc.MaxHP / 2
	_ = g.Apply(Command{Player: 0, Type: CmdRepair, IDs: []int{ws[2].ID}, Target: tc.ID})
	steps(g, 300)
	if tc.HP <= tc.MaxHP/2 {
		t.Fatal("repair")
	}
	// delete and resign
	if err := g.Apply(Command{Player: 0, Type: CmdDelete, IDs: []int{ws[0].ID}}); err != nil || !ws[0].dead {
		t.Fatal("delete")
	}
	_ = g.Apply(Command{Player: 1, Type: CmdResign})
	steps(g, 10)
	if !g.Over || !g.Players[0].Won {
		t.Fatal("resign should end game")
	}
	g.Resign(0)
	g.Resign(99)
}

func TestSurviveAndAdvanceObjectives(t *testing.T) {
	l := flatLevel()
	l.Objective = Objective{Type: ObjSurvive, Minutes: 1}
	g, _ := NewGame(l, []PlayerSetup{{Name: "H", Team: 1}, {Name: "AI", Team: 2, AI: true}}, 2)
	steps(g, 10*61)
	if !g.Over || !g.Players[0].Won {
		t.Fatal("survive objective")
	}
	l2 := flatLevel()
	l2.Objective = Objective{Type: ObjAdvance}
	g2 := newGame(t, l2, false)
	g2.Players[1].Age = l2.MaxAge
	steps(g2, 10)
	if !g2.Over || !g2.Players[1].Won {
		t.Fatal("advance objective")
	}
}

func TestSnapshotFogAndVisibility(t *testing.T) {
	g := newGame(t, flatLevel(), false)
	steps(g, 2)
	s := g.Snapshot(0, []Event{{K: "shot", X: 6, Y: 6, O: 0}, {K: "shot", X: 25, Y: 25, O: 1}, {K: "gameover"}, {K: "alert", X: 6, Y: 6, O: 1}}, true)
	for _, e := range s.Ents {
		if e.Owner == 1 {
			t.Fatal("enemy entities must be hidden in fog")
		}
	}
	if len(s.Events) != 2 {
		t.Fatalf("events filtered: %+v", s.Events)
	}
	st, ok := DecodeFog(s.Fog, g.W*g.H)
	if !ok {
		t.Fatal("fog decode")
	}
	vis := 0
	for _, v := range st {
		if v == 2 {
			vis++
		}
	}
	if vis == 0 || vis == len(st) {
		t.Fatal("fog content")
	}
	// an enemy building placed in explored-but-not-visible land stays hidden
	g.Players[0].Explored[20*g.W+20] = true
	hidden := g.placeBuilding("house", 1, 20, 20, true)
	for _, e := range g.Snapshot(0, nil, false).Ents {
		if e.ID == hidden.ID {
			t.Fatal("unseen enemy building leaked")
		}
	}
	g.Players[0].Visible[int(hidden.Y)*g.W+int(hidden.X)] = true
	if !g.canSee(0, hidden) {
		t.Fatal("visible building not seen")
	}
	g.Players[0].Visible[int(hidden.Y)*g.W+int(hidden.X)] = false
	if !g.canSee(0, hidden) {
		t.Fatal("seen building should be remembered")
	}
	all := g.Snapshot(-1, nil, false)
	if len(all.Ents) <= len(s.Ents) {
		t.Fatal("spectator sees more")
	}
	if _, err := json.Marshal(s); err != nil {
		t.Fatal(err)
	}
	if _, ok := DecodeFog("9x,", 10); ok {
		t.Fatal("bad fog accepted")
	}
	if _, ok := DecodeFog("15,", 3); ok {
		t.Fatal("overlong fog accepted")
	}
	if EncodeFog([]bool{true, false}, []bool{true, true}) != "21,11," {
		t.Fatal("encode")
	}
}

func TestPathfinding(t *testing.T) {
	l := flatLevel()
	// wall of mountains with one gap
	b := []byte(l.Tiles)
	for y := 0; y < 32; y++ {
		if y != 28 {
			b[y*32+16] = '4'
		}
	}
	l.Tiles = string(b)
	l.Starts = []Point{{6, 6}, {25, 6}}
	g := newGame(t, l, false)
	p := g.findPath(10.5, 10.5, rect{22, 10, 22, 10})
	if len(p) == 0 {
		t.Fatal("no path")
	}
	end := p[len(p)-1]
	if int(end.X) != 22 || int(end.Y) != 10 {
		t.Fatalf("end %v", end)
	}
	crossed := false
	for _, pt := range p {
		if int(pt.Y) >= 26 {
			crossed = true
		}
	}
	if !crossed {
		t.Fatal("path should go through the gap")
	}
	// unreachable goal: returns closest
	b[28*32+16] = '4'
	for i := range g.Tiles {
		g.Tiles[i] = b[i] - '0'
	}
	p2 := g.findPath(10.5, 10.5, rect{22, 10, 22, 10})
	if len(p2) > 0 && int(p2[len(p2)-1].X) > 16 {
		t.Fatal("crossed the wall")
	}
	if g.findPath(-5, -5, rect{1, 1, 1, 1}) != nil || g.findPath(10.5, 10.5, rect{10, 10, 10, 10}) != nil {
		t.Fatal("degenerate paths")
	}
	if g.findPath(10.5, 10.5, rect{16, 3, 16, 3}) != nil {
		t.Fatal("closed goal")
	}
	if !(rect{0, 0, 2, 2}).contains(1, 1) || (rect{0, 0, 2, 2}).dist(5, 5) <= 0 {
		t.Fatal("rect")
	}
}

func TestFlyingAndSiege(t *testing.T) {
	l := flatLevel()
	l.StartAge, l.MaxAge = 15, 16
	g := newGame(t, l, false)
	f := g.spawnUnit("starfighter", 0, 8, 8)
	tc1 := own(g, 1, "town_center")[0]
	g.Players[0].Visible[int(tc1.Y)*g.W+int(tc1.X)] = true
	_ = g.Apply(Command{Player: 0, Type: CmdAttack, IDs: []int{f.ID}, Target: tc1.ID})
	hp := tc1.HP
	steps(g, 300)
	if tc1.HP >= hp {
		t.Fatal("starfighter should damage the base")
	}
	// splash damage from artillery
	l2 := flatLevel()
	l2.StartAge, l2.MaxAge = 12, 12
	g2 := newGame(t, l2, false)
	art := g2.spawnUnit("rocket_artillery", 0, 12, 12)
	var victims []*Entity
	for i := 0; i < 4; i++ {
		victims = append(victims, g2.spawnUnit("assault_trooper", 1, 17+float64(i)*0.3, 12))
	}
	_ = g2.Apply(Command{Player: 0, Type: CmdAttack, IDs: []int{art.ID}, Target: victims[0].ID})
	for _, v := range victims {
		v.Order = OMove // keep them from retaliating towards the artillery
		v.TX, v.TY = v.X, v.Y
	}
	steps(g2, 80)
	hurt := 0
	for _, v := range victims[1:] {
		if v.HP < v.MaxHP {
			hurt++
		}
	}
	if hurt == 0 {
		t.Fatal("splash damage expected")
	}
	// minimum range: artillery backs away from adjacent units
	close := g2.spawnUnit("assault_trooper", 1, art.X+0.5, art.Y)
	art.Order, art.Target = OAttack, close.ID
	x0 := art.X
	g2.stepUnit(art)
	if art.X == x0 {
		t.Fatal("artillery should step back")
	}
}

func TestAISimulation(t *testing.T) {
	lv := &Level{Name: "ai", Theme: "temperate", Width: 64, Height: 64, StartAge: 0, MaxAge: 3, MaxPlayers: 2, Gen: &GenParams{Seed: 9, Forest: 0.5, Animals: 0.5, Water: 0.2}}
	if err := lv.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, d := range []string{"easy", "normal", "hard"} {
		g, err := NewGame(lv, []PlayerSetup{{Name: "A", Team: 1, AI: true, Difficulty: d}, {Name: "B", Team: 2, AI: true, Difficulty: "normal"}}, 3)
		if err != nil {
			t.Fatal(err)
		}
		steps(g, 10*60*12)
		p := g.Players[0]
		if p.Pop < 10 || p.Gathered.Total() < 1000 || len(own(g, 0, "house")) == 0 {
			t.Fatalf("%s AI economy too weak: pop %d gathered %.0f", d, p.Pop, p.Gathered.Total())
		}
	}
}

func TestAIRebuildsAndHelpers(t *testing.T) {
	g := newGame(t, flatLevel(), true)
	p := g.Players[1]
	g.remove(own(g, 1, "town_center")[0])
	p.Res = Res{1000, 1000, 1000, 1000, 0}
	steps(g, 50)
	if len(own(g, 1, "town_center")) == 0 {
		t.Fatal("AI should rebuild its town centre")
	}
	if itoa(0) != "0" || itoa(123) != "123" {
		t.Fatal("itoa")
	}
	a := newAI("easy")
	if a.bonus >= 1 || newAI("hard").bonus <= 1 {
		t.Fatal("difficulty bonus")
	}
	s := &aiState{}
	if s.tcX(g) != 16 || s.tcY(g) != 16 {
		t.Fatal("tc fallback")
	}
}

func TestProjectileForAndValue(t *testing.T) {
	want := map[int]string{0: "stone", 1: "arrow", 8: "cannonball", 11: "bullet", 14: "laser", 16: "plasma"}
	for a, w := range want {
		if projectileFor(a) != w {
			t.Fatalf("age %d: %s", a, projectileFor(a))
		}
	}
	if unitValue(&Entity{}) != 0 {
		t.Fatal("value")
	}
	e := &Entity{Kind: KResource, R: Resources["tree"]}
	if e.Size() != 1 || e.Class() != "" {
		t.Fatal("resource size/class")
	}
}

// TestAIRebalanceAllSlots checks that the periodic worker rebalance runs for
// AI players in every slot, not only slot 0 (whose think ticks happen to line
// up with multiples of 50).
func TestAIRebalanceAllSlots(t *testing.T) {
	l := flatLevel(Object{"tree", 22, 22}, Object{"tree", 22, 23}, Object{"tree", 23, 22},
		Object{"tree", 9, 9}, Object{"tree", 9, 10}, Object{"tree", 10, 9},
		Object{"berry", 28, 21}, Object{"berry", 3, 10})
	g, err := NewGame(l, []PlayerSetup{{Name: "A", Team: 1, AI: true, Difficulty: "normal"}, {Name: "B", Team: 2, AI: true, Difficulty: "normal"}}, 1)
	if err != nil {
		t.Fatal(err)
	}
	p := g.Players[1]
	// lots of wood, nothing else: nothing to train, everyone chopping wood
	p.Res = Res{0, 5000, 0, 0, 0}
	trees := []*Entity{}
	for _, e := range g.Ents {
		if e.Kind == KResource && e.R.Res == Wood && e.X > 16 {
			trees = append(trees, e)
		}
	}
	ws := own(g, 1, ClassWorker)
	if len(ws) == 0 || len(trees) == 0 {
		t.Fatal("setup")
	}
	orig := map[int]bool{}
	for i, w := range ws {
		g.orderGather(w, trees[i%len(trees)])
		orig[w.ID] = true
	}
	steps(g, 100) // 10 game seconds
	for _, w := range own(g, 1, ClassWorker) {
		if r := g.Ents[w.Target]; orig[w.ID] && w.Order == OGather && r != nil && r.Kind == KResource && r.R.Res == Food {
			return
		}
	}
	t.Fatal("AI in slot 1 never moved a worker off its over-stocked wood")
}
