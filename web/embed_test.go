package web

import (
	"io/fs"
	"strings"
	"testing"
)

func TestEmbeddedFiles(t *testing.T) {
	for _, f := range []string{"index.html", "editor.html", "admin.html", "css/admin.css", "js/admin.js", "js/integrity.js", "css/style.css", "css/editor.css", "js/main.js", "js/game.js", "js/render.js", "js/sprites.js", "js/audio.js", "js/editor.js", "js/net.js", "js/util.js"} {
		b, err := fs.ReadFile(FS(), f)
		if err != nil || len(b) == 0 {
			t.Fatalf("%s missing", f)
		}
		// strict CSP: no inline scripts or handlers in HTML
		if strings.HasSuffix(f, ".html") {
			s := string(b)
			if strings.Contains(s, "<script>") || strings.Contains(s, " onclick=") || strings.Contains(s, " style=") {
				t.Fatalf("%s contains inline script/style", f)
			}
		}
	}
}
