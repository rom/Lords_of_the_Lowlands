package game

import (
	"errors"
	"math"
	"math/rand"
	"sort"
)

// Simulation timing.
const (
	TickRate = 10
	DT       = 1.0 / TickRate
	PopLimit = 200
)

// Entity kinds.
const (
	KUnit = iota
	KBuilding
	KResource
)

// Unit orders.
const (
	OIdle = iota
	OMove
	OAttackMove
	OAttack
	OGather
	OBuild
	OFlee
	OWander
)

// Nature is the owner index of wild animals.
const Nature = -1

// QItem is an entry in a building's production queue.
type QItem struct {
	Unit     string  `json:"u,omitempty"`
	Tech     string  `json:"t,omitempty"`
	Age      bool    `json:"a,omitempty"`
	Progress float64 `json:"p"`
	Time     float64 `json:"-"`
	Paid     Res     `json:"-"`
}

// Entity is any unit, building or resource on the map.
type Entity struct {
	ID    int
	Kind  int
	Type  string
	Owner int
	X, Y  float64
	HP    float64
	MaxHP float64
	Age   int

	// units
	U         *UnitDef
	Order     int
	Target    int
	TX, TY    float64
	Path      []Pt
	repathAt  int
	Carry     float64
	CarryRes  int
	Cooldown  float64
	Facing    float64
	Busy      bool // performing work/attack this tick (animation)
	lastRes   string
	lastX     float64
	lastY     float64
	scanAt    int
	pathGoal  rect
	chaseFail int
	stuck     int

	// buildings
	B        *BuildingDef
	TileX    int
	TileY    int
	Built    bool
	Progress float64
	Queue    []QItem
	RallyX   float64
	RallyY   float64
	HasRally bool
	Food     float64

	// resources
	R      *ResourceDef
	Amount float64

	dead bool
}

// Size returns the footprint size of a building (1 for others).
func (e *Entity) Size() int {
	if e.B != nil {
		return e.B.Size
	}
	return 1
}

// Class returns the counter class of the entity.
func (e *Entity) Class() string {
	if e.Kind == KBuilding {
		return ClassBuilding
	}
	if e.U != nil {
		return e.U.Class
	}
	return ""
}

// Player is a participant in a match.
type Player struct {
	Index      int
	Name       string
	Team       int
	Color      int
	AI         bool
	Difficulty string
	Res        Res
	Age        int
	Techs      map[string]bool
	Pop        int
	PopCap     int
	Defeated   bool
	Won        bool
	Gathered   Res
	Kills      int
	KillValue  float64
	Lost       int
	Trained    int
	Built      int
	TechCount  int
	Visible    []bool
	Explored   []bool
	gatherMul  float64
	attackMul  float64
	armorAdd   float64
	hpMul      float64
	ai         *AI
	alertTick  int
}

// PlayerSetup describes a slot when creating a game.
type PlayerSetup struct {
	Name       string
	Team       int
	AI         bool
	Difficulty string
}

// Event is something clients may visualise or play a sound for.
type Event struct {
	K  string  `json:"k"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
	TX float64 `json:"tx,omitempty"`
	TY float64 `json:"ty,omitempty"`
	P  string  `json:"p,omitempty"`
	D  float64 `json:"d,omitempty"`
	O  int     `json:"o"`
	ID int     `json:"id,omitempty"`
}

type pendingHit struct {
	at     int
	att    int
	attOwn int
	target int
	dmg    float64
	class  string
	x, y   float64
	splash float64
}

// Game is a running match.
type Game struct {
	Level   *Level
	W, H    int
	Tiles   []byte
	Tick    int
	Players []*Player
	Ents    map[int]*Entity
	order   []int
	nextID  int
	rng     *rand.Rand
	occ     []int32
	events  []Event
	hits    []pendingHit
	Over    bool
	Winner  int // winning team, -1 none
	grid    map[int][]int
	// pathfinding scratch
	pathG      []float64
	pathFrom   []int32
	pathMark   []int32
	pathNodes  []*node
	pathClosed []int32
	pathGen    int32
}

// Errors returned by Apply.
var (
	ErrNotOwner     = errors.New("not your entity")
	ErrCannotAfford = errors.New("not enough resources")
	ErrInvalid      = errors.New("invalid command")
	ErrPlacement    = errors.New("cannot build there")
	ErrQueueFull    = errors.New("queue full")
	ErrAge          = errors.New("not available in your age")
)

// NewGame creates a match on a materialised level.
func NewGame(lv *Level, setups []PlayerSetup, seed int64) (*Game, error) {
	if len(setups) < 1 || len(setups) > MaxPlayers {
		return nil, errors.New("need 1..8 players")
	}
	l := lv.Materialize(len(setups))
	if len(l.Starts) < len(setups) {
		return nil, errors.New("level has too few start positions")
	}
	g := &Game{Level: l, W: l.Width, H: l.Height, Ents: map[int]*Entity{}, nextID: 1,
		rng: rand.New(rand.NewSource(seed)), Winner: -1}
	g.Tiles = make([]byte, g.W*g.H)
	for i := 0; i < len(g.Tiles); i++ {
		g.Tiles[i] = l.Tiles[i] - '0'
	}
	g.occ = make([]int32, g.W*g.H)
	for i, s := range setups {
		p := &Player{Index: i, Name: s.Name, Team: s.Team, Color: i, AI: s.AI, Difficulty: s.Difficulty,
			Res: l.StartRes, Age: l.StartAge, Techs: map[string]bool{}, gatherMul: 1, attackMul: 1, hpMul: 1,
			Visible: make([]bool, g.W*g.H), Explored: make([]bool, g.W*g.H)}
		if p.Res.Total() == 0 {
			p.Res = Res{200, 200, 150, 100, 0}.Scale(1 + 0.4*float64(l.StartAge))
			if l.StartAge < 2 {
				p.Res[Gold] = 0
			}
			if l.StartAge >= 10 {
				p.Res[Energy] = 150 + 30*float64(l.StartAge-10)
			}
		}
		if p.AI {
			p.ai = newAI(p.Difficulty)
		}
		g.Players = append(g.Players, p)
	}
	for _, o := range l.Objects {
		x, y := float64(o.X)+0.5, float64(o.Y)+0.5
		if _, ok := Resources[o.Kind]; ok {
			g.spawnResource(o.Kind, x, y)
		} else if u, ok := Units[o.Kind]; ok && u.Class == ClassAnimal {
			if g.walkable(o.X, o.Y) {
				g.spawnUnit(o.Kind, Nature, x, y)
			}
		}
	}
	// assign start positions, shuffled deterministically
	idx := g.rng.Perm(len(l.Starts))
	for i, p := range g.Players {
		s := l.Starts[idx[i]]
		g.setupStart(p, s)
	}
	g.updateVisibility()
	return g, nil
}

func (g *Game) setupStart(p *Player, s Point) {
	// clear blocking objects under the town centre
	for y := s.Y - 2; y <= s.Y+2; y++ {
		for x := s.X - 2; x <= s.X+2; x++ {
			if !g.inBounds(x, y) {
				continue
			}
			if id := g.occ[y*g.W+x]; id != 0 {
				g.remove(g.Ents[int(id)])
			}
			if !Passable(int(g.Tiles[y*g.W+x])) {
				g.Tiles[y*g.W+x] = TGrass
			}
		}
	}
	tc := g.placeBuilding("town_center", p.Index, s.X-1, s.Y-1, true)
	_ = tc
	n := 3
	if g.Level.StartAge >= 5 {
		n = 5
	}
	for i := 0; i < n; i++ {
		a := float64(i) / float64(n) * 2 * math.Pi
		g.spawnUnit(BestUnit(ClassWorker, p.Age), p.Index, float64(s.X)+0.5+math.Cos(a)*2.6, float64(s.Y)+0.5+math.Sin(a)*2.6)
	}
	if g.Level.StartAge >= 3 {
		g.spawnUnit(BestUnit(ClassInfantry, p.Age), p.Index, float64(s.X)+3.5, float64(s.Y)+0.5)
	}
	g.recalcPop(p)
}

func (g *Game) newEntity(kind int, typ string, owner int, x, y float64) *Entity {
	e := &Entity{ID: g.nextID, Kind: kind, Type: typ, Owner: owner, X: x, Y: y}
	g.nextID++
	g.Ents[e.ID] = e
	g.order = append(g.order, e.ID)
	return e
}

func (g *Game) spawnResource(kind string, x, y float64) *Entity {
	d := Resources[kind]
	e := g.newEntity(KResource, kind, Nature, x, y)
	e.R = d
	e.Amount = d.Amount
	e.HP, e.MaxHP = 1, 1
	if d.Block {
		tx, ty := int(x), int(y)
		if g.inBounds(tx, ty) {
			g.occ[ty*g.W+tx] = int32(e.ID)
		}
	}
	return e
}

func (g *Game) spawnUnit(typ string, owner int, x, y float64) *Entity {
	d := Units[typ]
	if d == nil {
		return nil
	}
	e := g.newEntity(KUnit, typ, owner, x, y)
	e.U = d
	mul := 1.0
	if owner >= 0 {
		mul = g.Players[owner].hpMul
		e.Age = g.Players[owner].Age
	}
	e.MaxHP = d.HP * mul
	e.HP = e.MaxHP
	e.Facing = g.rng.Float64() * 2 * math.Pi
	e.TX, e.TY = x, y
	if owner == Nature {
		e.Order = OWander
		e.scanAt = g.rng.Intn(50)
	}
	return e
}

// footprintFree reports whether a building of size n fits at (tx,ty).
func (g *Game) footprintFree(tx, ty, n int, ignoreUnits bool) bool {
	for y := ty; y < ty+n; y++ {
		for x := tx; x < tx+n; x++ {
			if !g.walkable(x, y) || g.Tiles[y*g.W+x] == TShallow {
				return false
			}
		}
	}
	if !ignoreUnits {
		for _, e := range g.Ents {
			if e.Kind == KUnit && !e.dead && (e.U == nil || !e.U.Flying) &&
				e.X >= float64(tx)-0.2 && e.X < float64(tx+n)+0.2 && e.Y >= float64(ty)-0.2 && e.Y < float64(ty+n)+0.2 {
				if e.Owner == Nature {
					return false
				}
			}
		}
	}
	return true
}

func (g *Game) placeBuilding(typ string, owner, tx, ty int, complete bool) *Entity {
	d := Buildings[typ]
	n := d.Size
	e := g.newEntity(KBuilding, typ, owner, float64(tx)+float64(n)/2, float64(ty)+float64(n)/2)
	e.B = d
	e.TileX, e.TileY = tx, ty
	p := g.Players[owner]
	e.Age = p.Age
	e.MaxHP = d.HP * (1 + 0.2*float64(p.Age)) * p.hpMul
	e.Food = d.Food * (1 + 0.25*float64(p.Age))
	if complete {
		e.Built = true
		e.Progress = 1
		e.HP = e.MaxHP
	} else {
		e.HP = math.Max(1, e.MaxHP*0.05)
	}
	if typ != "farm" {
		for y := ty; y < ty+n; y++ {
			for x := tx; x < tx+n; x++ {
				g.occ[y*g.W+x] = int32(e.ID)
			}
		}
	}
	// push units out of the footprint
	for _, u := range g.Ents {
		if u.Kind == KUnit && u.U != nil && !u.U.Flying && typ != "farm" &&
			u.X >= float64(tx) && u.X < float64(tx+n) && u.Y >= float64(ty) && u.Y < float64(ty+n) {
			if x, y, ok := g.freeSpotNear(e.X, e.Y, float64(n)/2+0.6); ok {
				u.X, u.Y = x, y
				u.Path = nil
			}
		}
	}
	return e
}

// freeSpotNear finds a walkable tile centre around (x,y) at roughly radius r.
func (g *Game) freeSpotNear(x, y, r float64) (float64, float64, bool) {
	for rr := r; rr < r+8; rr += 0.7 {
		steps := int(rr*8) + 8
		start := g.rng.Float64() * 2 * math.Pi
		for i := 0; i < steps; i++ {
			a := start + float64(i)/float64(steps)*2*math.Pi
			px, py := x+math.Cos(a)*rr, y+math.Sin(a)*rr
			if g.walkable(int(px), int(py)) {
				return math.Floor(px) + 0.5, math.Floor(py) + 0.5, true
			}
		}
	}
	return x, y, false
}

func (g *Game) remove(e *Entity) {
	if e == nil || e.dead {
		return
	}
	e.dead = true
	if e.Kind == KBuilding && e.Type != "farm" {
		for y := e.TileY; y < e.TileY+e.B.Size; y++ {
			for x := e.TileX; x < e.TileX+e.B.Size; x++ {
				if g.occ[y*g.W+x] == int32(e.ID) {
					g.occ[y*g.W+x] = 0
				}
			}
		}
	}
	if e.Kind == KResource && e.R.Block {
		tx, ty := int(e.X), int(e.Y)
		if g.inBounds(tx, ty) && g.occ[ty*g.W+tx] == int32(e.ID) {
			g.occ[ty*g.W+tx] = 0
		}
	}
	delete(g.Ents, e.ID)
}

func (g *Game) emit(ev Event) { g.events = append(g.events, ev) }

// Events returns and clears events produced since the last call.
func (g *Game) Events() []Event {
	ev := g.events
	g.events = nil
	return ev
}

func (g *Game) recalcPop(p *Player) {
	pop, cap := 0, 0
	for _, e := range g.Ents {
		if e.Owner != p.Index {
			continue
		}
		if e.Kind == KUnit {
			pop += e.U.Pop
		} else if e.Kind == KBuilding && e.Built {
			cap += e.B.Pop
		}
		if e.Kind == KBuilding {
			for _, q := range e.Queue {
				if q.Unit != "" && q.Progress > 0 {
					pop += Units[q.Unit].Pop
				}
			}
		}
	}
	if cap > PopLimit {
		cap = PopLimit
	}
	p.Pop, p.PopCap = pop, cap
}

// Allied reports whether two owners are on the same team.
func (g *Game) Allied(a, b int) bool {
	if a == b {
		return true
	}
	if a < 0 || b < 0 {
		return false
	}
	return g.Players[a].Team == g.Players[b].Team
}

func (g *Game) hostile(a, b int) bool {
	if a == Nature || b == Nature {
		return false
	}
	return !g.Allied(a, b)
}

// ---------------------------------------------------------------------------
// Simulation step

// Step advances the simulation by one tick.
func (g *Game) Step() {
	if g.Over {
		return
	}
	g.Tick++
	g.buildGrid()
	for _, p := range g.Players {
		if p.ai != nil && !p.Defeated && (g.Tick+p.Index*3)%10 == 0 {
			p.ai.think(g, p)
		}
	}
	ids := g.order[:0]
	for _, id := range g.order {
		if _, ok := g.Ents[id]; ok {
			ids = append(ids, id)
		}
	}
	g.order = ids
	for _, id := range append([]int(nil), ids...) {
		e := g.Ents[id]
		if e == nil || e.dead {
			continue
		}
		switch e.Kind {
		case KUnit:
			g.stepUnit(e)
		case KBuilding:
			g.stepBuilding(e)
		}
	}
	g.separate()
	g.resolveHits()
	if g.Tick%2 == 0 {
		g.updateVisibility()
	}
	if g.Tick%10 == 0 {
		for _, p := range g.Players {
			g.recalcPop(p)
		}
		g.checkVictory()
	}
}

func (g *Game) buildGrid() {
	g.grid = make(map[int][]int, len(g.Ents)/4+1)
	for _, e := range g.Ents {
		if e.Kind == KResource {
			continue
		}
		k := (int(e.Y)/4)*1000 + int(e.X)/4
		g.grid[k] = append(g.grid[k], e.ID)
	}
}

// nearby calls fn for every unit/building within r of (x,y).
func (g *Game) nearby(x, y, r float64, fn func(*Entity)) {
	x0, x1 := int(x-r)/4, int(x+r)/4
	y0, y1 := int(y-r)/4, int(y+r)/4
	for cy := y0; cy <= y1; cy++ {
		for cx := x0; cx <= x1; cx++ {
			for _, id := range g.grid[cy*1000+cx] {
				if e := g.Ents[id]; e != nil && !e.dead {
					if distTo(e, x, y) <= r {
						fn(e)
					}
				}
			}
		}
	}
}

// distTo is the distance from a point to the edge of an entity.
func distTo(e *Entity, x, y float64) float64 {
	if e.Kind == KBuilding {
		h := float64(e.B.Size) / 2
		dx := math.Max(math.Abs(x-e.X)-h, 0)
		dy := math.Max(math.Abs(y-e.Y)-h, 0)
		return math.Hypot(dx, dy)
	}
	if e.Kind == KResource {
		return math.Max(0, math.Hypot(x-e.X, y-e.Y)-0.4)
	}
	return math.Hypot(x-e.X, y-e.Y)
}

func (g *Game) stepBuilding(e *Entity) {
	p := g.Players[e.Owner]
	if !e.Built {
		return
	}
	if e.B.Energy > 0 {
		amt := e.B.Energy * (1 + 0.25*float64(p.Age-10)) * DT * p.gatherMul
		p.Res[Energy] += amt
		p.Gathered[Energy] += amt
	}
	if e.B.Attack > 0 && (e.Type != "town_center" || p.Age >= 1) {
		e.Cooldown -= DT
		if e.Cooldown <= 0 {
			if t := g.findEnemy(e, e.B.Range+float64(e.B.Size)/2); t != nil {
				atk := e.B.Attack * (1 + 0.3*float64(p.Age)) * p.attackMul
				g.fire(e, t, atk, projectileFor(p.Age), 0)
				e.Cooldown = e.B.Reload
			} else {
				e.Cooldown = 0.5
			}
		}
	}
	if len(e.Queue) == 0 {
		return
	}
	q := &e.Queue[0]
	if q.Unit != "" && q.Progress == 0 {
		g.recalcPop(p)
		if p.Pop+Units[q.Unit].Pop > p.PopCap {
			return // housed
		}
	}
	q.Progress += DT / q.Time
	if q.Progress < 1 {
		return
	}
	item := *q
	e.Queue = e.Queue[1:]
	switch {
	case item.Unit != "":
		x, y, _ := g.freeSpotNear(e.X, e.Y, float64(e.B.Size)/2+0.7)
		u := g.spawnUnit(item.Unit, p.Index, x, y)
		p.Trained++
		g.emit(Event{K: "trained", X: x, Y: y, O: p.Index, P: item.Unit})
		if e.HasRally {
			if t := g.entityAt(e.RallyX, e.RallyY); t != nil && t.Kind == KResource && u.U.Class == ClassWorker {
				g.orderGather(u, t)
			} else {
				g.orderMove(u, e.RallyX, e.RallyY, false)
			}
		} else if u.U.Class == ClassWorker {
			if r := g.nearestResource(u.X, u.Y, -1, 12, nil); r != nil {
				g.orderGather(u, r)
			}
		}
	case item.Age:
		if p.Age < g.Level.MaxAge {
			p.Age++
			g.emit(Event{K: "age", X: e.X, Y: e.Y, O: p.Index, D: float64(p.Age)})
		}
	case item.Tech != "":
		g.applyTech(p, item.Tech)
		g.emit(Event{K: "tech", X: e.X, Y: e.Y, O: p.Index, P: item.Tech})
	}
}

func (g *Game) applyTech(p *Player, id string) {
	t := Techs[id]
	if t == nil || p.Techs[id] {
		return
	}
	p.Techs[id] = true
	p.TechCount++
	switch t.Kind {
	case "gather":
		p.gatherMul += t.Amount
	case "attack":
		p.attackMul += t.Amount
	case "armor":
		p.armorAdd += t.Amount
	case "hp":
		old := p.hpMul
		p.hpMul += t.Amount
		f := p.hpMul / old
		for _, e := range g.Ents {
			if e.Owner == p.Index && e.Kind != KResource {
				e.MaxHP *= f
				e.HP *= f
			}
		}
	}
}

func projectileFor(age int) string {
	switch {
	case age >= 15:
		return "plasma"
	case age >= 14:
		return "laser"
	case age >= 11:
		return "bullet"
	case age >= 8:
		return "cannonball"
	case age >= 1:
		return "arrow"
	}
	return "stone"
}

// findEnemy returns the closest hostile entity within r of e.
func (g *Game) findEnemy(e *Entity, r float64) *Entity {
	var best *Entity
	bd := 1e9
	g.nearby(e.X, e.Y, r+2, func(o *Entity) {
		if !g.hostile(e.Owner, o.Owner) || o.dead {
			return
		}
		if o.Kind == KBuilding && !o.Built && o.Progress <= 0 {
			// unbuilt foundations are low priority
		}
		d := distTo(o, e.X, e.Y)
		if e.Kind == KBuilding {
			d = math.Hypot(o.X-e.X, o.Y-e.Y) - float64(e.B.Size)/2
		}
		if d > r {
			return
		}
		// prefer units over buildings
		if o.Kind == KBuilding {
			d += 6
		}
		if o.U != nil && o.U.Class == ClassWorker {
			d += 1.5
		}
		if d < bd {
			bd, best = d, o
		}
	})
	return best
}

func (g *Game) entityAt(x, y float64) *Entity {
	tx, ty := int(x), int(y)
	if g.inBounds(tx, ty) {
		if id := g.occ[ty*g.W+tx]; id != 0 {
			return g.Ents[int(id)]
		}
	}
	return nil
}

func (g *Game) nearestResource(x, y float64, res int, maxD float64, exclude *Entity) *Entity {
	var best *Entity
	bd := maxD
	typ := ""
	if exclude != nil {
		typ = exclude.Type
	}
	for _, e := range g.Ents {
		if e.Kind != KResource || e == exclude || e.dead || e.Amount <= 0 {
			continue
		}
		if res >= 0 && e.R.Res != res {
			continue
		}
		if e.R.Block && !g.goalOpen(goalFor(e)) {
			continue
		}
		if typ != "" && e.Type != typ && !(typ == "carcass" || e.Type == "carcass") {
			continue
		}
		d := math.Hypot(e.X-x, e.Y-y)
		if d < bd {
			bd, best = d, e
		}
	}
	return best
}

func (g *Game) nearestDropoff(u *Entity, res int) *Entity {
	var best *Entity
	bd := 1e9
	for _, e := range g.Ents {
		if e.Kind != KBuilding || e.Owner != u.Owner || !e.Built {
			continue
		}
		ok := false
		for _, r := range e.B.Dropoff {
			if r == res {
				ok = true
			}
		}
		if !ok {
			continue
		}
		d := distTo(e, u.X, u.Y)
		if d < bd {
			bd, best = d, e
		}
	}
	return best
}

// goalFor returns the path goal rectangle adjacent to an entity.
func goalFor(e *Entity) rect {
	if e.Kind == KBuilding {
		if e.Type == "farm" {
			return rect{e.TileX, e.TileY, e.TileX + 2, e.TileY + 2}
		}
		return rect{e.TileX - 1, e.TileY - 1, e.TileX + e.B.Size, e.TileY + e.B.Size}
	}
	tx, ty := int(e.X), int(e.Y)
	if e.Kind == KResource && e.R.Block {
		return rect{tx - 1, ty - 1, tx + 1, ty + 1}
	}
	return rect{tx, ty, tx, ty}
}

// moveTowards advances along the current path; returns true when arrived
// (or when the goal proved unreachable and the unit got as close as it can).
func (g *Game) moveTowards(u *Entity, goal rect, gx, gy float64, speedMul float64) bool {
	sp := u.U.Speed * DT * speedMul
	if u.Owner >= 0 && u.U.Class == ClassWorker {
		sp *= 1 + 0.03*float64(g.Players[u.Owner].TechCount)
	}
	point := goal.x0 == goal.x1 && goal.y0 == goal.y1
	if u.U.Flying || (point && goal.contains(int(u.X), int(u.Y))) {
		dx, dy := gx-u.X, gy-u.Y
		d := math.Hypot(dx, dy)
		if d <= sp {
			u.X, u.Y = gx, gy
			u.Path = nil
			return true
		}
		nx, ny := u.X+dx/d*sp, u.Y+dy/d*sp
		if !u.U.Flying && !g.walkable(int(nx), int(ny)) {
			return true
		}
		u.X, u.Y = nx, ny
		u.Facing = math.Atan2(dy, dx)
		return false
	}
	if goal.contains(int(u.X), int(u.Y)) && len(u.Path) == 0 {
		u.Path = nil
		return true
	}
	if u.Path == nil || u.pathGoal != goal || (len(u.Path) == 0 && g.Tick >= u.repathAt) {
		u.Path = g.findPath(u.X, u.Y, goal)
		u.pathGoal = goal
		u.repathAt = g.Tick + 8 + g.rng.Intn(8)
		if len(u.Path) == 0 {
			u.Path = []Pt{}
			u.stuck++
			u.repathAt = g.Tick + 15
			return u.stuck > 3 || goal.dist(int(u.X), int(u.Y)) <= 1
		}
		if point {
			u.Path[len(u.Path)-1] = Pt{gx, gy}
		}
	}
	for sp > 0 && len(u.Path) > 0 {
		wp := u.Path[0]
		dx, dy := wp.X-u.X, wp.Y-u.Y
		d := math.Hypot(dx, dy)
		if d <= sp {
			u.X, u.Y = wp.X, wp.Y
			u.Path = u.Path[1:]
			sp -= d
			continue
		}
		nx, ny := u.X+dx/d*sp, u.Y+dy/d*sp
		if !g.walkable(int(nx), int(ny)) && g.walkable(int(u.X), int(u.Y)) {
			// blocked by a new building: repath next tick
			u.Path = nil
			u.stuck++
			return u.stuck > 30
		}
		u.X, u.Y = nx, ny
		u.Facing = math.Atan2(dy, dx)
		sp = 0
	}
	if len(u.Path) == 0 {
		if goal.contains(int(u.X), int(u.Y)) {
			u.stuck = 0
			u.Path = nil
			return true
		}
		u.stuck++
		if u.stuck > 3 {
			u.Path = nil
			return true // as close as we can get
		}
	}
	return false
}

// approach moves u toward entity t until within work reach. Units that
// cannot reach their target for a while give it up.
func (g *Game) approach(u, t *Entity) {
	if u.stuck > 12 {
		u.stuck = 0
		u.Path = nil
		if t.Kind == KResource {
			if nr := g.nearestResource(u.X, u.Y, t.R.Res, 12, t); nr != nil && math.Hypot(nr.X-t.X, nr.Y-t.Y) > 0.5 {
				u.Target = nr.ID
				return
			}
		}
		if u.Carry > 0 && t.Kind == KBuilding && t.Owner == u.Owner && len(t.B.Dropoff) > 0 {
			u.Carry = 0 // cannot deliver; drop the load
		}
		g.setIdle(u)
		return
	}
	if g.moveTowards(u, goalFor(t), t.X, t.Y, 1) {
		dx, dy := t.X-u.X, t.Y-u.Y
		d := math.Hypot(dx, dy)
		if d > 1e-6 {
			sp := u.U.Speed * DT
			nx, ny := u.X+dx/d*sp, u.Y+dy/d*sp
			if g.walkable(int(nx), int(ny)) || int(nx) == int(u.X) && int(ny) == int(u.Y) {
				u.X, u.Y = nx, ny
			}
		}
	}
}

// reach is the work distance from a unit to a resource or building edge.
const reach = 1.25

func (g *Game) setIdle(u *Entity) {
	u.Order = OIdle
	u.Path = nil
	u.Target = 0
	u.Busy = false
	u.stuck = 0
}

func (g *Game) stepUnit(u *Entity) {
	u.Busy = false
	if u.Cooldown > 0 {
		u.Cooldown -= DT
	}
	switch u.Order {
	case OIdle:
		if u.U.Class != ClassWorker && u.U.Attack > 0 && (g.Tick+u.ID)%5 == 0 {
			if t := g.findEnemy(u, u.U.Sight); t != nil {
				u.Order, u.Target = OAttack, t.ID
				u.Path = nil
				u.TX, u.TY = u.X, u.Y // return here afterwards is not needed
			}
		}
	case OMove:
		if g.moveTowards(u, rect{int(u.TX), int(u.TY), int(u.TX), int(u.TY)}, u.TX, u.TY, 1) {
			g.setIdle(u)
		}
	case OAttackMove:
		if (g.Tick+u.ID)%4 == 0 {
			if t := g.findEnemy(u, u.U.Sight); t != nil {
				u.Target = t.ID
				g.attackStep(u, t, true)
				return
			}
		}
		if u.Target != 0 {
			if t := g.Ents[u.Target]; t != nil && !t.dead {
				g.attackStep(u, t, true)
				return
			}
			u.Target = 0
			u.Path = nil
		}
		if g.moveTowards(u, rect{int(u.TX), int(u.TY), int(u.TX), int(u.TY)}, u.TX, u.TY, 1) {
			g.setIdle(u)
		}
	case OAttack:
		t := g.Ents[u.Target]
		if t == nil || t.dead {
			// carcass hunting continuation
			if u.U.Class == ClassWorker && u.lastRes == "carcass" {
				if r := g.nearestResource(u.lastX, u.lastY, Food, 3, nil); r != nil {
					g.orderGather(u, r)
					return
				}
			}
			if u.Owner == Nature {
				u.Order = OWander
				return
			}
			if nt := g.findEnemy(u, u.U.Sight); nt != nil && u.U.Class != ClassWorker {
				u.Target = nt.ID
				u.Path = nil
				return
			}
			g.setIdle(u)
			return
		}
		g.attackStep(u, t, false)
	case OGather:
		g.gatherStep(u)
	case OBuild:
		g.buildStep(u)
	case OFlee:
		if g.moveTowards(u, rect{int(u.TX), int(u.TY), int(u.TX), int(u.TY)}, u.TX, u.TY, 1.3) {
			u.Order = OWander
		}
	case OWander:
		if u.Owner != Nature {
			g.setIdle(u)
			return
		}
		if g.Tick >= u.scanAt {
			u.scanAt = g.Tick + 40 + g.rng.Intn(80)
			x := u.X + (g.rng.Float64()-0.5)*6
			y := u.Y + (g.rng.Float64()-0.5)*6
			if g.walkable(int(x), int(y)) {
				u.TX, u.TY = x, y
				u.Path = nil
			}
		}
		if math.Hypot(u.TX-u.X, u.TY-u.Y) > 0.2 {
			g.moveTowards(u, rect{int(u.TX), int(u.TY), int(u.TX), int(u.TY)}, u.TX, u.TY, 0.4)
		}
	}
}

func (g *Game) attackStep(u *Entity, t *Entity, amove bool) {
	rng := u.U.Range
	d := distTo(t, u.X, u.Y)
	if u.U.MinRange > 0 && d < u.U.MinRange && t.Kind == KUnit {
		// too close: step back
		dx, dy := u.X-t.X, u.Y-t.Y
		l := math.Hypot(dx, dy) + 1e-6
		nx, ny := u.X+dx/l*u.U.Speed*DT, u.Y+dy/l*u.U.Speed*DT
		if u.U.Flying || g.walkable(int(nx), int(ny)) {
			u.X, u.Y = nx, ny
		}
		return
	}
	if d > rng {
		if u.Owner >= 0 && !amove && d > u.U.Sight*3 && t.Kind == KUnit && u.U.Class != ClassWorker {
			// lost track; only chase visible targets
			if t.Owner >= 0 && !g.Players[u.Owner].Visible[int(t.Y)*g.W+int(t.X)] {
				g.setIdle(u)
				return
			}
		}
		if !u.U.Flying && d < 10 && g.lineClear(u.X, u.Y, t.X, t.Y) {
			// direct chase without pathfinding
			l := math.Hypot(t.X-u.X, t.Y-u.Y) + 1e-6
			sp := u.U.Speed * DT
			u.X += (t.X - u.X) / l * sp
			u.Y += (t.Y - u.Y) / l * sp
			u.Facing = math.Atan2(t.Y-u.Y, t.X-u.X)
			u.Path = nil
			return
		}
		if t.Kind == KUnit && len(u.Path) > 0 && g.Tick >= u.repathAt {
			last := u.Path[len(u.Path)-1]
			if math.Hypot(last.X-t.X, last.Y-t.Y) > 2 {
				u.Path = nil // target moved; refresh path
			}
		}
		if g.moveTowards(u, goalFor(t), t.X, t.Y, 1) && distTo(t, u.X, u.Y) > rng {
			u.chaseFail++
			if u.chaseFail > 25 {
				u.chaseFail = 0
				if amove {
					u.Target = 0
				} else {
					g.setIdle(u)
				}
			}
		}
		return
	}
	u.Path = nil
	u.chaseFail = 0
	u.Busy = true
	u.Facing = math.Atan2(t.Y-u.Y, t.X-u.X)
	if u.Cooldown > 0 {
		return
	}
	u.Cooldown = u.U.Reload
	atk := u.U.Attack
	if u.Owner >= 0 {
		pl := g.Players[u.Owner]
		if u.U.Class != ClassWorker {
			atk *= pl.attackMul
		} else {
			atk *= 1 + 0.25*float64(pl.Age)
		}
	}
	g.fire(u, t, atk, u.U.Projectile, u.U.Splash)
}

// fire launches an attack from a against t. Melee hits apply next tick.
func (g *Game) fire(a, t *Entity, atk float64, proj string, splash float64) {
	class := a.Class()
	if a.Kind == KBuilding {
		class = ClassRanged
	}
	dist := math.Hypot(t.X-a.X, t.Y-a.Y)
	delay := 1
	if proj != "" {
		speed := 9.0
		switch proj {
		case "bullet", "laser", "rail", "ion":
			speed = 30
		case "boulder", "shell", "cannonball":
			speed = 8
		case "plasma", "missile", "rocket":
			speed = 14
		}
		delay = 1 + int(dist/speed*TickRate)
		g.emit(Event{K: "shot", X: a.X, Y: a.Y, TX: t.X, TY: t.Y, P: proj, D: float64(delay) / TickRate, O: a.Owner})
	} else {
		g.emit(Event{K: "melee", X: t.X, Y: t.Y, O: a.Owner, P: a.Type})
	}
	g.hits = append(g.hits, pendingHit{at: g.Tick + delay, att: a.ID, attOwn: a.Owner, target: t.ID, dmg: atk, class: class, x: t.X, y: t.Y, splash: splash})
}

func (g *Game) damage(t *Entity, h pendingHit, mul float64) {
	if t == nil || t.dead || t.Kind == KResource {
		return
	}
	dmg := h.dmg * Counter(h.class, t.Class()) * mul
	armor := 0.0
	if t.U != nil {
		armor = t.U.Armor
	}
	if t.Owner >= 0 && t.Kind == KUnit && t.U.Class != ClassWorker {
		armor += g.Players[t.Owner].armorAdd
	}
	if t.Kind == KBuilding {
		armor = 0.5
		if !t.Built {
			armor = 0.2
		}
	}
	armor = math.Min(armor, 0.8)
	dmg *= 1 - armor
	if dmg < 0.5 {
		dmg = 0.5
	}
	t.HP -= dmg
	if t.Owner >= 0 && g.Tick-g.Players[t.Owner].alertTick > 100 && h.attOwn >= 0 {
		g.Players[t.Owner].alertTick = g.Tick
		g.emit(Event{K: "alert", X: t.X, Y: t.Y, O: t.Owner})
	}
	// retaliation
	if t.Kind == KUnit && t.HP > 0 {
		if t.Owner == Nature {
			if t.U.Aggressive {
				t.Order, t.Target = OAttack, h.att
			} else if a := g.Ents[h.att]; a != nil {
				dx, dy := t.X-a.X, t.Y-a.Y
				l := math.Hypot(dx, dy) + 1e-6
				t.Order = OFlee
				t.TX, t.TY = clamp(t.X+dx/l*6, 1, float64(g.W-1)), clamp(t.Y+dy/l*6, 1, float64(g.H-1))
				t.Path = nil
			}
		} else if t.Order == OIdle && t.U.Attack > 0 && t.U.Class != ClassWorker {
			if a := g.Ents[h.att]; a != nil {
				t.Order, t.Target = OAttack, a.ID
			}
		}
	}
	if t.HP <= 0 {
		g.kill(t, h.attOwn)
	}
}

func clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }

func (g *Game) resolveHits() {
	keep := g.hits[:0]
	var due []pendingHit
	for _, h := range g.hits {
		if h.at <= g.Tick {
			due = append(due, h)
		} else {
			keep = append(keep, h)
		}
	}
	g.hits = keep
	for _, h := range due {
		t := g.Ents[h.target]
		if h.splash > 0 {
			g.emit(Event{K: "boom", X: h.x, Y: h.y, D: h.splash, O: h.attOwn})
			var victims []*Entity
			g.nearby(h.x, h.y, h.splash, func(o *Entity) {
				if o != t && g.hostile(h.attOwn, o.Owner) {
					victims = append(victims, o)
				}
			})
			for _, v := range victims {
				g.damage(v, h, 0.5)
			}
		}
		if t != nil && !t.dead {
			g.damage(t, h, 1)
		}
	}
}

func unitValue(e *Entity) float64 {
	if e.U != nil {
		return e.U.Cost.Total()
	}
	if e.B != nil {
		return e.B.Cost.Total()
	}
	return 0
}

func (g *Game) kill(t *Entity, by int) {
	if t.dead {
		return
	}
	if by >= 0 && by != t.Owner {
		g.Players[by].Kills++
		g.Players[by].KillValue += unitValue(t)
	}
	if t.Owner >= 0 {
		g.Players[t.Owner].Lost++
	}
	k := "death"
	if t.Kind == KBuilding {
		k = "collapse"
	}
	g.emit(Event{K: k, X: t.X, Y: t.Y, O: t.Owner, P: t.Type, D: float64(t.Size())})
	g.remove(t)
	if t.Kind == KUnit && t.U.Class == ClassAnimal {
		c := g.spawnResource("carcass", t.X, t.Y)
		c.Amount = t.U.Food
		c.Type = "carcass"
		// hunters switch to gathering the carcass
		for _, e := range g.Ents {
			if e.Kind == KUnit && e.Order == OAttack && e.Target == t.ID && e.U.Class == ClassWorker {
				g.orderGather(e, c)
			}
		}
	}
	if t.Kind == KBuilding && t.Owner >= 0 {
		g.recalcPop(g.Players[t.Owner])
	}
}

// ---------------------------------------------------------------------------
// Economy

func (g *Game) gatherRate(u *Entity, r *ResourceDef) float64 {
	base := 0.7 * r.Rate
	if u.Owner >= 0 {
		p := g.Players[u.Owner]
		base *= p.gatherMul * (1 + 0.06*float64(p.Age))
		if p.ai != nil {
			base *= p.ai.bonus
		}
	}
	return base
}

func carryCap(u *Entity) float64 {
	return 10 + float64(u.Age)
}

func (g *Game) gatherStep(u *Entity) {
	t := g.Ents[u.Target]
	if u.Carry >= carryCap(u) || (u.Carry > 0 && (t == nil || t.dead)) {
		g.returnStep(u)
		return
	}
	if t == nil || t.dead || (t.Kind == KResource && t.Amount <= 0) || (t.Kind == KBuilding && t.Food <= 0) {
		// find another resource of the same kind nearby
		var nr *Entity
		if t != nil && t.Kind == KResource {
			nr = g.nearestResource(u.X, u.Y, t.R.Res, 10, t)
		} else if u.lastRes != "" && u.lastRes != "farm" {
			nr = g.nearestResource(u.lastX, u.lastY, Resources[u.lastRes].Res, 10, nil)
		}
		if nr != nil {
			g.orderGather(u, nr)
			return
		}
		if u.Carry > 0 {
			g.returnStep(u)
			return
		}
		g.setIdle(u)
		return
	}
	if t.Kind == KUnit { // hunting
		u.Order = OAttack
		return
	}
	if distTo(t, u.X, u.Y) > reach {
		g.approach(u, t)
		return
	}
	u.Path = nil
	u.Busy = true
	u.Facing = math.Atan2(t.Y-u.Y, t.X-u.X)
	if t.Kind == KBuilding { // farm
		if !t.Built {
			g.orderBuild(u, t)
			return
		}
		rate := g.gatherRate(u, &ResourceDef{Rate: 0.8})
		amt := math.Min(rate*DT, t.Food)
		t.Food -= amt
		if u.CarryRes != Food {
			u.Carry = 0
		}
		u.CarryRes = Food
		u.Carry += amt
		u.lastRes = "farm"
		if t.Food <= 0 {
			g.emit(Event{K: "depleted", X: t.X, Y: t.Y, O: t.Owner})
			g.remove(t)
		}
		return
	}
	rate := g.gatherRate(u, t.R)
	amt := math.Min(rate*DT, t.Amount)
	t.Amount -= amt
	if u.CarryRes != t.R.Res {
		u.Carry = 0
	}
	u.CarryRes = t.R.Res
	u.Carry += amt
	u.lastRes, u.lastX, u.lastY = t.Type, t.X, t.Y
	if g.Tick%12 == u.ID%12 {
		g.emit(Event{K: "work", X: t.X, Y: t.Y, O: u.Owner, P: t.Type})
	}
	if t.Amount <= 0.01 {
		g.remove(t)
	}
}

func (g *Game) returnStep(u *Entity) {
	d := g.nearestDropoff(u, u.CarryRes)
	if d == nil {
		u.Busy = false
		return // wait for a drop-off
	}
	if distTo(d, u.X, u.Y) > reach {
		g.approach(u, d)
		return
	}
	p := g.Players[u.Owner]
	p.Res[u.CarryRes] += u.Carry
	p.Gathered[u.CarryRes] += u.Carry
	u.Carry = 0
	u.Path = nil
	if t := g.Ents[u.Target]; t == nil || t.dead {
		if u.lastRes == "farm" {
			g.setIdle(u)
		}
	}
}

func (g *Game) buildStep(u *Entity) {
	t := g.Ents[u.Target]
	if t == nil || t.dead || t.Kind != KBuilding || (t.Built && t.HP >= t.MaxHP) {
		if t != nil && !t.dead && t.Built {
			g.afterBuild(u, t)
			return
		}
		g.setIdle(u)
		return
	}
	if distTo(t, u.X, u.Y) > reach {
		g.approach(u, t)
		return
	}
	u.Path = nil
	u.Busy = true
	u.Facing = math.Atan2(t.Y-u.Y, t.X-u.X)
	if t.Built { // repair
		t.HP = math.Min(t.MaxHP, t.HP+t.MaxHP/t.B.BuildTime*DT*0.5)
		return
	}
	step := DT / t.B.BuildTime
	if u.Owner >= 0 && g.Players[u.Owner].ai != nil {
		step *= g.Players[u.Owner].ai.bonus
	}
	t.Progress += step
	t.HP = math.Min(t.MaxHP, t.HP+t.MaxHP*step)
	if g.Tick%8 == u.ID%8 {
		g.emit(Event{K: "hammer", X: t.X, Y: t.Y, O: u.Owner})
	}
	if t.Progress >= 1 {
		t.Progress = 1
		t.Built = true
		p := g.Players[t.Owner]
		p.Built++
		g.recalcPop(p)
		g.emit(Event{K: "built", X: t.X, Y: t.Y, O: t.Owner, P: t.Type})
		g.afterBuild(u, t)
	}
}

// afterBuild decides what a worker does after finishing construction.
func (g *Game) afterBuild(u *Entity, t *Entity) {
	if t.Type == "farm" {
		g.orderGather(u, t)
		return
	}
	// help on other foundations nearby
	for _, e := range g.Ents {
		if e.Kind == KBuilding && e.Owner == u.Owner && !e.Built && distTo(e, u.X, u.Y) < 6 {
			g.orderBuild(u, e)
			return
		}
	}
	if len(t.B.Dropoff) > 0 && t.Type != "town_center" {
		for _, res := range t.B.Dropoff {
			if r := g.nearestResource(t.X, t.Y, res, 7, nil); r != nil {
				g.orderGather(u, r)
				return
			}
		}
	}
	g.setIdle(u)
}

// separate pushes overlapping ground units apart.
func (g *Game) separate() {
	for _, cell := range g.grid {
		for i := 0; i < len(cell); i++ {
			a := g.Ents[cell[i]]
			if a == nil || a.Kind != KUnit || a.dead {
				continue
			}
			for j := i + 1; j < len(cell); j++ {
				b := g.Ents[cell[j]]
				if b == nil || b.Kind != KUnit || b.dead || a.U.Flying != b.U.Flying {
					continue
				}
				dx, dy := b.X-a.X, b.Y-a.Y
				d := math.Hypot(dx, dy)
				min := 0.45
				if a.U.Pop > 1 || b.U.Pop > 1 {
					min = 0.7
				}
				if d < min && d > 1e-4 {
					push := (min - d) / 2 * 0.5
					ax, ay := a.X-dx/d*push, a.Y-dy/d*push
					bx, by := b.X+dx/d*push, b.Y+dy/d*push
					if a.U.Flying || g.walkable(int(ax), int(ay)) {
						if !a.Busy {
							a.X, a.Y = ax, ay
						}
					}
					if b.U.Flying || g.walkable(int(bx), int(by)) {
						if !b.Busy {
							b.X, b.Y = bx, by
						}
					}
				} else if d <= 1e-4 {
					b.X += 0.05 * (g.rng.Float64() - 0.5)
					b.Y += 0.05 * (g.rng.Float64() - 0.5)
				}
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Visibility & victory

func (g *Game) updateVisibility() {
	for _, p := range g.Players {
		for i := range p.Visible {
			p.Visible[i] = false
		}
	}
	teamVis := map[int][]bool{}
	for _, p := range g.Players {
		if _, ok := teamVis[p.Team]; !ok {
			teamVis[p.Team] = make([]bool, g.W*g.H)
		}
	}
	for _, e := range g.Ents {
		if e.Owner < 0 || e.Kind == KResource {
			continue
		}
		var sight float64
		if e.U != nil {
			sight = e.U.Sight
		} else {
			sight = e.B.Sight + float64(e.B.Size)/2
			if !e.Built {
				sight = 2
			}
		}
		vis := teamVis[g.Players[e.Owner].Team]
		r := int(sight)
		cx, cy := int(e.X), int(e.Y)
		r2 := sight * sight
		for y := cy - r; y <= cy+r; y++ {
			if y < 0 || y >= g.H {
				continue
			}
			for x := cx - r; x <= cx+r; x++ {
				if x < 0 || x >= g.W {
					continue
				}
				dx, dy := float64(x)+0.5-e.X, float64(y)+0.5-e.Y
				if dx*dx+dy*dy <= r2 {
					vis[y*g.W+x] = true
				}
			}
		}
	}
	for _, p := range g.Players {
		v := teamVis[p.Team]
		copy(p.Visible, v)
		for i, b := range v {
			if b {
				p.Explored[i] = true
			}
		}
	}
}

func (g *Game) alive(p *Player) bool {
	for _, e := range g.Ents {
		if e.Owner == p.Index && (e.Kind == KUnit || (e.Kind == KBuilding && e.Type != "farm" && e.Type != "house")) {
			return true
		}
	}
	return false
}

func (g *Game) checkVictory() {
	teams := map[int]bool{}
	for _, p := range g.Players {
		if !p.Defeated && !g.alive(p) {
			p.Defeated = true
			g.emit(Event{K: "defeated", O: p.Index})
			for _, e := range g.Ents {
				if e.Owner == p.Index {
					g.remove(e)
				}
			}
		}
		if !p.Defeated {
			teams[p.Team] = true
		}
	}
	obj := g.Level.Objective
	switch obj.Type {
	case ObjSurvive:
		if float64(g.Tick)/TickRate/60 >= obj.Minutes {
			// humans' teams that survived win
			for _, p := range g.Players {
				if !p.Defeated && !p.AI {
					g.finish(p.Team)
					return
				}
			}
		}
	case ObjAdvance:
		for _, p := range g.Players {
			if !p.Defeated && p.Age >= g.Level.MaxAge {
				g.finish(p.Team)
				return
			}
		}
	}
	if len(teams) <= 1 {
		w := -1
		for t := range teams {
			w = t
		}
		g.finish(w)
	}
}

func (g *Game) finish(team int) {
	g.Over = true
	g.Winner = team
	for _, p := range g.Players {
		p.Won = team >= 0 && p.Team == team && !p.Defeated
	}
	g.emit(Event{K: "gameover", D: float64(team)})
}

// Resign marks a player as defeated.
func (g *Game) Resign(player int) {
	if player < 0 || player >= len(g.Players) || g.Players[player].Defeated {
		return
	}
	for _, e := range g.Ents {
		if e.Owner == player {
			g.remove(e)
		}
	}
	g.checkVictory()
}

// Score computes a player's score.
func (g *Game) Score(p *Player) int {
	s := p.Gathered.Total()/10 + p.KillValue/5 + float64(p.TechCount)*60 + float64(p.Age-g.Level.StartAge)*400 + float64(p.Built)*15 + float64(p.Trained)*5
	if p.Won {
		s += 2000
		mins := float64(g.Tick) / TickRate / 60
		s += math.Max(0, 1500-mins*30)
	}
	return int(s)
}

// Result summarises a player's game.
type Result struct {
	Player   int     `json:"player"`
	Name     string  `json:"name"`
	Team     int     `json:"team"`
	AI       bool    `json:"ai"`
	Won      bool    `json:"won"`
	Score    int     `json:"score"`
	Age      int     `json:"age"`
	Kills    int     `json:"kills"`
	Lost     int     `json:"lost"`
	Gathered float64 `json:"gathered"`
	Techs    int     `json:"techs"`
}

// Results returns per-player results sorted by score.
func (g *Game) Results() []Result {
	var out []Result
	for _, p := range g.Players {
		out = append(out, Result{p.Index, p.Name, p.Team, p.AI, p.Won, g.Score(p), p.Age, p.Kills, p.Lost, math.Round(p.Gathered.Total()), p.TechCount})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}
