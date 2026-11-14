package game

import (
	"encoding/json"
	"errors"
	"math"
	"math/rand"
	"sort"
)

// SaveVersion is bumped when the save format changes incompatibly.
const SaveVersion = 1

// SaveState is a complete, serialisable snapshot of a running match. Saves
// are stored only on the server (never uploaded by clients), so a player
// cannot edit their inventory between sessions.
type SaveState struct {
	Version int          `json:"version"`
	Level   *Level       `json:"level"`
	Tick    int          `json:"tick"`
	NextID  int          `json:"nextId"`
	Players []SavePlayer `json:"players"`
	Ents    []SaveEnt    `json:"ents"`
}

// SavePlayer holds one player's state.
type SavePlayer struct {
	Name       string     `json:"name"`
	Team       int        `json:"team"`
	Color      int        `json:"color"`
	AI         bool       `json:"ai"`
	Difficulty string     `json:"difficulty"`
	Res        Res        `json:"res"`
	Age        int        `json:"age"`
	Techs      []string   `json:"techs"`
	Defeated   bool       `json:"defeated"`
	Gathered   Res        `json:"gathered"`
	Kills      int        `json:"kills"`
	KillValue  float64    `json:"killValue"`
	Lost       int        `json:"lost"`
	Trained    int        `json:"trained"`
	Built      int        `json:"built"`
	Explored   string     `json:"explored"`
	SeenB      []int      `json:"seenB,omitempty"`
	Mods       [8]float64 `json:"mods"`
	AIState    *SaveAI    `json:"aiState,omitempty"`
}

// SaveAI holds the computer opponent's memory.
type SaveAI struct {
	AttackSize int  `json:"attackSize"`
	NextAttack int  `json:"nextAttack"`
	Attacking  bool `json:"attacking"`
	WaveSize   int  `json:"waveSize"`
	Thinks     int  `json:"thinks"`
	StageUntil int  `json:"stageUntil"`
}

// SaveQItem is a production queue entry.
type SaveQItem struct {
	Unit     string  `json:"u,omitempty"`
	Tech     string  `json:"t,omitempty"`
	Age      bool    `json:"a,omitempty"`
	Progress float64 `json:"p"`
	Time     float64 `json:"time"`
	Paid     Res     `json:"paid"`
}

// SaveEnt holds one entity.
type SaveEnt struct {
	ID       int         `json:"id"`
	Kind     int         `json:"k"`
	Type     string      `json:"t"`
	Owner    int         `json:"o"`
	X        float64     `json:"x"`
	Y        float64     `json:"y"`
	HP       float64     `json:"hp"`
	MaxHP    float64     `json:"maxHp"`
	Age      int         `json:"age,omitempty"`
	Order    int         `json:"order,omitempty"`
	Target   int         `json:"target,omitempty"`
	TX       float64     `json:"tx,omitempty"`
	TY       float64     `json:"ty,omitempty"`
	Carry    float64     `json:"carry,omitempty"`
	CarryRes int         `json:"carryRes,omitempty"`
	Facing   float64     `json:"facing,omitempty"`
	LastRes  string      `json:"lastRes,omitempty"`
	LastX    float64     `json:"lastX,omitempty"`
	LastY    float64     `json:"lastY,omitempty"`
	TileX    int         `json:"tileX,omitempty"`
	TileY    int         `json:"tileY,omitempty"`
	Built    bool        `json:"built,omitempty"`
	Progress float64     `json:"progress,omitempty"`
	Queue    []SaveQItem `json:"queue,omitempty"`
	RallyX   float64     `json:"rallyX,omitempty"`
	RallyY   float64     `json:"rallyY,omitempty"`
	HasRally bool        `json:"hasRally,omitempty"`
	Food     float64     `json:"food,omitempty"`
	Amount   float64     `json:"amount,omitempty"`
}

// Save captures the complete match state.
func (g *Game) Save() *SaveState {
	lv := *g.Level
	b := make([]byte, len(g.Tiles))
	for i, t := range g.Tiles {
		b[i] = '0' + t
	}
	lv.Tiles, lv.Objects, lv.Gen = string(b), nil, nil
	s := &SaveState{Version: SaveVersion, Level: &lv, Tick: g.Tick, NextID: g.nextID}
	for _, p := range g.Players {
		sp := SavePlayer{Name: p.Name, Team: p.Team, Color: p.Color, AI: p.AI, Difficulty: p.Difficulty, Res: p.Res, Age: p.Age,
			Defeated: p.Defeated, Gathered: p.Gathered, Kills: p.Kills, KillValue: p.KillValue, Lost: p.Lost, Trained: p.Trained,
			Built: p.Built, Explored: EncodeFog(make([]bool, len(p.Explored)), p.Explored),
			Mods: [8]float64{p.gatherMul, p.attackMul, p.armorAdd, p.hpMul, p.farmMul, p.fishMul, p.navalMul, p.miningMul}}
		for id := range p.Techs {
			sp.Techs = append(sp.Techs, id)
		}
		sort.Strings(sp.Techs)
		for id := range p.seenB {
			sp.SeenB = append(sp.SeenB, id)
		}
		sort.Ints(sp.SeenB)
		if a := p.ai; a != nil {
			sp.AIState = &SaveAI{a.attackSize, a.nextAttack, a.attacking, a.waveSize, a.thinks, a.stageUntil}
		}
		s.Players = append(s.Players, sp)
	}
	for _, id := range g.order {
		e := g.Ents[id]
		if e == nil || e.dead {
			continue
		}
		se := SaveEnt{ID: e.ID, Kind: e.Kind, Type: e.Type, Owner: e.Owner, X: e.X, Y: e.Y, HP: e.HP, MaxHP: e.MaxHP, Age: e.Age,
			Order: e.Order, Target: e.Target, TX: e.TX, TY: e.TY, Carry: e.Carry, CarryRes: e.CarryRes, Facing: e.Facing,
			LastRes: e.lastRes, LastX: e.lastX, LastY: e.lastY, TileX: e.TileX, TileY: e.TileY, Built: e.Built,
			Progress: e.Progress, RallyX: e.RallyX, RallyY: e.RallyY, HasRally: e.HasRally, Food: e.Food, Amount: e.Amount}
		for _, q := range e.Queue {
			se.Queue = append(se.Queue, SaveQItem{q.Unit, q.Tech, q.Age, q.Progress, q.Time, q.Paid})
		}
		s.Ents = append(s.Ents, se)
	}
	return s
}

// MarshalSave encodes a save as JSON.
func (g *Game) MarshalSave() ([]byte, error) { return json.Marshal(g.Save()) }

func badNum(v ...float64) bool {
	for _, x := range v {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return true
		}
	}
	return false
}

// LoadGame rebuilds a match from a save. Every field is validated so a
// corrupted file cannot crash the server.
func LoadGame(b []byte, seed int64) (*Game, error) {
	var s SaveState
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, errors.New("corrupt save")
	}
	if s.Version != SaveVersion || s.Level == nil {
		return nil, errors.New("incompatible save")
	}
	l := s.Level
	if err := l.Validate(); err != nil {
		return nil, err
	}
	if len(s.Players) < 1 || len(s.Players) > MaxPlayers || s.Tick < 0 || s.NextID < 1 {
		return nil, errors.New("corrupt save")
	}
	g := &Game{Level: l, W: l.Width, H: l.Height, Ents: map[int]*Entity{}, nextID: s.NextID, Tick: s.Tick,
		rng: rand.New(rand.NewSource(seed)), Winner: -1}
	g.Tiles = make([]byte, g.W*g.H)
	water := 0
	for i := range g.Tiles {
		g.Tiles[i] = l.Tiles[i] - '0'
		if g.Tiles[i] == TWater {
			water++
		}
	}
	g.occ = make([]int32, g.W*g.H)
	g.Naval = Earthly(l.Theme) && l.MapType != MapDesert && water*50 >= len(g.Tiles)
	g.farmBase = map[string]float64{MapDesert: 0.6, MapRiverland: 1.15}[l.MapType]
	if g.farmBase == 0 {
		g.farmBase = 1
	}
	for i, sp := range s.Players {
		if badNum(sp.Res[:]...) || badNum(sp.Mods[:]...) || sp.Age < 0 || sp.Age > MaxAge || !ValidDifficulty(sp.Difficulty) {
			return nil, errors.New("corrupt player")
		}
		p := &Player{Index: i, Name: CleanText(sp.Name, 40), Team: sp.Team, Color: sp.Color, AI: sp.AI, Difficulty: sp.Difficulty,
			Res: sp.Res, Age: sp.Age, Techs: map[string]bool{}, Defeated: sp.Defeated, Gathered: sp.Gathered, Kills: sp.Kills,
			KillValue: sp.KillValue, Lost: sp.Lost, Trained: sp.Trained, Built: sp.Built,
			Visible: make([]bool, g.W*g.H), Explored: make([]bool, g.W*g.H), seenB: map[int]bool{}}
		m := sp.Mods
		p.gatherMul, p.attackMul, p.armorAdd, p.hpMul, p.farmMul, p.fishMul, p.navalMul, p.miningMul = m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7]
		for _, t := range sp.Techs {
			if Techs[t] != nil {
				p.Techs[t] = true
				p.TechCount++
			}
		}
		if st, ok := DecodeFog(sp.Explored, g.W*g.H); ok {
			for j, v := range st {
				p.Explored[j] = v >= 1
			}
		}
		for _, id := range sp.SeenB {
			p.seenB[id] = true
		}
		if p.AI {
			p.ai = newAI(p.Difficulty)
			if a := sp.AIState; a != nil {
				p.ai.attackSize, p.ai.nextAttack, p.ai.attacking = a.AttackSize, a.NextAttack, a.Attacking
				p.ai.waveSize, p.ai.thinks, p.ai.stageUntil = a.WaveSize, a.Thinks, a.StageUntil
			}
		}
		g.Players = append(g.Players, p)
	}
	for _, se := range s.Ents {
		if se.ID <= 0 || se.ID >= s.NextID || g.Ents[se.ID] != nil || se.Owner < Nature || se.Owner >= len(g.Players) ||
			badNum(se.X, se.Y, se.HP, se.MaxHP, se.TX, se.TY, se.Carry, se.Food, se.Amount, se.Progress) ||
			se.X < 0 || se.Y < 0 || se.X > float64(g.W) || se.Y > float64(g.H) || se.CarryRes < 0 || se.CarryRes >= NumRes {
			return nil, errors.New("corrupt entity")
		}
		e := &Entity{ID: se.ID, Kind: se.Kind, Type: se.Type, Owner: se.Owner, X: se.X, Y: se.Y, HP: se.HP, MaxHP: se.MaxHP, Age: se.Age,
			Order: se.Order, Target: se.Target, TX: se.TX, TY: se.TY, Carry: se.Carry, CarryRes: se.CarryRes, Facing: se.Facing,
			lastRes: se.LastRes, lastX: se.LastX, lastY: se.LastY, TileX: se.TileX, TileY: se.TileY, Built: se.Built,
			Progress: se.Progress, RallyX: se.RallyX, RallyY: se.RallyY, HasRally: se.HasRally, Food: se.Food, Amount: se.Amount}
		switch e.Kind {
		case KUnit:
			if e.U = Units[e.Type]; e.U == nil || e.Order < OIdle || e.Order > OWander {
				return nil, errors.New("unknown unit")
			}
			if e.Owner == Nature && e.U.Class != ClassAnimal || e.Owner != Nature && e.U.Class == ClassAnimal {
				return nil, errors.New("corrupt unit owner")
			}
		case KBuilding:
			if e.B = Buildings[e.Type]; e.B == nil || e.Owner < 0 || e.TileX < 0 || e.TileY < 0 || e.TileX+e.B.Size > g.W || e.TileY+e.B.Size > g.H {
				return nil, errors.New("unknown building")
			}
			for _, q := range se.Queue {
				if badNum(q.Progress, q.Time) || q.Time <= 0 || (q.Unit != "" && Units[q.Unit] == nil) || (q.Tech != "" && Techs[q.Tech] == nil) {
					return nil, errors.New("corrupt queue")
				}
				e.Queue = append(e.Queue, QItem{Unit: q.Unit, Tech: q.Tech, Age: q.Age, Progress: q.Progress, Time: q.Time, Paid: q.Paid})
			}
			if len(e.Queue) > MaxQueue {
				return nil, errors.New("corrupt queue")
			}
			if e.Type != "farm" {
				for y := e.TileY; y < e.TileY+e.B.Size; y++ {
					for x := e.TileX; x < e.TileX+e.B.Size; x++ {
						g.occ[y*g.W+x] = int32(e.ID)
					}
				}
			}
		case KResource:
			if e.R = Resources[e.Type]; e.R == nil || e.Owner != Nature {
				return nil, errors.New("unknown resource")
			}
			if e.R.Block {
				g.occ[int(e.Y)*g.W+int(e.X)] = int32(e.ID)
			}
		default:
			return nil, errors.New("unknown entity kind")
		}
		g.Ents[e.ID] = e
		g.order = append(g.order, e.ID)
	}
	sort.Ints(g.order)
	for _, p := range g.Players {
		g.recalcPop(p)
	}
	g.updateVisibility()
	return g, nil
}

// SetController hands a player over to a human (ai=false) or the computer
// (used when a restored game is resumed by different participants).
func (p *Player) SetController(name string, ai bool, difficulty string) {
	p.Name = name
	p.AI = ai
	if !ai {
		p.ai = nil
		return
	}
	if p.ai == nil || p.Difficulty != difficulty && difficulty != "" {
		if difficulty != "" {
			p.Difficulty = difficulty
		}
		p.ai = newAI(p.Difficulty)
	}
}
