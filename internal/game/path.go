package game

import (
	"container/heap"
	"math"
)

// Pt is a floating-point waypoint in tile space.
type Pt struct{ X, Y float64 }

type node struct {
	idx  int
	f, g float64
	hi   int // heap index
}

type nodeHeap []*node

func (h nodeHeap) Len() int            { return len(h) }
func (h nodeHeap) Less(i, j int) bool  { return h[i].f < h[j].f }
func (h nodeHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i]; h[i].hi = i; h[j].hi = j }
func (h *nodeHeap) Push(x interface{}) { n := x.(*node); n.hi = len(*h); *h = append(*h, n) }
func (h *nodeHeap) Pop() interface{} {
	old := *h
	n := old[len(old)-1]
	*h = old[:len(old)-1]
	return n
}

// maxExpand bounds the A* search effort per request.
const maxExpand = 4000

// walkable reports whether a ground unit may enter tile (x,y).
func (g *Game) walkable(x, y int) bool {
	if x < 0 || y < 0 || x >= g.W || y >= g.H {
		return false
	}
	i := y*g.W + x
	return Passable(int(g.Tiles[i])) && g.occ[i] == 0
}

// rect is an inclusive tile rectangle used as a path goal.
type rect struct{ x0, y0, x1, y1 int }

func (r rect) contains(x, y int) bool { return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 }

func (r rect) dist(x, y int) float64 {
	dx := math.Max(math.Max(float64(r.x0-x), 0), float64(x-r.x1))
	dy := math.Max(math.Max(float64(r.y0-y), 0), float64(y-r.y1))
	return math.Max(dx, dy) + 0.414*math.Min(dx, dy)
}

// FindPath returns waypoints (tile centres) from (sx,sy) to any walkable
// tile inside goal. If the goal is unreachable it returns a path to the
// closest reachable tile. The returned path excludes the start tile.
func (g *Game) findPath(sx, sy float64, goal rect) []Pt {
	sxi, syi := int(sx), int(sy)
	if sxi < 0 || syi < 0 || sxi >= g.W || syi >= g.H {
		return nil
	}
	start := syi*g.W + sxi
	if goal.contains(sxi, syi) {
		return nil
	}
	if !g.goalOpen(goal) {
		return nil
	}
	n := g.W * g.H
	if len(g.pathG) != n {
		g.pathClosed = make([]int32, n)
		g.pathG = make([]float64, n)
		g.pathFrom = make([]int32, n)
		g.pathMark = make([]int32, n)
		g.pathNodes = make([]*node, n)
	}
	g.pathGen++
	gen := g.pathGen
	open := &nodeHeap{}
	push := func(idx int, gc float64, from int) {
		x, y := idx%g.W, idx/g.W
		if g.pathMark[idx] == gen {
			if gc >= g.pathG[idx] {
				return
			}
			nd := g.pathNodes[idx]
			if nd != nil && nd.hi >= 0 {
				nd.g = gc
				nd.f = gc + 1.2*goal.dist(x, y)
				g.pathFrom[idx] = int32(from)
				g.pathG[idx] = gc
				heap.Fix(open, nd.hi)
				return
			}
		}
		g.pathMark[idx] = gen
		g.pathG[idx] = gc
		g.pathFrom[idx] = int32(from)
		nd := &node{idx: idx, g: gc, f: gc + 1.2*goal.dist(x, y)}
		g.pathNodes[idx] = nd
		heap.Push(open, nd)
	}
	push(start, 0, -1)
	best, bestH := start, goal.dist(sxi, syi)
	found := -1
	for exp := 0; open.Len() > 0 && exp < maxExpand; exp++ {
		cur := heap.Pop(open).(*node)
		cur.hi = -1
		if g.pathClosed[cur.idx] == gen {
			continue
		}
		g.pathClosed[cur.idx] = gen
		cx, cy := cur.idx%g.W, cur.idx/g.W
		if goal.contains(cx, cy) {
			found = cur.idx
			break
		}
		if hd := goal.dist(cx, cy); hd < bestH {
			best, bestH = cur.idx, hd
		}
		for dy := -1; dy <= 1; dy++ {
			for dx := -1; dx <= 1; dx++ {
				if dx == 0 && dy == 0 {
					continue
				}
				nx, ny := cx+dx, cy+dy
				ni := ny*g.W + nx
				inGoal := goal.contains(nx, ny)
				if !g.walkable(nx, ny) && !(inGoal && g.inBounds(nx, ny) && Passable(int(g.Tiles[ni]))) {
					continue
				}
				cost := 1.0
				if dx != 0 && dy != 0 {
					// no corner cutting
					if !g.walkable(cx+dx, cy) || !g.walkable(cx, cy+dy) {
						continue
					}
					cost = math.Sqrt2
				}
				if g.Tiles[ni] == TShallow {
					cost *= 1.3
				}
				push(ni, cur.g+cost, cur.idx)
			}
		}
	}
	end := found
	if end < 0 {
		end = best
	}
	var rev []Pt
	for i := end; i != start && i >= 0; i = int(g.pathFrom[i]) {
		rev = append(rev, Pt{float64(i%g.W) + 0.5, float64(i/g.W) + 0.5})
		if len(rev) > n {
			break
		}
	}
	path := make([]Pt, len(rev))
	for i := range rev {
		path[i] = rev[len(rev)-1-i]
	}
	return smoothPath(g, sx, sy, path)
}

// goalOpen reports whether any tile of the goal can be stood on.
func (g *Game) goalOpen(r rect) bool {
	for y := r.y0; y <= r.y1; y++ {
		for x := r.x0; x <= r.x1; x++ {
			if g.walkable(x, y) {
				return true
			}
		}
	}
	return false
}

func (g *Game) inBounds(x, y int) bool { return x >= 0 && y >= 0 && x < g.W && y < g.H }

// lineClear checks that the straight segment between two points only
// crosses walkable tiles.
func (g *Game) lineClear(ax, ay, bx, by float64) bool {
	d := math.Hypot(bx-ax, by-ay)
	steps := int(d*3) + 1
	for i := 0; i <= steps; i++ {
		t := float64(i) / float64(steps)
		x, y := ax+(bx-ax)*t, ay+(by-ay)*t
		// sample a small box to respect unit radius
		for _, o := range [][2]float64{{0, 0}, {0.3, 0.3}, {-0.3, -0.3}, {0.3, -0.3}, {-0.3, 0.3}} {
			if !g.walkable(int(x+o[0]), int(y+o[1])) {
				return false
			}
		}
	}
	return true
}

// smoothPath removes unnecessary waypoints using line-of-sight checks.
func smoothPath(g *Game, sx, sy float64, p []Pt) []Pt {
	if len(p) < 3 {
		return p
	}
	out := []Pt{}
	cx, cy := sx, sy
	i := 0
	for i < len(p) {
		j := len(p) - 1
		if len(p)-i > 24 {
			j = i + 24
		}
		for ; j > i; j-- {
			if g.lineClear(cx, cy, p[j].X, p[j].Y) {
				break
			}
		}
		out = append(out, p[j])
		cx, cy = p[j].X, p[j].Y
		i = j + 1
	}
	return out
}
