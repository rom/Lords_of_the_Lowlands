// Package docs embeds the player documentation (user manual and FAQ) so the
// server can show it inside the game.
package docs

import "embed"

//go:embed *.md
var files embed.FS

// player lists the documents served to players, by name.
var player = map[string]string{"manual": "manual.md", "faq": "faq.md"}

// Player returns a player document ("manual" or "faq") as Markdown.
func Player(name string) ([]byte, bool) {
	f, ok := player[name]
	if !ok {
		return nil, false
	}
	b, err := files.ReadFile(f)
	return b, err == nil
}
