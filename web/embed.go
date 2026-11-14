// Package web embeds the browser client (HTML, CSS, JavaScript).
package web

import (
	"embed"
	"io/fs"
)

//go:embed index.html editor.html admin.html css js
var files embed.FS

// FS returns the static file system.
func FS() fs.FS { return files }
