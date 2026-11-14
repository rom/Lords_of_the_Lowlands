// Package levels contains the built-in campaign of Lords of the Lowlands:
// seventeen levels that lead from the Dawn Age to interstellar war.
package levels

import (
	"fmt"

	"github.com/rom/lords_of_the_lowlands/internal/game"
)

type spec struct {
	name, desc, theme string
	start, max        int
	size              int
	obj               game.Objective
	opp               int
	diff              string
	gen               game.GenParams
}

var campaign = []spec{
	{"The First Fire", "300,000 years ago a band huddles around the first fire. Hunt mammoth and deer, gather berries and drive the rival clan from the valley. Discover farming to enter the Neolithic.",
		"temperate", 0, 1, 56, game.Objective{Type: game.ObjConquest}, 1, "easy", game.GenParams{Seed: 101, Forest: 0.6, Animals: 0.9, Water: 0.2, Mountains: 0.2}},
	{"Valley of Plenty", "The ice retreats and wild grain covers the valley. Be the first tribe to master copper and enter the Copper Age.",
		"temperate", 1, 2, 60, game.Objective{Type: game.ObjAdvance}, 1, "easy", game.GenParams{Seed: 202, Forest: 0.5, Animals: 0.7, Water: 0.3, Mountains: 0.2, River: true}},
	{"Gift of the River", "Along a great river in the desert, chiefdoms fight for the fertile banks. Unite the river under one crown.",
		"desert", 2, 3, 64, game.Objective{Type: game.ObjConquest}, 2, "easy", game.GenParams{Seed: 303, Forest: 0.25, Animals: 0.5, Water: 0.1, Mountains: 0.3, River: true, Riches: 0.6}},
	{"The Sea Peoples", "The Bronze Age palaces burn. Raiders come from every side. Hold out for fifteen minutes and forge iron.",
		"tropical", 3, 4, 64, game.Objective{Type: game.ObjSurvive, Minutes: 15}, 2, "normal", game.GenParams{Seed: 404, Forest: 0.5, Animals: 0.4, Water: 0.45, Mountains: 0.2}},
	{"Iron and Ice", "In the frozen north, iron-armed warlords contest the fjords. Conquer them before the classical world arrives.",
		"winter", 4, 5, 68, game.Objective{Type: game.ObjConquest}, 1, "normal", game.GenParams{Seed: 505, Forest: 0.7, Animals: 0.6, Water: 0.35, Mountains: 0.4}},
	{"Phalanx", "City-states clash on sun-bleached plains. Train hoplites, build an academy and outlast your rival.",
		"desert", 5, 6, 68, game.Objective{Type: game.ObjConquest}, 1, "normal", game.GenParams{Seed: 606, Forest: 0.3, Animals: 0.4, Water: 0.3, Mountains: 0.45, Riches: 0.5}},
	{"Shield Wall", "After Rome, kingdoms rise from the ruins. Two warbands threaten your river crossing.",
		"temperate", 6, 7, 72, game.Objective{Type: game.ObjConquest}, 2, "normal", game.GenParams{Seed: 707, Forest: 0.65, Animals: 0.5, Water: 0.2, Mountains: 0.2, River: true}},
	{"Lords of the Lowlands", "Dikes, polders and castles. In the flat, watery lowlands the great lords fight for every acre of reclaimed land.",
		"temperate", 7, 8, 76, game.Objective{Type: game.ObjConquest}, 2, "normal", game.GenParams{Seed: 808, Forest: 0.4, Animals: 0.4, Water: 0.55, Mountains: 0.05, River: true, Riches: 0.4}},
	{"Pike and Shot", "Gunpowder changes everything. Pike squares and arquebusiers decide the fate of the realm.",
		"temperate", 8, 9, 76, game.Objective{Type: game.ObjConquest}, 1, "hard", game.GenParams{Seed: 909, Forest: 0.5, Animals: 0.3, Water: 0.3, Mountains: 0.3}},
	{"A New World", "Across the ocean lies a tropical land of riches. Rival empires race to claim it.",
		"tropical", 9, 10, 80, game.Objective{Type: game.ObjConquest}, 2, "normal", game.GenParams{Seed: 1010, Forest: 0.8, Animals: 0.5, Water: 0.4, Mountains: 0.2, Riches: 0.8}},
	{"The Iron Horse", "Steam engines and coal power the industrial age. Build generators — energy now fuels your army.",
		"temperate", 10, 11, 80, game.Objective{Type: game.ObjConquest}, 2, "normal", game.GenParams{Seed: 1111, Forest: 0.5, Animals: 0.2, Water: 0.25, Mountains: 0.35, Riches: 0.7}},
	{"No Man's Land", "Trenches scar the land. Hold the line for twenty minutes against a mechanised onslaught.",
		"winter", 11, 12, 80, game.Objective{Type: game.ObjSurvive, Minutes: 20}, 2, "hard", game.GenParams{Seed: 1212, Forest: 0.3, Animals: 0.1, Water: 0.2, Mountains: 0.2}},
	{"Iron Curtain", "Rockets, jets and the atom. Three blocs, one continent. Prevail.",
		"winter", 12, 13, 88, game.Objective{Type: game.ObjConquest}, 3, "normal", game.GenParams{Seed: 1313, Forest: 0.5, Animals: 0.1, Water: 0.3, Mountains: 0.3, Riches: 0.6}},
	{"Silicon Frontier", "Satellites watch every move. Precision strikes and information decide the desert war.",
		"desert", 13, 14, 88, game.Objective{Type: game.ObjConquest}, 2, "hard", game.GenParams{Seed: 1414, Forest: 0.2, Animals: 0.1, Water: 0.1, Mountains: 0.4, Riches: 0.8}},
	{"Sea of Tranquility", "The first lunar colonies fight over helium-3 and ice. Exo-troopers walk where Apollo landed.",
		"moon", 14, 15, 84, game.Objective{Type: game.ObjConquest}, 2, "hard", game.GenParams{Seed: 1515, Forest: 0.15, Water: 0.2, Mountains: 0.4, Riches: 1}},
	{"Red Planet", "Under a butterscotch sky, Martian city-states wage war with starfighters and plasma.",
		"mars", 15, 16, 92, game.Objective{Type: game.ObjConquest}, 2, "hard", game.GenParams{Seed: 1616, Forest: 0.2, Water: 0.25, Mountains: 0.45, Riches: 1}},
	{"Battle for the Stars", "In the void between stars, dreadnoughts and interceptors decide the fate of humanity. The final war.",
		"space", 16, 16, 96, game.Objective{Type: game.ObjConquest}, 3, "hard", game.GenParams{Seed: 1717, Forest: 0.15, Water: 0.5, Mountains: 0.2, Riches: 1}},
}

var byID = map[string]*game.Level{}
var list []*game.Level

func init() {
	for i, c := range campaign {
		g := c.gen
		l := &game.Level{
			ID: fmt.Sprintf("campaign-%02d", i+1), Name: c.name, Description: c.desc, Theme: c.theme,
			Width: c.size, Height: c.size, StartAge: c.start, MaxAge: c.max, Objective: c.obj,
			MaxPlayers: 4, Opponents: c.opp, Difficulty: c.diff, Gen: &g, Author: "Campaign",
		}
		if err := l.Validate(); err != nil {
			panic(fmt.Sprintf("campaign level %d: %v", i+1, err))
		}
		byID[l.ID] = l
		list = append(list, l)
	}
}

// Campaign returns the built-in levels in order.
func Campaign() []*game.Level { return list }

// Get returns a built-in level by id.
func Get(id string) (*game.Level, bool) {
	l, ok := byID[id]
	if !ok {
		return nil, false
	}
	cp := *l
	g := *l.Gen
	cp.Gen = &g
	return &cp, true
}

// Index returns the 1-based campaign number of a level id, or 0.
func Index(id string) int {
	for i, l := range list {
		if l.ID == id {
			return i + 1
		}
	}
	return 0
}

// SkirmishOptions configure a random map.
type SkirmishOptions struct {
	Theme    string `json:"theme"`
	Size     int    `json:"size"`
	StartAge int    `json:"startAge"`
	MaxAge   int    `json:"maxAge"`
	Seed     int64  `json:"seed"`
	Water    float64 `json:"water"`
	Players  int    `json:"players"`
}

// Skirmish builds a random-map level from options.
func Skirmish(o SkirmishOptions) (*game.Level, error) {
	if o.Size == 0 {
		o.Size = 72
	}
	if o.Players < 2 {
		o.Players = 2
	}
	if o.Water < 0 || o.Water > 1 {
		o.Water = 0.3
	}
	if o.MaxAge < o.StartAge {
		o.MaxAge = o.StartAge
	}
	l := &game.Level{
		ID: "skirmish", Name: "Skirmish", Description: "Random map skirmish.", Theme: o.Theme,
		Width: o.Size, Height: o.Size, StartAge: o.StartAge, MaxAge: o.MaxAge,
		Objective: game.Objective{Type: game.ObjConquest}, MaxPlayers: o.Players,
		Gen: &game.GenParams{Seed: o.Seed, Water: o.Water, Mountains: 0.3, Forest: 0.5, Animals: 0.5, Riches: 0.5},
	}
	if err := l.Validate(); err != nil {
		return nil, err
	}
	return l, nil
}
