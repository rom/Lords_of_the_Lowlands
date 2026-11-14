package server

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/rom/lords_of_the_lowlands/internal/game"
	"github.com/rom/lords_of_the_lowlands/internal/levels"
)

// MaxMessageBytes bounds a single client WebSocket message.
const MaxMessageBytes = 16 * 1024

// MaxChatLen bounds chat message length in runes.
const MaxChatLen = 300

// Chat channels.
const (
	ChanGlobal  = "global"
	ChanRoom    = "room"
	ChanTeam    = "team"
	ChanWhisper = "whisper"
)

// ClientMsg is any message a client may send. Only the fields relevant for
// its type are consulted; everything is validated in Parse.
type ClientMsg struct {
	T        string                  `json:"t"`
	Ch       string                  `json:"ch,omitempty"`
	To       string                  `json:"to,omitempty"`
	Text     string                  `json:"text,omitempty"`
	Room     string                  `json:"room,omitempty"`
	Name     string                  `json:"name,omitempty"`
	Level    string                  `json:"level,omitempty"`
	Slot     int                     `json:"slot,omitempty"`
	Kind     string                  `json:"kind,omitempty"`
	Diff     string                  `json:"diff,omitempty"`
	Team     int                     `json:"team,omitempty"`
	Opp      int                     `json:"opp,omitempty"`
	Cmd      *game.Command           `json:"cmd,omitempty"`
	Skirmish *levels.SkirmishOptions `json:"skirmish,omitempty"`
}

var validTypes = map[string]bool{
	"chat": true, "create": true, "join": true, "leave": true, "slot": true, "team": true,
	"start": true, "quick": true, "cmd": true, "ping": true,
}

func validDiffName(d string) bool { return game.ValidDifficulty(d) }

// ParseClientMsg decodes and validates an untrusted client message.
func ParseClientMsg(b []byte) (*ClientMsg, error) {
	if len(b) > MaxMessageBytes {
		return nil, errors.New("message too large")
	}
	var m ClientMsg
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, errors.New("malformed message")
	}
	if !validTypes[m.T] {
		return nil, errors.New("unknown message type")
	}
	if !validDiffName(m.Diff) {
		return nil, errors.New("bad difficulty")
	}
	if m.Team < 0 || m.Team > 8 || m.Slot < 0 || m.Slot >= game.MaxPlayers || m.Opp < 0 || m.Opp > 7 {
		return nil, errors.New("value out of range")
	}
	if len(m.Room) > 32 || len(m.Level) > 64 || len(m.To) > 32 {
		return nil, errors.New("field too long")
	}
	switch m.T {
	case "chat":
		m.Text = game.CleanText(m.Text, MaxChatLen)
		if m.Text == "" {
			return nil, errors.New("empty chat message")
		}
		switch m.Ch {
		case ChanGlobal, ChanRoom, ChanTeam:
		case ChanWhisper:
			if m.To == "" {
				return nil, errors.New("whisper needs recipient")
			}
		default:
			return nil, errors.New("unknown chat channel")
		}
	case "create":
		m.Name = game.CleanText(m.Name, game.MaxNameLen)
		if m.Name == "" {
			m.Name = "Battle"
		}
	case "slot":
		switch m.Kind {
		case "open", "closed", "ai":
		default:
			return nil, errors.New("bad slot kind")
		}
	case "cmd":
		if m.Cmd == nil {
			return nil, errors.New("missing command")
		}
		if len(m.Cmd.IDs) > game.MaxCommandIDs {
			return nil, errors.New("too many units")
		}
		if len(m.Cmd.What) > 40 || strings.ContainsAny(m.Cmd.What, "<>\"'\\") {
			return nil, errors.New("bad command argument")
		}
	case "quick":
		if m.Skirmish != nil {
			o := m.Skirmish
			if o.Size < 0 || o.Size > game.MaxMapSize || o.StartAge < 0 || o.StartAge > game.MaxAge || o.MaxAge < 0 || o.MaxAge > game.MaxAge {
				return nil, errors.New("bad skirmish options")
			}
		}
	}
	return &m, nil
}
