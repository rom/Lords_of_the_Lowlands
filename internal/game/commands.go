package game

import (
	"math"
)

// Command types accepted from clients.
const (
	CmdMove     = "move"
	CmdAMove    = "amove"
	CmdSmart    = "smart"
	CmdAttack   = "attack"
	CmdGather   = "gather"
	CmdBuild    = "build"
	CmdRepair   = "repair"
	CmdTrain    = "train"
	CmdResearch = "research"
	CmdStop     = "stop"
	CmdCancel   = "cancel"
	CmdRally    = "rally"
	CmdDelete   = "delete"
	CmdResign   = "resign"
)

// MaxCommandIDs bounds the number of units a single command may address.
const MaxCommandIDs = 120

// MaxQueue is the per-building production queue length.
const MaxQueue = 10

// Command is a player instruction. It is decoded from untrusted input and
// fully validated by Apply.
type Command struct {
	Player int     `json:"-"`
	Type   string  `json:"c"`
	IDs    []int   `json:"ids,omitempty"`
	X      float64 `json:"x,omitempty"`
	Y      float64 `json:"y,omitempty"`
	Target int     `json:"t,omitempty"`
	What   string  `json:"w,omitempty"`
	Index  int     `json:"i,omitempty"`
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

// ownUnits returns the live units in ids owned by player.
func (g *Game) ownUnits(player int, ids []int) []*Entity {
	var out []*Entity
	seen := map[int]bool{}
	for i, id := range ids {
		if i >= MaxCommandIDs {
			break
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		if e := g.Ents[id]; e != nil && !e.dead && e.Kind == KUnit && e.Owner == player {
			out = append(out, e)
		}
	}
	return out
}

func (g *Game) ownBuilding(player, id int) *Entity {
	e := g.Ents[id]
	if e == nil || e.dead || e.Kind != KBuilding || e.Owner != player {
		return nil
	}
	return e
}

// canSee reports whether a player currently sees (or has explored, for
// static objects) the given entity.
func (g *Game) canSee(player int, e *Entity) bool {
	if e.Owner >= 0 && g.Allied(player, e.Owner) {
		return true
	}
	i := int(e.Y)*g.W + int(e.X)
	if i < 0 || i >= len(g.Tiles) {
		return false
	}
	p := g.Players[player]
	if e.Kind == KResource {
		return p.Explored[i]
	}
	if e.Kind == KBuilding {
		// enemy buildings are only known once actually seen, so new
		// construction in old territory stays hidden until scouted
		if p.Visible[i] {
			if p.seenB == nil {
				p.seenB = map[int]bool{}
			}
			p.seenB[e.ID] = true
			return true
		}
		return p.seenB[e.ID]
	}
	return p.Visible[i]
}

// Apply validates and executes a command.
func (g *Game) Apply(c Command) error {
	if g.Over || c.Player < 0 || c.Player >= len(g.Players) || g.Players[c.Player].Defeated {
		return ErrInvalid
	}
	if !finite(c.X) || !finite(c.Y) {
		return ErrInvalid
	}
	c.X = clamp(c.X, 0.5, float64(g.W)-0.5)
	c.Y = clamp(c.Y, 0.5, float64(g.H)-0.5)
	p := g.Players[c.Player]
	switch c.Type {
	case CmdMove, CmdAMove:
		us := g.ownUnits(c.Player, c.IDs)
		if len(us) == 0 {
			return ErrNotOwner
		}
		g.formationMove(us, c.X, c.Y, c.Type == CmdAMove)
	case CmdStop:
		for _, u := range g.ownUnits(c.Player, c.IDs) {
			g.setIdle(u)
		}
	case CmdAttack, CmdGather, CmdSmart, CmdRepair:
		us := g.ownUnits(c.Player, c.IDs)
		if len(us) == 0 {
			return ErrNotOwner
		}
		t := g.Ents[c.Target]
		if t == nil || t.dead || !g.canSee(c.Player, t) {
			if c.Type == CmdSmart {
				g.formationMove(us, c.X, c.Y, false)
				return nil
			}
			return ErrInvalid
		}
		for _, u := range us {
			g.smart(u, t, c.Type)
		}
	case CmdBuild:
		d := Buildings[c.What]
		if d == nil || d.Age > p.Age {
			return ErrAge
		}
		us := g.ownUnits(c.Player, c.IDs)
		var workers []*Entity
		for _, u := range us {
			if u.U.Class == ClassWorker {
				workers = append(workers, u)
			}
		}
		if len(workers) == 0 {
			return ErrNotOwner
		}
		tx, ty := int(c.X), int(c.Y)
		if tx < 0 || ty < 0 || tx+d.Size > g.W || ty+d.Size > g.H {
			return ErrPlacement
		}
		if !p.Explored[ty*g.W+tx] || !g.footprintFree(tx, ty, d.Size, false) {
			return ErrPlacement
		}
		cost := g.buildCost(p, d)
		if !p.Res.Covers(cost) {
			return ErrCannotAfford
		}
		p.Res = p.Res.Sub(cost)
		b := g.placeBuilding(d.ID, c.Player, tx, ty, false)
		g.emit(Event{K: "place", X: b.X, Y: b.Y, O: c.Player, P: d.ID})
		for _, w := range workers {
			g.orderBuild(w, b)
		}
	case CmdTrain:
		b := g.ownBuilding(c.Player, c.Target)
		if b == nil || !b.Built {
			return ErrNotOwner
		}
		n := 1
		if c.Index > 1 && c.Index <= 5 {
			n = c.Index
		}
		for i := 0; i < n; i++ {
			if err := g.queueUnit(p, b, c.What); err != nil {
				return err
			}
		}
	case CmdResearch:
		b := g.ownBuilding(c.Player, c.Target)
		if b == nil || !b.Built {
			return ErrNotOwner
		}
		return g.queueResearch(p, b, c.What)
	case CmdCancel:
		b := g.ownBuilding(c.Player, c.Target)
		if b == nil {
			return ErrNotOwner
		}
		if !b.Built { // cancel construction: refund 75%
			p.Res = p.Res.Add(g.buildCost(p, b.B).Scale(0.75))
			g.remove(b)
			return nil
		}
		if c.Index < 0 || c.Index >= len(b.Queue) {
			return ErrInvalid
		}
		q := b.Queue[c.Index]
		p.Res = p.Res.Add(q.Paid)
		b.Queue = append(b.Queue[:c.Index], b.Queue[c.Index+1:]...)
	case CmdRally:
		b := g.ownBuilding(c.Player, c.Target)
		if b == nil {
			return ErrNotOwner
		}
		b.RallyX, b.RallyY, b.HasRally = c.X, c.Y, true
	case CmdDelete:
		n := 0
		for i, id := range c.IDs {
			if i >= MaxCommandIDs {
				break
			}
			if e := g.Ents[id]; e != nil && e.Owner == c.Player && e.Kind != KResource {
				g.kill(e, -1)
				n++
			}
		}
		if n == 0 {
			return ErrNotOwner
		}
	case CmdResign:
		g.Resign(c.Player)
	default:
		return ErrInvalid
	}
	return nil
}

func (g *Game) buildCost(p *Player, d *BuildingDef) Res {
	c := d.Cost.Scale(1 + 0.12*float64(p.Age))
	if d.ID == "house" {
		c = d.Cost.Scale(1 + 0.05*float64(p.Age))
	}
	if p.Age < 2 {
		c[Food] += c[Gold]
		c[Gold] = 0
	}
	return c
}

// BuildCost is the exported cost of a building for a player.
func (g *Game) BuildCost(player int, id string) Res {
	return g.buildCost(g.Players[player], Buildings[id])
}

func (g *Game) queueUnit(p *Player, b *Entity, what string) error {
	if len(b.Queue) >= MaxQueue {
		return ErrQueueFull
	}
	// what may be a unit id or a class
	u := Units[what]
	if u == nil {
		if id := BestUnit(what, p.Age); id != "" {
			u = Units[id]
		}
	}
	if u == nil || u.Class == ClassAnimal || u.Age > p.Age {
		return ErrAge
	}
	ok := false
	for _, cl := range b.B.Trains {
		if cl == u.Class {
			ok = true
		}
	}
	if !ok {
		return ErrInvalid
	}
	// always train the best unit in the line
	u = Units[BestUnit(u.Class, p.Age)]
	if !p.Res.Covers(u.Cost) {
		return ErrCannotAfford
	}
	p.Res = p.Res.Sub(u.Cost)
	t := u.TrainTime
	if p.ai != nil {
		t /= p.ai.bonus
	}
	b.Queue = append(b.Queue, QItem{Unit: u.ID, Time: t, Paid: u.Cost})
	return nil
}

// AgeCost returns the cost to advance from the player's current age.
func AgeCost(age int) Res {
	if age+1 > MaxAge {
		return Res{}
	}
	return Ages[age+1].AdvanceCost
}

func (g *Game) queueResearch(p *Player, b *Entity, what string) error {
	if len(b.Queue) >= MaxQueue {
		return ErrQueueFull
	}
	if what == "age" {
		if b.Type != "town_center" || p.Age >= g.Level.MaxAge {
			return ErrAge
		}
		for _, e := range g.Ents {
			if e.Owner == p.Index && e.Kind == KBuilding {
				for _, q := range e.Queue {
					if q.Age {
						return ErrQueueFull
					}
				}
			}
		}
		c := AgeCost(p.Age)
		if !p.Res.Covers(c) {
			return ErrCannotAfford
		}
		p.Res = p.Res.Sub(c)
		b.Queue = append(b.Queue, QItem{Age: true, Time: Ages[p.Age+1].AdvanceTime, Paid: c})
		return nil
	}
	t := Techs[what]
	if t == nil || t.Age > p.Age || p.Techs[what] || !b.B.Research {
		return ErrAge
	}
	for _, e := range g.Ents {
		if e.Owner == p.Index && e.Kind == KBuilding {
			for _, q := range e.Queue {
				if q.Tech == what {
					return ErrQueueFull
				}
			}
		}
	}
	if !p.Res.Covers(t.Cost) {
		return ErrCannotAfford
	}
	p.Res = p.Res.Sub(t.Cost)
	b.Queue = append(b.Queue, QItem{Tech: what, Time: t.Time, Paid: t.Cost})
	return nil
}

// smart dispatches a context-sensitive order for one unit.
func (g *Game) smart(u *Entity, t *Entity, kind string) {
	isWorker := u.U.Class == ClassWorker
	switch {
	case t.Kind == KResource && isWorker && kind != CmdAttack:
		g.orderGather(u, t)
	case t.Kind == KUnit && t.Owner == Nature && isWorker && kind != CmdAttack:
		g.orderGather(u, t) // hunt
	case t.Kind == KBuilding && t.Owner == u.Owner && isWorker && (!t.Built || t.HP < t.MaxHP || kind == CmdRepair):
		g.orderBuild(u, t)
	case t.Kind == KBuilding && t.Owner == u.Owner && isWorker && t.Type == "farm":
		g.orderGather(u, t)
	case t.Kind == KBuilding && t.Owner == u.Owner && isWorker && u.Carry > 0:
		u.Order, u.Target = OGather, 0
		u.Path = nil
	case t.Owner == Nature && t.Kind == KUnit && u.U.Attack > 0:
		u.Order, u.Target = OAttack, t.ID
		u.Path = nil
	case g.hostile(u.Owner, t.Owner) && u.U.Attack > 0:
		u.Order, u.Target = OAttack, t.ID
		u.Path = nil
	default:
		g.orderMove(u, t.X, t.Y, false)
	}
}

func (g *Game) orderMove(u *Entity, x, y float64, amove bool) {
	u.Order = OMove
	if amove {
		u.Order = OAttackMove
	}
	u.TX, u.TY = x, y
	u.Target = 0
	u.Path = nil
	u.repathAt = 0
	u.stuck = 0
}

func (g *Game) orderGather(u *Entity, t *Entity) {
	if u.U.Class != ClassWorker {
		return
	}
	if t.Kind == KUnit {
		u.Order = OAttack
		u.lastRes = "carcass"
	} else {
		u.Order = OGather
	}
	u.Target = t.ID
	u.Path = nil
	u.repathAt = 0
	u.lastX, u.lastY = t.X, t.Y
}

func (g *Game) orderBuild(u *Entity, t *Entity) {
	if u.U.Class != ClassWorker {
		return
	}
	u.Order = OBuild
	u.Target = t.ID
	u.Path = nil
	u.repathAt = 0
}

// formationMove spreads a group around the destination in a grid.
func (g *Game) formationMove(us []*Entity, x, y float64, amove bool) {
	n := len(us)
	cols := int(math.Ceil(math.Sqrt(float64(n))))
	sp := 0.8
	for i, u := range us {
		r, c := i/cols, i%cols
		ox := (float64(c) - float64(cols-1)/2) * sp
		oy := (float64(r) - float64((n-1)/cols)/2) * sp
		tx, ty := clamp(x+ox, 0.5, float64(g.W)-0.5), clamp(y+oy, 0.5, float64(g.H)-0.5)
		if !u.U.Flying && !g.walkable(int(tx), int(ty)) {
			tx, ty = x, y
		}
		g.orderMove(u, tx, ty, amove)
	}
}
