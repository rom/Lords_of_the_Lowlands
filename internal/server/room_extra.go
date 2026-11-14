package server

import (
	"errors"
	"fmt"
	"math/rand"
	"time"

	"github.com/rom/lords_of_the_lowlands/internal/game"
	"github.com/rom/lords_of_the_lowlands/internal/levels"
	"github.com/rom/lords_of_the_lowlands/internal/store"
)

// ---------------------------------------------------------------------------
// Save and restore

// saveGame stores the running match of c's room in c's account.
func (h *Hub) saveGame(c *Client, m *ClientMsg) {
	if c.guest {
		c.errorMsg("register an account to save games")
		return
	}
	if !c.saveL.Allow("") {
		c.errorMsg("please wait before saving again")
		return
	}
	h.mu.Lock()
	r := c.room
	h.mu.Unlock()
	if r == nil || r.Demo {
		c.errorMsg("you are not in a game")
		return
	}
	r.mu.Lock()
	if r.g == nil || r.State != StatePlaying {
		r.mu.Unlock()
		c.errorMsg("the game is not running")
		return
	}
	g := r.g
	blob, err := g.MarshalSave()
	meta := store.SaveMeta{Name: m.Name, Level: r.Level.Name, Minutes: float64(g.Tick) / game.TickRate / 60}
	for _, s := range r.Slots {
		if s.client == c {
			meta.Age = g.Players[s.player].Age
		}
	}
	for _, p := range g.Players {
		n := p.Name
		if p.AI {
			n += " [AI]"
		}
		meta.Players = append(meta.Players, n)
	}
	r.mu.Unlock()
	if err != nil {
		c.errorMsg("could not save")
		return
	}
	id, err := h.s.cfg.Store.SaveGame(c.name, meta, blob, h.s.set.Game.MaxSavesPerUser)
	if errors.Is(err, store.ErrLimit) {
		c.errorMsg("save slots full — delete an old save first")
		return
	}
	if err != nil {
		c.errorMsg("could not save")
		return
	}
	h.s.metrics.saves.Add(1)
	c.sendJSON(map[string]string{"t": "saved", "id": id, "name": meta.Name}, false)
}

// restoreGame creates a room from a saved game. The owner takes back their
// seat; other human seats are reserved for their original players (or
// anyone who joins) and fall to the computer if left empty at start.
func (h *Hub) restoreGame(c *Client, m *ClientMsg) {
	if c.guest {
		c.errorMsg("register an account to use saved games")
		return
	}
	meta, blob, err := h.s.cfg.Store.LoadSave(c.name, m.Save)
	if err != nil {
		c.errorMsg("saved game not found")
		return
	}
	g, err := game.LoadGame(blob, time.Now().UnixNano())
	if err != nil {
		c.errorMsg("saved game is damaged: " + err.Error())
		return
	}
	l := *g.Level
	l.ID, l.Name = "restored", fmt.Sprintf("%s (restored)", meta.Name)
	r, err := h.newRoom(c, l.Name, &l, 0, "")
	if err != nil {
		c.errorMsg(err.Error())
		return
	}
	r.mu.Lock()
	r.restored = g
	r.Slots = nil
	mine := -1
	for i, p := range g.Players {
		s := &Slot{Team: p.Team, Name: p.Name, player: i}
		switch {
		case p.AI:
			s.Kind, s.Diff = SlotAI, p.Difficulty
		case mine < 0 && (p.Name == c.name || i == len(g.Players)-1):
			mine = i
			s.Kind, s.Name, s.client, s.guest = SlotHuman, c.name, c, false
		default:
			s.Kind, s.Reserved = SlotOpen, true
		}
		r.Slots = append(r.Slots, s)
	}
	if mine < 0 { // the saver was not a human player: take the first seat
		r.Slots[0].Kind, r.Slots[0].Name, r.Slots[0].client = SlotHuman, c.name, c
	}
	r.broadcastLocked(r.viewLocked(), false)
	r.mu.Unlock()
	h.broadcastLobby()
}

// ---------------------------------------------------------------------------
// Demo / attract mode

var demoThemes = []string{"temperate", "temperate", "desert", "winter", "tropical", "moon", "mars", "space"}

// demoLevel picks a random showcase: a campaign chapter or a skirmish map.
func demoLevel(rng *rand.Rand) (*game.Level, int) {
	if rng.Intn(2) == 0 {
		camp := levels.Campaign()
		l, _ := levels.Get(camp[rng.Intn(len(camp))].ID)
		l.Gen.Seed = rng.Int63()
		return l, 2 + rng.Intn(3)
	}
	start := rng.Intn(game.MaxAge + 1)
	theme := demoThemes[rng.Intn(len(demoThemes))]
	mt := game.MapTypes[rng.Intn(len(game.MapTypes))]
	n := 2 + rng.Intn(3)
	l, err := levels.Skirmish(levels.SkirmishOptions{Theme: theme, Size: 56 + 8*rng.Intn(4), StartAge: start,
		MaxAge: minInt(start+2, game.MaxAge), Seed: rng.Int63(), Water: 0.3, Players: n, MapType: mt})
	if err != nil {
		return demoLevel(rng)
	}
	l.Name = fmt.Sprintf("Demo: %s %s", game.Ages[start].Name, mt)
	return l, n
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// setupDemoLocked starts a new AI-only match in a demo room.
func (h *Hub) setupDemoLocked(r *Room) error {
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))
	l, n := demoLevel(rng)
	diffs := []string{"normal", "hard", "super_hard", "insane"}
	var setups []game.PlayerSetup
	r.Slots = nil
	for i := 0; i < n; i++ {
		d := diffs[rng.Intn(len(diffs))]
		setups = append(setups, game.PlayerSetup{Name: aiName(i + rng.Intn(5)), Team: i + 1, AI: true, Difficulty: d})
		r.Slots = append(r.Slots, &Slot{Kind: SlotAI, Name: setups[i].Name, Team: i + 1, Diff: d, player: i})
	}
	g, err := game.NewGame(l, setups, rng.Int63())
	if err != nil {
		return err
	}
	r.Level, r.Name, r.g = l, l.Name, g
	r.State = StatePlaying
	r.started = time.Now()
	r.demoUntil = time.Now().Add(time.Duration(h.s.set.Game.Demo.RotateMinutes * float64(time.Minute)))
	x, y := float64(g.W)/2, float64(g.H)/2
	msg := startMsg{"start", g.Map(), -1, g.Snapshot(-1, nil, false).Players, [2]float64{x, y}, infoOf(l), r.ID}
	for _, c := range r.spectators {
		c.sendJSON(map[string]interface{}{"t": "start", "map": msg.Map, "you": -1, "players": msg.Players, "cam": msg.Cam,
			"level": msg.Level, "room": r.ID, "demo": true, "rotateMinutes": h.s.set.Game.Demo.RotateMinutes}, false)
	}
	return nil
}

// startDemo puts an idle client into a new self-playing demo match.
func (h *Hub) startDemo(c *Client) {
	d := h.s.set.Game.Demo
	if !d.Enabled {
		c.errorMsg("demo mode is disabled on this server")
		return
	}
	h.mu.Lock()
	if c.room != nil {
		h.mu.Unlock()
		c.errorMsg("leave your current room first")
		return
	}
	demos := 0
	for _, r := range h.rooms {
		if r.Demo {
			demos++
		}
	}
	if demos >= d.MaxRooms || len(h.rooms) >= h.s.cfg.MaxRooms {
		h.mu.Unlock()
		c.errorMsg("no demo available right now")
		return
	}
	h.nextID++
	r := &Room{hub: h, ID: fmt.Sprintf("d%d", h.nextID), Host: c.name, Demo: true, State: StateLobby,
		tickDur: time.Second / game.TickRate, spectators: []*Client{c}}
	h.rooms[r.ID] = r
	c.room = r
	h.mu.Unlock()
	r.mu.Lock()
	err := h.setupDemoLocked(r)
	if err == nil {
		r.cmds = make(chan game.Command, 1)
		r.stop = make(chan struct{})
	}
	r.mu.Unlock()
	if err != nil {
		h.mu.Lock()
		delete(h.rooms, r.ID)
		c.room = nil
		h.mu.Unlock()
		c.errorMsg("could not start the demo")
		return
	}
	go r.loop()
}

// nextDemo replaces a finished or expired demo match with a new one. It
// returns false when the room should stop (no spectators left).
func (h *Hub) nextDemo(r *Room) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.spectators) == 0 {
		return false
	}
	return h.setupDemoLocked(r) == nil
}
