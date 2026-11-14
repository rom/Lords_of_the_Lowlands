package game

import (
	"math"
)

// AI is a computer opponent. It runs once per second and issues the same
// commands a human could, so it cannot cheat beyond its difficulty bonus.
type AI struct {
	Difficulty string
	bonus      float64 // gather/build speed multiplier
	attackSize int
	nextAttack int
	attacking  bool
	waveSize   int
	thinks     int
	stageUntil int
	lastBuild  map[string]int
}

func newAI(diff string) *AI {
	a := &AI{Difficulty: diff, bonus: 1, attackSize: 10, lastBuild: map[string]int{}}
	switch diff {
	case "easy":
		a.bonus, a.attackSize = 0.75, 14
	case "hard":
		a.bonus, a.attackSize = 1.3, 8
	}
	return a
}

type aiState struct {
	tc        *Entity
	workers   []*Entity
	idle      []*Entity
	military  []*Entity
	buildings map[string][]*Entity
	pending   map[string]int
	byRes     [NumRes]int
}

func (a *AI) survey(g *Game, p *Player) *aiState {
	s := &aiState{buildings: map[string][]*Entity{}, pending: map[string]int{}}
	for _, id := range g.order {
		e := g.Ents[id]
		if e == nil || e.dead || e.Owner != p.Index {
			continue
		}
		switch e.Kind {
		case KUnit:
			if e.U.Class == ClassWorker {
				s.workers = append(s.workers, e)
				if e.Order == OIdle {
					s.idle = append(s.idle, e)
				} else if e.Order == OGather || e.Order == OAttack {
					res := e.CarryRes
					if t := g.Ents[e.Target]; t != nil {
						if t.Kind == KResource {
							res = t.R.Res
						} else {
							res = Food
						}
					}
					s.byRes[res]++
				}
			} else {
				s.military = append(s.military, e)
			}
		case KBuilding:
			if e.Built {
				s.buildings[e.Type] = append(s.buildings[e.Type], e)
				if e.Type == "town_center" && s.tc == nil {
					s.tc = e
				}
			} else {
				s.pending[e.Type]++
			}
		}
	}
	return s
}

func (s *aiState) tcX(g *Game) float64 {
	if s.tc != nil {
		return s.tc.X
	}
	return float64(g.W) / 2
}

func (s *aiState) tcY(g *Game) float64 {
	if s.tc != nil {
		return s.tc.Y
	}
	return float64(g.H) / 2
}

func (a *AI) think(g *Game, p *Player) {
	s := a.survey(g, p)
	if s.tc == nil {
		// try to rebuild the town centre
		if len(s.workers) > 0 && s.pending["town_center"] == 0 {
			a.build(g, p, s, "town_center", s.workers[0].X, s.workers[0].Y)
		}
		a.military(g, p, s)
		return
	}
	a.economy(g, p, s)
	a.construct(g, p, s)
	a.research(g, p, s)
	a.military(g, p, s)
}

func (a *AI) wantWorkers(p *Player) int {
	w := 14 + 3*p.Age
	if w > 45 {
		w = 45
	}
	return w
}

func (a *AI) economy(g *Game, p *Player, s *aiState) {
	if len(s.workers) < a.wantWorkers(p) && len(s.tc.Queue) < 2 && p.Pop < p.PopCap {
		_ = g.queueUnit(p, s.tc, ClassWorker)
	}
	// desired distribution
	want := [NumRes]float64{0.45, 0.35, 0.10, 0.10, 0}
	if p.Age < 2 {
		want = [NumRes]float64{0.5, 0.38, 0.12, 0, 0}
	}
	if p.Age >= 10 {
		want = [NumRes]float64{0.42, 0.2, 0.08, 0.2, 0.1}
	}
	// rebalance: move one worker from the most over-stocked resource to the
	// scarcest one every few seconds
	a.thinks++
	if a.thinks%5 == 0 {
		hi, lo := -1, -1
		for r := 0; r < NumRes; r++ {
			if want[r] == 0 {
				continue
			}
			v := p.Res[r] / want[r]
			if hi < 0 || v > p.Res[hi]/want[hi] {
				hi = r
			}
			if lo < 0 || v < p.Res[lo]/want[lo] {
				lo = r
			}
		}
		if hi >= 0 && lo >= 0 && hi != lo && p.Res[hi] > 2*p.Res[lo]+250 {
			for _, w := range s.workers {
				if t := g.Ents[w.Target]; w.Order == OGather && t != nil && t.Kind == KResource && t.R.Res == hi {
					a.assign(g, p, s, w, lo)
					s.byRes[hi]--
					s.byRes[lo]++
					break
				}
			}
		}
	}
	for _, w := range s.idle {
		best, bestDef := Food, -1e9
		n := float64(len(s.workers)) + 1
		for r := 0; r < NumRes; r++ {
			if want[r] == 0 {
				continue
			}
			def := want[r] - float64(s.byRes[r])/n
			if def > bestDef {
				best, bestDef = r, def
			}
		}
		a.assign(g, p, s, w, best)
		s.byRes[best]++
	}
}

func (a *AI) assign(g *Game, p *Player, s *aiState, w *Entity, res int) {
	if res == Food {
		// farms first if available and idle
		for _, f := range s.buildings["farm"] {
			taken := false
			for _, o := range s.workers {
				if o != w && o.Target == f.ID {
					taken = true
					break
				}
			}
			if !taken {
				g.orderGather(w, f)
				return
			}
		}
		// hunt or forage
		var best *Entity
		bd := 26.0
		for _, e := range g.Ents {
			if e.dead || !p.Explored[int(e.Y)*g.W+int(e.X)] {
				continue
			}
			ok := (e.Kind == KResource && e.R.Res == Food) || (e.Kind == KUnit && e.Owner == Nature && !e.U.Aggressive)
			if !ok {
				continue
			}
			if d := math.Hypot(e.X-s.tc.X, e.Y-s.tc.Y); d < bd {
				bd, best = d, e
			}
		}
		if best != nil {
			g.orderGather(w, best)
			return
		}
		if s.pending["farm"] < 2 {
			if a.build(g, p, s, "farm", s.tc.X, s.tc.Y) {
				return
			}
		}
		res = Wood
	}
	r := g.nearestResource(s.tc.X, s.tc.Y, res, 40, nil)
	if r == nil {
		r = g.nearestResource(w.X, w.Y, -1, 30, nil)
	}
	if r == nil {
		return
	}
	// build a drop-off if far away
	if d := g.nearestDropoff(&Entity{Owner: p.Index, X: r.X, Y: r.Y}, r.R.Res); d == nil || distTo(d, r.X, r.Y) > 9 {
		camp := "lumber_camp"
		if r.R.Res == Food {
			camp = "granary"
		} else if r.R.Res != Wood {
			camp = "mining_camp"
		}
		if s.pending[camp] == 0 && g.Tick-a.lastBuild[camp] > 300 {
			if a.build(g, p, s, camp, r.X, r.Y) {
				a.lastBuild[camp] = g.Tick
				return
			}
		}
	}
	g.orderGather(w, r)
}

// build places a building near (x,y) with a free worker.
func (a *AI) build(g *Game, p *Player, s *aiState, typ string, x, y float64) bool {
	d := Buildings[typ]
	if d == nil || d.Age > p.Age {
		return false
	}
	cost := g.buildCost(p, d)
	if !p.Res.Covers(cost) {
		return false
	}
	var w *Entity
	for _, c := range s.idle {
		if c.Order == OIdle {
			w = c
			break
		}
	}
	if w == nil {
		bd := 1e9
		for _, c := range s.workers {
			if c.Order == OBuild {
				continue
			}
			if dd := math.Hypot(c.X-x, c.Y-y); dd < bd {
				bd, w = dd, c
			}
		}
	}
	if w == nil {
		return false
	}
	tx, ty, ok := a.findSpot(g, p, d.Size, x, y)
	if !ok {
		return false
	}
	err := g.Apply(Command{Player: p.Index, Type: CmdBuild, IDs: []int{w.ID}, X: float64(tx), Y: float64(ty), What: typ})
	if err == nil {
		s.pending[typ]++
	}
	return err == nil
}

func (a *AI) findSpot(g *Game, p *Player, size int, x, y float64) (int, int, bool) {
	cx, cy := int(x)-size/2, int(y)-size/2
	for r := 2; r < 18; r++ {
		for i := 0; i < r*8; i++ {
			ang := float64(i) / float64(r*8) * 2 * math.Pi
			tx := cx + int(math.Round(math.Cos(ang)*float64(r)))
			ty := cy + int(math.Round(math.Sin(ang)*float64(r)))
			if tx < 1 || ty < 1 || tx+size >= g.W-1 || ty+size >= g.H-1 || !p.Explored[ty*g.W+tx] {
				continue
			}
			// keep a one-tile margin for paths
			if g.footprintFree(tx-1, ty-1, size+2, true) && g.footprintFree(tx, ty, size, false) {
				return tx, ty, true
			}
		}
	}
	return 0, 0, false
}

func (a *AI) construct(g *Game, p *Player, s *aiState) {
	if p.Res[Food] < 300 && p.Res[Wood] > 250 && s.pending["farm"] < 2 && len(s.buildings["farm"]) < len(s.workers)/2 {
		a.build(g, p, s, "farm", s.tc.X, s.tc.Y)
	}
	if p.PopCap-p.Pop < 6 && p.PopCap < PopLimit && s.pending["house"] == 0 {
		a.build(g, p, s, "house", s.tc.X, s.tc.Y)
		return
	}
	plan := []string{"barracks", "range", "academy", "stable", "workshop", "tower", "generator", "barracks", "range", "stable"}
	want := map[string]int{}
	for _, b := range plan {
		want[b]++
		have := len(s.buildings[b]) + s.pending[b]
		if have < want[b] && Buildings[b].Age <= p.Age {
			if b == "tower" && len(s.military) < 4 {
				continue
			}
			if b == "generator" {
				want[b] = 2
			}
			if len(s.workers) < 8+len(s.buildings)/2 {
				return
			}
			a.build(g, p, s, b, s.tc.X+float64(g.rng.Intn(9)-4), s.tc.Y+float64(g.rng.Intn(9)-4))
			return
		}
	}
	if len(s.buildings["farm"])+s.pending["farm"] < len(s.workers)/4 && g.nearestResource(s.tc.X, s.tc.Y, Food, 15, nil) == nil {
		a.build(g, p, s, "farm", s.tc.X, s.tc.Y)
	}
}

func (a *AI) research(g *Game, p *Player, s *aiState) {
	if p.Age < g.Level.MaxAge && len(s.workers) >= 10+p.Age {
		c := AgeCost(p.Age)
		if p.Res.Covers(c) {
			_ = g.queueResearch(p, s.tc, "age")
			return
		}
	}
	if acad := s.buildings["academy"]; len(acad) > 0 && len(acad[0].Queue) == 0 {
		for _, k := range []string{"gather", "attack", "armor", "hp"} {
			for age := 0; age <= p.Age; age++ {
				id := k + "_" + itoa(age)
				t := Techs[id]
				if t == nil || p.Techs[id] {
					continue
				}
				// keep reserve for age advance
				if p.Res.Sub(t.Cost).Covers(AgeCost(p.Age).Scale(0.5)) {
					if g.queueResearch(p, acad[0], id) == nil {
						return
					}
				}
			}
		}
	}
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b [8]byte
	n := len(b)
	for i > 0 {
		n--
		b[n] = byte('0' + i%10)
		i /= 10
	}
	return string(b[n:])
}

func (a *AI) military(g *Game, p *Player, s *aiState) {
	minArmy := 4 + p.Age/3
	var reserve Res
	if p.Age < g.Level.MaxAge && len(s.military) >= minArmy && len(s.workers) >= 10+p.Age/2 {
		reserve = AgeCost(p.Age) // saving up for the next age
	}
	for _, kind := range []string{"barracks", "range", "stable", "workshop"} {
		for _, b := range s.buildings[kind] {
			if len(b.Queue) >= 2 {
				continue
			}
			cl := b.B.Trains[0]
			id := BestUnit(cl, p.Age)
			if id == "" {
				continue
			}
			if p.Res.Sub(Units[id].Cost).Covers(reserve) && p.Pop+Units[id].Pop <= p.PopCap {
				_ = g.queueUnit(p, b, cl)
			}
		}
	}
	// defend: enemies near own buildings
	var threat *Entity
	for _, e := range g.Ents {
		if e.Kind != KUnit || e.dead || !g.hostile(p.Index, e.Owner) || !p.Visible[int(e.Y)*g.W+int(e.X)] {
			continue
		}
		if s.tc != nil && math.Hypot(e.X-s.tc.X, e.Y-s.tc.Y) < 14 {
			threat = e
			break
		}
	}
	if threat != nil && !a.attacking {
		for _, m := range s.military {
			if m.Order == OIdle || m.Order == OMove {
				g.smart(m, threat, CmdAttack)
			}
		}
		return
	}
	minutes := float64(g.Tick) / TickRate / 60
	if !a.attacking && len(s.military) >= a.attackSize+p.Age/2 && g.Tick >= a.nextAttack && minutes > 4 {
		a.attacking = true
		a.waveSize = len(s.military)
		a.attackSize += 2
		// stage the army together part-way to the target first
		if t := a.pickTarget(g, p, s.tcX(g), s.tcY(g)); t != nil {
			sx, sy := s.tcX(g)+(t.X-s.tcX(g))*0.55, s.tcY(g)+(t.Y-s.tcY(g))*0.55
			var ids []int
			for _, m := range s.military {
				ids = append(ids, m.ID)
			}
			_ = g.Apply(Command{Player: p.Index, Type: CmdAMove, IDs: ids, X: sx, Y: sy})
			a.stageUntil = g.Tick + 300
		}
	}
	if a.attacking && g.Tick < a.stageUntil {
		return
	}
	if a.attacking {
		if len(s.military) < a.waveSize/3+1 {
			// the wave is spent: regroup at home
			a.attacking = false
			a.nextAttack = g.Tick + 600
			if s.tc != nil {
				for _, m := range s.military {
					g.orderMove(m, s.tc.X+3, s.tc.Y+3, true)
				}
			}
			return
		}
		for _, m := range s.military {
			if m.Order == OIdle || m.Order == OMove {
				if t := a.pickTarget(g, p, m.X, m.Y); t != nil {
					g.orderMove(m, t.X, t.Y, true)
				}
			}
		}
		return
	}
	// idle soldiers gather near the town centre
	if s.tc != nil {
		for _, m := range s.military {
			if m.Order == OIdle && math.Hypot(m.X-s.tc.X, m.Y-s.tc.Y) > 12 {
				g.orderMove(m, s.tc.X+3, s.tc.Y+3, true)
			}
		}
	}
}

// pickTarget returns the nearest hostile building (town centres preferred)
// to (ox, oy).
func (a *AI) pickTarget(g *Game, p *Player, ox, oy float64) *Entity {
	var best *Entity
	bd := 1e9
	for _, e := range g.Ents {
		if e.Kind != KBuilding || !g.hostile(p.Index, e.Owner) {
			continue
		}
		d := math.Hypot(e.X-ox, e.Y-oy)
		if e.Type == "town_center" {
			d *= 0.8
		}
		if d < bd {
			bd, best = d, e
		}
	}
	if best == nil {
		for _, e := range g.Ents {
			if e.Kind == KUnit && g.hostile(p.Index, e.Owner) {
				if d := math.Hypot(e.X-ox, e.Y-oy); d < bd {
					bd, best = d, e
				}
			}
		}
	}
	return best
}
