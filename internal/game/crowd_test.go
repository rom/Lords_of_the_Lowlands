package game

import (
	"math"
	"testing"
)

// crowd runs n workers on objs around a drop-off for five minutes and
// returns the longest time a working (non-idle) worker stood still without
// working, how many went idle, and how much was gathered.
func crowd(t *testing.T, objs []Object, camp string, n int, oneTarget bool) (stall float64, idle int, got float64) {
	g := newGame(t, flatLevel(objs...), false)
	g.placeBuilding(camp, 0, 11, 11, true)
	var ws []*Entity
	var first *Entity
	for _, e := range g.Ents {
		if e.Kind == KResource && (first == nil || e.ID < first.ID) {
			first = e
		}
	}
	for i := 0; i < n; i++ {
		w := g.spawnUnit("worker_0", 0, 9+float64(i%6)*0.5, 9+float64(i/6)*0.5)
		ws = append(ws, w)
		tg := first
		if !oneTarget {
			bd := 1e9
			for _, e := range g.Ents {
				if e.Kind == KResource {
					if d := math.Hypot(e.X-w.X, e.Y-w.Y); d < bd {
						bd, tg = d, e
					}
				}
			}
		}
		g.orderGather(w, tg)
	}
	since := map[int]int{}
	pos := map[int][2]float64{}
	worst, idle := 0, 0
	before := g.Players[0].Res
	for i := 0; i < 3000; i++ {
		g.Step()
		g.Events()
		for _, w := range ws {
			p := pos[w.ID]
			if w.Busy || math.Hypot(w.X-p[0], w.Y-p[1]) > 0.05 {
				pos[w.ID] = [2]float64{w.X, w.Y}
				since[w.ID] = g.Tick
			} else if s := g.Tick - since[w.ID]; s > worst && w.Order != OIdle {
				worst = s
			}
		}
	}
	for _, w := range ws {
		if w.Order == OIdle {
			idle++
		}
	}
	for r := range before {
		got += g.Players[0].Res[r] - before[r]
	}
	return float64(worst) / 10, idle, got
}

// Workers crowding at a forest, mine or drop-off must keep working: they
// used to shove each other back forever in lanes between trees, and a group
// sent to one tree went idle once someone else felled it.
func TestCrowdedWorkersKeepWorking(t *testing.T) {
	var forest, gold []Object
	for y := 14; y < 22; y++ {
		for x := 14; x < 22; x++ {
			if (x+y)%3 != 0 {
				forest = append(forest, Object{"tree", x, y})
			}
		}
	}
	for _, p := range [][2]int{{16, 15}, {17, 15}, {16, 16}, {17, 16}} {
		gold = append(gold, Object{"gold", p[0], p[1]})
	}
	for _, c := range []struct {
		name      string
		objs      []Object
		camp      string
		n         int
		oneTarget bool
		min       float64
	}{
		{"forest, nearest tree each", forest, "lumber_camp", 24, false, 2500},
		{"forest, whole group on one tree", forest, "lumber_camp", 24, true, 2500},
		{"gold mine, one pile", gold, "mining_camp", 16, true, 1600},
	} {
		stall, idle, got := crowd(t, c.objs, c.camp, c.n, c.oneTarget)
		if stall > 5 || idle > 0 || got < c.min {
			t.Errorf("%s: longest stall %.1fs, %d idle, gathered %.0f (want ≤ 5s, 0, ≥ %.0f)", c.name, stall, idle, got, c.min)
		}
	}
}
