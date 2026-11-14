package game

import (
	"math"
	"strconv"
	"strings"
)

// EntView is the compact client view of an entity.
type EntView struct {
	ID    int         `json:"i"`
	Kind  int         `json:"k"`
	Type  string      `json:"t"`
	Owner int         `json:"o"`
	X     float64     `json:"x"`
	Y     float64     `json:"y"`
	HP    float64     `json:"h"`           // fraction 0..1
	MaxHP int         `json:"m,omitempty"` // absolute max hp (own/allied)
	State int         `json:"s,omitempty"` // order
	Busy  bool        `json:"b,omitempty"`
	Face  float64     `json:"f,omitempty"`
	Prog  float64     `json:"p,omitempty"` // construction progress
	Carry int         `json:"c,omitempty"` // carried amount
	CRes  int         `json:"r,omitempty"` // carried resource
	Amt   int         `json:"a,omitempty"` // resource amount / farm food
	Age   int         `json:"g,omitempty"`
	Queue []QItem     `json:"q,omitempty"`
	Rally *[2]float64 `json:"rl,omitempty"`
}

// PlayerView is public per-player information.
type PlayerView struct {
	Index    int    `json:"i"`
	Name     string `json:"n"`
	Team     int    `json:"t"`
	Color    int    `json:"c"`
	AI       bool   `json:"ai"`
	Age      int    `json:"g"`
	Defeated bool   `json:"d"`
	Score    int    `json:"s"`
}

// Snapshot is the per-player state broadcast every tick.
type Snapshot struct {
	Tick   int         `json:"tick"`
	You    int         `json:"you"`
	Res    [NumRes]int `json:"res"`
	Pop    int         `json:"pop"`
	PopCap int         `json:"cap"`
	Age    int         `json:"age"`
	Techs  []string    `json:"techs"`
	Ents   []EntView   `json:"ents"`
	// Key marks a keyframe: Ents is complete. In a delta (Key false) resources
	// are only listed when they are in sight or changed this tick, and Gone lists
	// resources that were used up; everything else in Ents is still complete.
	Key     bool         `json:"key,omitempty"`
	Gone    []int        `json:"gone,omitempty"`
	Events  []Event      `json:"ev,omitempty"`
	Fog     string       `json:"fog,omitempty"`
	Players []PlayerView `json:"players"`
	Over    bool         `json:"over,omitempty"`
	Winner  int          `json:"winner"`
	Time    float64      `json:"time"`
}

func r2(v float64) float64 { return math.Round(v*100) / 100 }

// Snapshot builds the view for a player. Enemy units are only included
// when currently visible, enemy buildings and resources once explored.
// Passing player == -1 yields a spectator view of everything.
func (g *Game) Snapshot(player int, events []Event, withFog bool) *Snapshot {
	return g.SnapshotDelta(player, events, withFog, true)
}

// SnapshotDelta is Snapshot with optional resource delta encoding. Trees,
// mines and bushes make up most of a map's entities but rarely change, so
// between keyframes only the resources touched this tick are sent. This keeps
// snapshots small on large, well-explored maps.
func (g *Game) SnapshotDelta(player int, events []Event, withFog, key bool) *Snapshot {
	s := &Snapshot{Tick: g.Tick, You: player, Over: g.Over, Winner: g.Winner, Time: r2(float64(g.Tick) / TickRate), Key: key}
	var p *Player
	if player >= 0 {
		p = g.Players[player]
		for i, v := range p.Res {
			s.Res[i] = int(v)
		}
		s.Pop, s.PopCap, s.Age = p.Pop, p.PopCap, p.Age
		for id := range p.Techs {
			s.Techs = append(s.Techs, id)
		}
	}
	for _, pl := range g.Players {
		s.Players = append(s.Players, PlayerView{pl.Index, pl.Name, pl.Team, pl.Color, pl.AI, pl.Age, pl.Defeated, g.Score(pl)})
	}
	for _, id := range g.order {
		e := g.Ents[id]
		if e == nil || e.dead {
			continue
		}
		if !key && e.Kind == KResource && e.chg != g.Tick {
			// unchanged resource: the client already has it, unless it has
			// just come into sight (resources in view are always sent)
			if i := int(e.Y)*g.W + int(e.X); p == nil || i < 0 || i >= len(p.Visible) || !p.Visible[i] {
				continue
			}
		}
		if p != nil && !g.canSee(player, e) {
			continue
		}
		v := EntView{ID: e.ID, Kind: e.Kind, Type: e.Type, Owner: e.Owner, X: r2(e.X), Y: r2(e.Y), Age: e.Age}
		if e.MaxHP > 0 {
			v.HP = r2(e.HP / e.MaxHP)
		}
		own := p == nil || (e.Owner >= 0 && g.Allied(player, e.Owner))
		switch e.Kind {
		case KUnit:
			v.State, v.Busy, v.Face = e.Order, e.Busy, r2(e.Facing)
			if own {
				v.Carry, v.CRes = int(e.Carry), e.CarryRes
				v.MaxHP = int(e.MaxHP)
			}
		case KBuilding:
			if !e.Built {
				v.Prog = r2(e.Progress)
			}
			if own {
				v.MaxHP = int(e.MaxHP)
				v.Queue = e.Queue
				v.Amt = int(e.Food)
				if e.HasRally && e.Owner == player {
					v.Rally = &[2]float64{r2(e.RallyX), r2(e.RallyY)}
				}
			}
		case KResource:
			v.Amt = int(e.Amount)
			v.HP = 1
		}
		s.Ents = append(s.Ents, v)
	}
	for _, ev := range events {
		if p == nil || ev.K == "gameover" || ev.K == "defeated" {
			s.Events = append(s.Events, ev)
			continue
		}
		i := int(ev.Y)*g.W + int(ev.X)
		if (ev.O >= 0 && g.Allied(player, ev.O)) || (i >= 0 && i < len(p.Visible) && p.Visible[i]) {
			if ev.K == "alert" && ev.O != player {
				continue
			}
			s.Events = append(s.Events, ev)
		}
	}
	if !key {
		s.Gone = append(s.Gone, g.gone...)
	}
	if withFog && p != nil {
		s.Fog = EncodeFog(p.Visible, p.Explored)
	}
	return s
}

// EncodeFog run-length encodes visibility: each run is "<state><count>,"
// where state is 0 unexplored, 1 explored, 2 visible.
func EncodeFog(vis, exp []bool) string {
	var b strings.Builder
	cur, run := -1, 0
	flush := func() {
		if run > 0 {
			b.WriteByte(byte('0' + cur))
			b.WriteString(strconv.Itoa(run))
			b.WriteByte(',')
		}
	}
	for i := range vis {
		st := 0
		if vis[i] {
			st = 2
		} else if exp[i] {
			st = 1
		}
		if st != cur {
			flush()
			cur, run = st, 0
		}
		run++
	}
	flush()
	return b.String()
}

// DecodeFog reverses EncodeFog (used by tests and tools).
func DecodeFog(s string, n int) ([]int, bool) {
	out := make([]int, 0, n)
	for _, part := range strings.Split(s, ",") {
		if part == "" {
			continue
		}
		st := int(part[0] - '0')
		c, err := strconv.Atoi(part[1:])
		if err != nil || st < 0 || st > 2 || c < 0 || len(out)+c > n {
			return nil, false
		}
		for i := 0; i < c; i++ {
			out = append(out, st)
		}
	}
	return out, len(out) == n
}

// MapView is sent once at game start.
type MapView struct {
	W        int       `json:"w"`
	H        int       `json:"h"`
	Tiles    string    `json:"tiles"`
	Theme    string    `json:"theme"`
	Name     string    `json:"name"`
	Desc     string    `json:"desc"`
	Obj      Objective `json:"objective"`
	MaxAge   int       `json:"maxAge"`
	StartAge int       `json:"startAge"`
	MapType  string    `json:"mapType"`
	Naval    bool      `json:"naval"`
}

// Map returns the static map view.
func (g *Game) Map() MapView {
	b := make([]byte, len(g.Tiles))
	for i, t := range g.Tiles {
		b[i] = '0' + t
	}
	return MapView{g.W, g.H, string(b), g.Level.Theme, g.Level.Name, g.Level.Description, g.Level.Objective, g.Level.MaxAge, g.Level.StartAge, g.Level.MapType, g.Naval}
}

// StartPos returns a player's town centre position (for camera placement).
func (g *Game) StartPos(player int) (float64, float64) {
	for _, e := range g.Ents {
		if e.Owner == player && e.Type == "town_center" {
			return e.X, e.Y
		}
	}
	return float64(g.W) / 2, float64(g.H) / 2
}
