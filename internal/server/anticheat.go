package server

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rom/lords_of_the_lowlands/internal/game"
	"github.com/rom/lords_of_the_lowlands/internal/store"
)

// Anti-cheat works in three layers:
//
//  1. Protocol: each connection gets a random key in the hello message.
//     Commands carry a strictly increasing sequence number and an
//     HMAC-SHA256 over "seq:payload", so replayed, reordered, duplicated or
//     injected commands (e.g. from a second socket or a proxy) are rejected.
//  2. Client: the browser reports SHA-256 digests of its JavaScript modules
//     and automation signals; mismatches against the served files are
//     scored. (A determined cheater controls the client, so this layer only
//     raises the bar; the server never trusts the client.)
//  3. Server: the simulation is authoritative and fog-filtered. Commands are
//     additionally checked for tell-tale signs of map hacks (targeting
//     entities the player cannot see, building in unexplored land), unit
//     spoofing (ordering other players' units) and inhuman action rates.
//     Scores add up; players are warned, then removed from the game and the
//     account is flagged for the administrator.

// cheat event weights
const (
	wBadMAC       = 25
	wBadSeq       = 15
	wHiddenTarget = 12
	wUnexplored   = 8
	wSpoof        = 10
	wAPM          = 10
	wIntegrity    = 30
	wAutomation   = 15
)

type cheatState struct {
	mu      sync.Mutex
	key     []byte
	seq     int64
	score   float64
	events  []string
	cmdTime []time.Time
	lastAPM time.Time
	warned  bool
	kicked  bool
}

func newCheatState() *cheatState {
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		panic(err)
	}
	return &cheatState{key: k}
}

func (c *cheatState) keyString() string { return base64.StdEncoding.EncodeToString(c.key) }

// Mac computes the expected signature of a command payload.
func Mac(key []byte, seq int64, payload string) string {
	m := hmac.New(sha256.New, key)
	m.Write([]byte(strconv.FormatInt(seq, 10) + ":" + payload))
	return hex.EncodeToString(m.Sum(nil))
}

// verify checks sequence and signature of a signed command.
func (c *cheatState) verify(seq int64, payload, mac string) (ok bool, reason string, weight float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	want := Mac(c.key, seq, payload)
	if !hmac.Equal([]byte(want), []byte(mac)) {
		return false, "bad command signature", wBadMAC
	}
	if seq != c.seq+1 {
		return false, fmt.Sprintf("command sequence %d after %d (replay/injection)", seq, c.seq), wBadSeq
	}
	c.seq = seq
	return true, "", 0
}

// add records an event and returns the new score.
func (c *cheatState) add(reason string, w float64) float64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.score += w
	if len(c.events) < 50 {
		c.events = append(c.events, fmt.Sprintf("%s (+%g)", reason, w))
	}
	return c.score
}

// rate records a command and reports a sustained inhuman action rate.
func (c *cheatState) rate(now time.Time, maxAPM float64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cmdTime = append(c.cmdTime, now)
	cut := now.Add(-time.Minute)
	i := 0
	for i < len(c.cmdTime) && c.cmdTime[i].Before(cut) {
		i++
	}
	c.cmdTime = c.cmdTime[i:]
	if float64(len(c.cmdTime)) > maxAPM && now.Sub(c.lastAPM) > 20*time.Second {
		c.lastAPM = now
		return true
	}
	return false
}

// inspect looks at a command against the player's knowledge before it is
// applied. g must be locked by the caller.
func inspectCommand(g *game.Game, cmd game.Command) (string, float64) {
	if cmd.Target != 0 && g.Exists(cmd.Target) && !g.Knows(cmd.Player, cmd.Target) {
		return "targeted an entity hidden by fog of war", wHiddenTarget
	}
	if cmd.Type == game.CmdBuild && !g.ExploredAt(cmd.Player, cmd.X, cmd.Y) {
		return "tried to build in unexplored land", wUnexplored
	}
	for _, id := range cmd.IDs {
		if o, ok := g.OwnerOf(id); ok && o != cmd.Player && o >= 0 {
			return "ordered another player's units", wSpoof
		}
	}
	return "", 0
}

// report handles a cheat signal for a client in a room; it warns and kicks
// according to the configured thresholds.
func (h *Hub) report(c *Client, reason string, w float64) {
	ac := h.s.set.AntiCheat
	if !ac.Enabled || w <= 0 {
		return
	}
	score := c.cheat.add(reason, w)
	h.s.metrics.cheatFlags.Add(1)
	h.s.log.Warn("anticheat", "player", c.name, "reason", reason, "score", score)
	c.cheat.mu.Lock()
	warn := score >= ac.WarnScore && !c.cheat.warned
	kick := score >= ac.KickScore && !c.cheat.kicked
	if warn {
		c.cheat.warned = true
	}
	if kick {
		c.cheat.kicked = true
	}
	events := append([]string(nil), c.cheat.events...)
	c.cheat.mu.Unlock()
	if warn {
		c.sendJSON(map[string]string{"t": "warn", "msg": "Unusual activity detected from your client. Further violations will remove you from the game."}, false)
	}
	if kick {
		h.s.metrics.cheatKicks.Add(1)
		game := ""
		h.mu.Lock()
		r := c.room
		h.mu.Unlock()
		if r != nil {
			game = r.ID + " " + r.Level.Name
			r.mu.Lock()
			if r.g != nil && r.State == StatePlaying {
				for _, s := range r.Slots {
					if s.client == c {
						r.g.Resign(s.player)
						s.flagged = true
					}
				}
			}
			r.mu.Unlock()
		}
		if !c.guest {
			_ = h.s.cfg.Store.AddFlag(c.name, flagOf(score, game, events))
		}
		h.s.cfg.Store.Audit("anticheat", "kick", c.name, fmt.Sprintf("score %.0f: %v", score, events))
		c.errorMsg("You were removed from the game by the anti-cheat system.")
		c.close()
	}
}

// integrityCheck compares the client's reported module digests with the
// files actually served.
func (h *Hub) integrityCheck(c *Client, m *ClientMsg) {
	want := h.s.cfg.StaticHashes
	bad := 0
	for p, got := range m.Hashes {
		if exp, ok := want[p]; !ok || exp != got {
			bad++
		}
	}
	if len(m.Hashes) == 0 && len(want) > 0 {
		bad++
	}
	if bad > 0 {
		h.report(c, fmt.Sprintf("client files differ from the server (%d modules)", bad), wIntegrity)
	}
	if m.Automation {
		h.report(c, "browser automation detected", wAutomation)
	}
}

func flagOf(score float64, game string, events []string) store.Flag {
	return store.Flag{Time: time.Now().UTC(), Reason: strings.Join(events, "; "), Score: score, Game: game}
}
