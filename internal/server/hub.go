package server

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// Client is one connected WebSocket.
type Client struct {
	hub    *Hub
	name   string
	guest  bool
	send   chan []byte
	room   *Room
	chatL  *Limiter
	cmdL   *Limiter
	closed chan struct{}
	once   sync.Once
	conn   *websocket.Conn
}

func (c *Client) close() {
	c.once.Do(func() { close(c.closed) })
}

// enqueue sends a message; if lossy it may be dropped when the client is
// slow, otherwise a slow client is disconnected.
func (c *Client) enqueue(b []byte, lossy bool) {
	select {
	case c.send <- b:
	case <-c.closed:
	default:
		if !lossy {
			c.close()
		}
	}
}

func (c *Client) sendJSON(v interface{}, lossy bool) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	c.enqueue(b, lossy)
}

func (c *Client) errorMsg(msg string) {
	c.sendJSON(map[string]string{"t": "error", "msg": msg}, false)
}

type chatOut struct {
	T    string `json:"t"`
	Ch   string `json:"ch"`
	From string `json:"from"`
	To   string `json:"to,omitempty"`
	Text string `json:"text"`
	TS   int64  `json:"ts"`
}

// Hub tracks connected clients, rooms and chat.
type Hub struct {
	s       *Server
	mu      sync.Mutex
	clients map[*Client]bool
	byName  map[string]*Client
	rooms   map[string]*Room
	history []chatOut
	nextID  int
}

func newHub(s *Server) *Hub {
	return &Hub{s: s, clients: map[*Client]bool{}, byName: map[string]*Client{}, rooms: map[string]*Room{}}
}

func (h *Hub) onlineNames() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make([]string, 0, len(h.byName))
	for _, c := range h.byName {
		out = append(out, c.name)
	}
	sort.Strings(out)
	return out
}

func (h *Hub) serveWS(w http.ResponseWriter, r *http.Request) {
	ss, _ := h.s.sessionFor(r)
	if ss == nil {
		writeErr(w, http.StatusUnauthorized, "log in first")
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns:  h.s.cfg.AllowedOrigins,
		CompressionMode: websocket.CompressionContextTakeover,
	})
	if err != nil {
		return
	}
	conn.SetReadLimit(MaxMessageBytes)
	c := &Client{hub: h, name: ss.Name, guest: ss.Guest, send: make(chan []byte, 256),
		chatL: NewLimiter(1, 5), cmdL: NewLimiter(25, 60), closed: make(chan struct{}), conn: conn}
	h.register(c)
	ctx, cancel := context.WithCancel(r.Context())
	go func() {
		<-c.closed
		cancel()
	}()
	go h.writer(ctx, c)
	h.reader(ctx, c)
	c.close()
	h.unregister(c)
	conn.Close(websocket.StatusNormalClosure, "")
}

func (h *Hub) writer(ctx context.Context, c *Client) {
	ping := time.NewTicker(20 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case b := <-c.send:
			wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.conn.Write(wctx, websocket.MessageText, b)
			cancel()
			if err != nil {
				c.close()
				return
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := c.conn.Ping(pctx)
			cancel()
			if err != nil {
				c.close()
				return
			}
		}
	}
}

func (h *Hub) reader(ctx context.Context, c *Client) {
	for {
		typ, b, err := c.conn.Read(ctx)
		if err != nil {
			return
		}
		if typ != websocket.MessageText {
			continue
		}
		m, err := ParseClientMsg(b)
		if err != nil {
			c.errorMsg(err.Error())
			continue
		}
		h.handle(c, m)
	}
}

func (h *Hub) register(c *Client) {
	h.mu.Lock()
	key := strings.ToLower(c.name)
	if old := h.byName[key]; old != nil {
		old.errorMsg("logged in from another window")
		old.close()
	}
	h.clients[c] = true
	h.byName[key] = c
	hist := append([]chatOut(nil), h.history...)
	h.mu.Unlock()
	c.sendJSON(map[string]interface{}{"t": "hello", "name": c.name, "guest": c.guest}, false)
	for _, m := range hist {
		c.sendJSON(m, false)
	}
	h.rejoin(c)
	h.broadcastLobby()
}

func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	delete(h.clients, c)
	if h.byName[strings.ToLower(c.name)] == c {
		delete(h.byName, strings.ToLower(c.name))
	}
	r := c.room
	h.mu.Unlock()
	if r != nil {
		h.leaveRoom(c, r, false)
	}
	h.broadcastLobby()
}

// broadcastLobby sends the room list and online players to everyone not in
// a running game.
func (h *Hub) broadcastLobby() {
	h.mu.Lock()
	rooms := make([]roomSummary, 0, len(h.rooms))
	for _, r := range h.rooms {
		rooms = append(rooms, r.summary())
	}
	sort.Slice(rooms, func(i, j int) bool { return rooms[i].ID < rooms[j].ID })
	names := make([]string, 0, len(h.byName))
	for _, c := range h.byName {
		names = append(names, c.name)
	}
	sort.Strings(names)
	var targets []*Client
	for c := range h.clients {
		targets = append(targets, c)
	}
	h.mu.Unlock()
	b, _ := json.Marshal(map[string]interface{}{"t": "lobby", "rooms": rooms, "online": names})
	for _, c := range targets {
		c.enqueue(b, true)
	}
}

func (h *Hub) handle(c *Client, m *ClientMsg) {
	switch m.T {
	case "ping":
		c.sendJSON(map[string]string{"t": "pong"}, true)
	case "chat":
		h.chat(c, m)
	case "create":
		h.createRoom(c, m)
	case "quick":
		h.quickGame(c, m)
	case "join":
		h.joinRoom(c, m.Room)
	case "leave":
		h.mu.Lock()
		r := c.room
		h.mu.Unlock()
		if r != nil {
			h.leaveRoom(c, r, true)
		}
	case "slot", "team", "start":
		h.mu.Lock()
		r := c.room
		h.mu.Unlock()
		if r == nil {
			c.errorMsg("not in a room")
			return
		}
		if err := r.lobbyAction(c, m); err != nil {
			c.errorMsg(err.Error())
			return
		}
		h.broadcastLobby()
	case "cmd":
		if !c.cmdL.Allow("") {
			return
		}
		h.mu.Lock()
		r := c.room
		h.mu.Unlock()
		if r != nil {
			r.command(c, *m.Cmd)
		}
	}
}

func (h *Hub) chat(c *Client, m *ClientMsg) {
	if !c.chatL.Allow("") {
		c.errorMsg("you are sending messages too fast")
		return
	}
	out := chatOut{T: "chat", Ch: m.Ch, From: c.name, Text: m.Text, TS: time.Now().Unix()}
	switch m.Ch {
	case ChanGlobal:
		h.mu.Lock()
		h.history = append(h.history, out)
		if len(h.history) > 50 {
			h.history = h.history[len(h.history)-50:]
		}
		var targets []*Client
		for cl := range h.clients {
			targets = append(targets, cl)
		}
		h.mu.Unlock()
		b, _ := json.Marshal(out)
		for _, cl := range targets {
			cl.enqueue(b, false)
		}
	case ChanWhisper:
		h.mu.Lock()
		to := h.byName[strings.ToLower(m.To)]
		h.mu.Unlock()
		if to == nil {
			c.errorMsg("player is not online")
			return
		}
		out.To = to.name
		to.sendJSON(out, false)
		if to != c {
			c.sendJSON(out, false)
		}
	case ChanRoom, ChanTeam:
		h.mu.Lock()
		r := c.room
		h.mu.Unlock()
		if r == nil {
			c.errorMsg("not in a room")
			return
		}
		r.chat(c, out)
	}
}

// Shutdown stops every running game.
func (h *Hub) Shutdown() {
	h.mu.Lock()
	rooms := make([]*Room, 0, len(h.rooms))
	for _, r := range h.rooms {
		rooms = append(rooms, r)
	}
	clients := make([]*Client, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()
	for _, r := range rooms {
		r.stopGame()
	}
	for _, c := range clients {
		c.close()
	}
}
