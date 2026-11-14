package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/rom/lords_of_the_lowlands/internal/game"
	"github.com/rom/lords_of_the_lowlands/internal/levels"
	"github.com/rom/lords_of_the_lowlands/internal/store"
)

// Slot kinds.
const (
	SlotHuman  = "human"
	SlotAI     = "ai"
	SlotOpen   = "open"
	SlotClosed = "closed"
)

// Room states.
const (
	StateLobby   = "lobby"
	StatePlaying = "playing"
	StateDone    = "done"
)

// Slot is a seat in a room.
type Slot struct {
	Kind   string `json:"kind"`
	Name   string `json:"name,omitempty"`
	Team   int    `json:"team"`
	Diff   string `json:"diff,omitempty"`
	client *Client
	player int
	guest  bool
}

// Room is a lobby room that becomes a match.
type Room struct {
	hub      *Hub
	ID       string
	Name     string
	Host     string
	Level    *game.Level
	Slots    []*Slot
	State    string
	mu       sync.Mutex
	g        *game.Game
	cmds     chan game.Command
	stop     chan struct{}
	stopOnce sync.Once
	started  time.Time
	tickDur  time.Duration
}

type roomSummary struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Host    string `json:"host"`
	Level   string `json:"level"`
	LevelID string `json:"levelId"`
	State   string `json:"state"`
	Players int    `json:"players"`
	Max     int    `json:"max"`
	Open    int    `json:"open"`
}

func (r *Room) summary() roomSummary {
	r.mu.Lock()
	defer r.mu.Unlock()
	n, open := 0, 0
	for _, s := range r.Slots {
		switch s.Kind {
		case SlotHuman, SlotAI:
			n++
		case SlotOpen:
			open++
		}
	}
	return roomSummary{r.ID, r.Name, r.Host, r.Level.Name, r.Level.ID, r.State, n, len(r.Slots), open}
}

type roomView struct {
	T     string    `json:"t"`
	ID    string    `json:"id"`
	Name  string    `json:"name"`
	Host  string    `json:"host"`
	State string    `json:"state"`
	Level levelInfo `json:"level"`
	Slots []*Slot   `json:"slots"`
}

func (r *Room) viewLocked() roomView {
	return roomView{"room", r.ID, r.Name, r.Host, r.State, infoOf(r.Level), r.Slots}
}

func (r *Room) membersLocked() []*Client {
	var out []*Client
	for _, s := range r.Slots {
		if s.client != nil {
			out = append(out, s.client)
		}
	}
	return out
}

func (r *Room) broadcastLocked(v interface{}, lossy bool) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	for _, c := range r.membersLocked() {
		c.enqueue(b, lossy)
	}
}

func (r *Room) pushView() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.broadcastLocked(r.viewLocked(), false)
}

func defaultSlots(l *game.Level, host *Client, ai int, diff string) []*Slot {
	n := l.MaxPlayers
	if n < 2 {
		n = 2
	}
	slots := make([]*Slot, n)
	slots[0] = &Slot{Kind: SlotHuman, Name: host.name, Team: 1, client: host, guest: host.guest}
	for i := 1; i < n; i++ {
		slots[i] = &Slot{Kind: SlotOpen, Team: i + 1}
		if i <= ai {
			slots[i] = &Slot{Kind: SlotAI, Name: aiName(i), Team: 2, Diff: diff}
		}
	}
	return slots
}

var aiNames = []string{"Ramses", "Boudica", "Ashoka", "Charlemagne", "Saladin", "Elizabeth", "Napoleon", "Ada", "Nova"}

func aiName(i int) string { return aiNames[i%len(aiNames)] + " (AI)" }

func (h *Hub) newRoom(c *Client, name string, l *game.Level, ai int, diff string) (*Room, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if c.room != nil {
		return nil, errors.New("leave your current room first")
	}
	if len(h.rooms) >= h.s.cfg.MaxRooms {
		return nil, errors.New("server is full, try later")
	}
	h.nextID++
	r := &Room{hub: h, ID: fmt.Sprintf("r%d", h.nextID), Name: name, Host: c.name, Level: l, State: StateLobby, tickDur: time.Second / game.TickRate}
	if diff == "" {
		diff = l.Difficulty
	}
	r.Slots = defaultSlots(l, c, ai, diff)
	h.rooms[r.ID] = r
	c.room = r
	return r, nil
}

func (h *Hub) createRoom(c *Client, m *ClientMsg) {
	l, ok := h.s.findLevel(m.Level)
	if !ok {
		var err error
		if m.Skirmish == nil {
			c.errorMsg("unknown level")
			return
		}
		m.Skirmish.Players = 4
		l, err = levels.Skirmish(*m.Skirmish)
		if err != nil {
			c.errorMsg(err.Error())
			return
		}
	}
	r, err := h.newRoom(c, m.Name, l, 0, m.Diff)
	if err != nil {
		c.errorMsg(err.Error())
		return
	}
	r.pushView()
	h.broadcastLobby()
}

// quickGame creates a room with AI opponents and starts it immediately.
func (h *Hub) quickGame(c *Client, m *ClientMsg) {
	var l *game.Level
	var ok bool
	if m.Skirmish != nil {
		m.Skirmish.Players = m.Opp + 1
		if m.Skirmish.Players < 2 {
			m.Skirmish.Players = 2
		}
		var err error
		if l, err = levels.Skirmish(*m.Skirmish); err != nil {
			c.errorMsg(err.Error())
			return
		}
	} else if l, ok = h.s.findLevel(m.Level); !ok {
		c.errorMsg("unknown level")
		return
	}
	opp := m.Opp
	if opp <= 0 {
		opp = l.Opponents
	}
	if opp < 1 {
		opp = 1
	}
	if opp > l.MaxPlayers-1 {
		opp = l.MaxPlayers - 1
	}
	r, err := h.newRoom(c, l.Name, l, opp, m.Diff)
	if err != nil {
		c.errorMsg(err.Error())
		return
	}
	r.mu.Lock()
	// in campaign levels all AI opponents are allied against the player
	for i := opp + 1; i < len(r.Slots); i++ {
		r.Slots[i].Kind = SlotClosed
	}
	err = r.startLocked()
	r.mu.Unlock()
	if err != nil {
		c.errorMsg(err.Error())
	}
	h.broadcastLobby()
}

func (h *Hub) joinRoom(c *Client, id string) {
	h.mu.Lock()
	r := h.rooms[id]
	if r == nil {
		h.mu.Unlock()
		c.errorMsg("no such room")
		return
	}
	if c.room != nil {
		h.mu.Unlock()
		c.errorMsg("leave your current room first")
		return
	}
	r.mu.Lock()
	if r.State != StateLobby {
		r.mu.Unlock()
		h.mu.Unlock()
		c.errorMsg("game already started")
		return
	}
	var seat *Slot
	for _, s := range r.Slots {
		if s.Kind == SlotOpen {
			seat = s
			break
		}
	}
	if seat == nil {
		r.mu.Unlock()
		h.mu.Unlock()
		c.errorMsg("room is full")
		return
	}
	seat.Kind, seat.Name, seat.client, seat.guest = SlotHuman, c.name, c, c.guest
	c.room = r
	r.broadcastLocked(r.viewLocked(), false)
	r.mu.Unlock()
	h.mu.Unlock()
	h.broadcastLobby()
}

// leaveRoom removes a client from its room. During a game the seat stays
// (the player can reconnect); explicit leaves resign.
func (h *Hub) leaveRoom(c *Client, r *Room, explicit bool) {
	h.mu.Lock()
	if c.room == r {
		c.room = nil
	}
	h.mu.Unlock()
	r.mu.Lock()
	humans := 0
	for _, s := range r.Slots {
		if s.client == c {
			s.client = nil
			if r.State == StateLobby {
				s.Kind, s.Name = SlotOpen, ""
			} else if explicit && r.g != nil && r.State == StatePlaying {
				r.g.Resign(s.player)
			}
		}
		if s.client != nil {
			humans++
		}
	}
	if r.State == StateLobby && c.name == r.Host {
		for _, s := range r.Slots {
			if s.client != nil {
				r.Host = s.client.name
				break
			}
		}
	}
	r.broadcastLocked(r.viewLocked(), false)
	empty := humans == 0
	r.mu.Unlock()
	if empty {
		r.stopGame()
		h.mu.Lock()
		delete(h.rooms, r.ID)
		h.mu.Unlock()
	}
	h.broadcastLobby()
}

// rejoin re-attaches a reconnecting player to a running game.
func (h *Hub) rejoin(c *Client) {
	h.mu.Lock()
	var rooms []*Room
	for _, r := range h.rooms {
		rooms = append(rooms, r)
	}
	h.mu.Unlock()
	for _, r := range rooms {
		r.mu.Lock()
		if r.State == StatePlaying {
			for _, s := range r.Slots {
				if s.Kind == SlotHuman && s.client == nil && strings.EqualFold(s.Name, c.name) {
					s.client = c
					c.sendJSON(r.startMsgLocked(s), false)
					r.mu.Unlock()
					h.mu.Lock()
					c.room = r
					h.mu.Unlock()
					return
				}
			}
		}
		r.mu.Unlock()
	}
}

// handover moves the seat of a replaced connection to its successor.
func (r *Room) handover(old, c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, s := range r.Slots {
		if s.client == old {
			s.client = c
			if r.State == StatePlaying {
				c.sendJSON(r.startMsgLocked(s), false)
			} else {
				c.sendJSON(r.viewLocked(), false)
			}
		}
	}
}

func (r *Room) lobbyAction(c *Client, m *ClientMsg) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.State != StateLobby {
		return errors.New("game already started")
	}
	switch m.T {
	case "team":
		for _, s := range r.Slots {
			if s.client == c {
				s.Team = m.Team
			}
		}
	case "slot":
		if c.name != r.Host {
			return errors.New("only the host can change slots")
		}
		if m.Slot >= len(r.Slots) {
			return errors.New("bad slot")
		}
		s := r.Slots[m.Slot]
		if s.Kind == SlotHuman {
			if m.Kind == SlotAI || m.Kind == SlotOpen || m.Kind == SlotClosed {
				if s.client == c {
					s.Team = m.Team
					break
				}
				return errors.New("slot is taken by a player")
			}
		}
		s.Kind, s.client = m.Kind, nil
		s.Name, s.Diff = "", ""
		if m.Kind == SlotAI {
			s.Name = aiName(m.Slot)
			s.Diff = m.Diff
			if s.Diff == "" {
				s.Diff = "normal"
			}
		}
		if m.Team > 0 {
			s.Team = m.Team
		}
	case "start":
		if c.name != r.Host {
			return errors.New("only the host can start")
		}
		return r.startLocked()
	}
	r.broadcastLocked(r.viewLocked(), false)
	return nil
}

func (r *Room) startLocked() error {
	var setups []game.PlayerSetup
	var seats []*Slot
	teams := map[int]bool{}
	for _, s := range r.Slots {
		if s.Kind != SlotHuman && s.Kind != SlotAI {
			continue
		}
		setups = append(setups, game.PlayerSetup{Name: s.Name, Team: s.Team, AI: s.Kind == SlotAI, Difficulty: s.Diff})
		seats = append(seats, s)
		teams[s.Team] = true
	}
	if len(setups) < 2 {
		return errors.New("need at least two players (add an AI)")
	}
	if len(teams) < 2 {
		return errors.New("everyone is on the same team")
	}
	g, err := game.NewGame(r.Level, setups, time.Now().UnixNano())
	if err != nil {
		return err
	}
	for i, s := range seats {
		s.player = i
	}
	r.g = g
	r.State = StatePlaying
	r.started = time.Now()
	r.cmds = make(chan game.Command, 512)
	r.stop = make(chan struct{})
	for _, s := range r.Slots {
		if s.client != nil {
			s.client.sendJSON(r.startMsgLocked(s), false)
		}
	}
	go r.loop()
	return nil
}

type startMsg struct {
	T       string            `json:"t"`
	Map     game.MapView      `json:"map"`
	You     int               `json:"you"`
	Players []game.PlayerView `json:"players"`
	Cam     [2]float64        `json:"cam"`
	Level   levelInfo         `json:"level"`
	Room    string            `json:"room"`
}

func (r *Room) startMsgLocked(s *Slot) startMsg {
	snap := r.g.Snapshot(s.player, nil, false)
	x, y := r.g.StartPos(s.player)
	return startMsg{"start", r.g.Map(), s.player, snap.Players, [2]float64{x, y}, infoOf(r.Level), r.ID}
}

func (r *Room) command(c *Client, cmd game.Command) {
	r.mu.Lock()
	var player = -1
	for _, s := range r.Slots {
		if s.client == c && s.Kind == SlotHuman {
			player = s.player
		}
	}
	ch, state := r.cmds, r.State
	r.mu.Unlock()
	if player < 0 || state != StatePlaying {
		return
	}
	cmd.Player = player
	select {
	case ch <- cmd:
	default:
	}
}

func (r *Room) chat(c *Client, out chatOut) {
	r.mu.Lock()
	defer r.mu.Unlock()
	team := -1
	if out.Ch == ChanTeam {
		for _, s := range r.Slots {
			if s.client == c {
				team = s.Team
			}
		}
	}
	b, _ := json.Marshal(out)
	for _, s := range r.Slots {
		if s.client != nil && (team < 0 || s.Team == team) {
			s.client.enqueue(b, false)
		}
	}
}

func (r *Room) stopGame() {
	r.mu.Lock()
	st := r.stop
	r.mu.Unlock()
	if st != nil {
		r.stopOnce.Do(func() { close(st) })
	}
}

// loop runs the simulation at TickRate until the game ends.
func (r *Room) loop() {
	t := time.NewTicker(r.tickDur)
	defer t.Stop()
	var pending []game.Command
	for {
		select {
		case <-r.stop:
			return
		case c := <-r.cmds:
			if len(pending) < 1024 {
				pending = append(pending, c)
			}
		case <-t.C:
			if r.tick(pending) {
				return
			}
			pending = pending[:0]
		}
	}
}

// tick applies commands, advances the simulation and sends snapshots.
// It returns true when the game is over.
func (r *Room) tick(cmds []game.Command) bool {
	r.mu.Lock()
	g := r.g
	for _, c := range cmds {
		if err := g.Apply(c); err != nil {
			for _, s := range r.Slots {
				if s.player == c.Player && s.client != nil && s.Kind == SlotHuman {
					s.client.sendJSON(map[string]string{"t": "cmderr", "msg": err.Error()}, true)
				}
			}
		}
	}
	g.Step()
	ev := g.Events()
	fog := g.Tick%5 == 1
	for _, s := range r.Slots {
		if s.client == nil || s.Kind != SlotHuman {
			continue
		}
		snap := g.Snapshot(s.player, ev, fog)
		s.client.sendJSON(map[string]interface{}{"t": "snap", "s": snap}, true)
	}
	over := g.Over
	var results []game.Result
	if over {
		r.State = StateDone
		results = g.Results()
		r.broadcastLocked(map[string]interface{}{"t": "end", "results": results, "winner": g.Winner}, false)
	}
	r.mu.Unlock()
	if over {
		r.record(results)
	}
	return over
}

func (r *Room) record(results []game.Result) {
	st := r.hub.s.cfg.Store
	mins := time.Since(r.started).Minutes()
	camp := levels.Index(r.Level.ID)
	r.mu.Lock()
	guests := map[string]bool{}
	for _, s := range r.Slots {
		if s.Kind == SlotHuman && s.guest {
			guests[strings.ToLower(s.Name)] = true
		}
	}
	r.mu.Unlock()
	for _, res := range results {
		if res.AI || guests[strings.ToLower(res.Name)] {
			continue
		}
		_ = st.RecordGame(res.Name, store.Score{Level: r.Level.ID, Score: res.Score, Won: res.Won, Age: res.Age, Mins: mins}, camp)
	}
}
