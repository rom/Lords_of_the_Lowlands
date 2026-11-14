package game

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSaveRoundTrip(t *testing.T) {
	g := navalGame(t, MapCoastal)
	steps(g, 10*60*6)
	g.Players[0].seenB = map[int]bool{5: true}
	b, err := g.MarshalSave()
	if err != nil {
		t.Fatal(err)
	}
	h, err := LoadGame(b, 9)
	if err != nil {
		t.Fatal(err)
	}
	if h.Tick != g.Tick || len(h.Ents) != len(g.Ents) || h.Naval != g.Naval || h.nextID != g.nextID {
		t.Fatalf("mismatch ents %d/%d", len(h.Ents), len(g.Ents))
	}
	for i, p := range g.Players {
		q := h.Players[i]
		if q.Res != p.Res || q.Age != p.Age || q.TechCount != p.TechCount || q.Pop != p.Pop || q.PopCap != p.PopCap || q.gatherMul != p.gatherMul {
			t.Fatalf("player %d differs: %+v vs %+v", i, q.Res, p.Res)
		}
		for j := range p.Explored {
			if p.Explored[j] != q.Explored[j] {
				t.Fatal("explored differs")
			}
		}
		if (p.ai == nil) != (q.ai == nil) || (p.ai != nil && p.ai.attackSize != q.ai.attackSize) {
			t.Fatal("ai state")
		}
	}
	for id, e := range g.Ents {
		f := h.Ents[id]
		if f == nil || f.X != e.X || f.HP != e.HP || len(f.Queue) != len(e.Queue) || f.Amount != e.Amount {
			t.Fatalf("entity %d differs", id)
		}
	}
	for i := range g.occ {
		if g.occ[i] != h.occ[i] {
			t.Fatal("occupancy differs")
		}
	}
	steps(h, 600) // the restored game keeps running
	// a second save of the restored game loads too
	b2, _ := h.MarshalSave()
	if _, err := LoadGame(b2, 1); err != nil {
		t.Fatal(err)
	}
}

func TestLoadRejectsCorruptSaves(t *testing.T) {
	g := newGame(t, flatLevel(Object{"tree", 3, 3}), true)
	good := g.Save()
	mutate := []func(s *SaveState){
		func(s *SaveState) { s.Version = 99 },
		func(s *SaveState) { s.Level = nil },
		func(s *SaveState) { s.Level.Width = 5 },
		func(s *SaveState) { s.Players = nil },
		func(s *SaveState) { s.NextID = 0 },
		func(s *SaveState) { s.Players[0].Age = 99 },
		func(s *SaveState) { s.Players[1].Difficulty = "god" },
		func(s *SaveState) { s.Ents[0].ID = 0 },
		func(s *SaveState) { s.Ents[1].ID = s.Ents[0].ID },
		func(s *SaveState) { s.Ents[0].Owner = 7 },
		func(s *SaveState) { s.Ents[0].X = -4 },
		func(s *SaveState) { s.Ents[0].CarryRes = 9 },
		func(s *SaveState) { s.Ents[0].Kind = 9 },
	}
	byKind := func(s *SaveState, k int) *SaveEnt {
		for i := range s.Ents {
			if s.Ents[i].Kind == k {
				return &s.Ents[i]
			}
		}
		return nil
	}
	mutate = append(mutate,
		func(s *SaveState) { byKind(s, KUnit).Type = "dragon" },
		func(s *SaveState) { byKind(s, KUnit).Order = 42 },
		func(s *SaveState) { byKind(s, KUnit).Owner = Nature },
		func(s *SaveState) { byKind(s, KBuilding).Type = "castle" },
		func(s *SaveState) { byKind(s, KBuilding).TileX = 31 },
		func(s *SaveState) { byKind(s, KBuilding).Queue = []SaveQItem{{Unit: "x", Time: 1}} },
		func(s *SaveState) { byKind(s, KBuilding).Queue = make([]SaveQItem, MaxQueue+1) },
		func(s *SaveState) { byKind(s, KResource).Type = "mithril" },
		func(s *SaveState) { byKind(s, KResource).Owner = 0 },
	)
	for i, m := range mutate {
		b, _ := json.Marshal(good)
		var s SaveState
		json.Unmarshal(b, &s)
		m(&s)
		b, _ = json.Marshal(&s)
		if _, err := LoadGame(b, 1); err == nil {
			t.Errorf("mutation %d accepted", i)
		}
	}
	if _, err := LoadGame([]byte("{"), 1); err == nil || !strings.Contains(err.Error(), "corrupt") {
		t.Fatal("bad json")
	}
	if !badNum(1, 2, nan()) || badNum(1) {
		t.Fatal("badNum")
	}
}

func nan() float64 { var z float64; return z / z }

func FuzzLoadGame(f *testing.F) {
	g, _ := NewGame(flatLevel(Object{"tree", 3, 3}), []PlayerSetup{{Name: "a", Team: 1}, {Name: "b", Team: 2, AI: true}}, 1)
	b, _ := g.MarshalSave()
	f.Add(b)
	f.Fuzz(func(t *testing.T, b []byte) {
		h, err := LoadGame(b, 1)
		if err != nil {
			return
		}
		for i := 0; i < 20; i++ {
			h.Step()
		}
	})
}
