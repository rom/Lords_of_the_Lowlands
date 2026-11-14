package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDefaultsAndExample(t *testing.T) {
	if err := Default().Validate(); err != nil {
		t.Fatal(err)
	}
	c, err := Load("../../deploy/config/lotl.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if c.Accounts.Registration != RegOpen || c.Security.SessionTTL != 168*time.Hour || !c.Game.Demo.Enabled {
		t.Fatalf("%+v", c)
	}
	if c, err := Load(""); err != nil || c.Server.MaxRooms != 200 {
		t.Fatal("empty path")
	}
	if _, err := Load("/nonexistent.yaml"); err == nil {
		t.Fatal("missing file")
	}
}

func TestParse(t *testing.T) {
	c := Default()
	if err := Parse([]byte("accounts:\n  registration: closed\nserver:\n  port: 9000\n"), c); err != nil {
		t.Fatal(err)
	}
	if c.Accounts.Registration != RegClosed || c.Server.Port != 9000 || c.Server.MaxRooms != 200 {
		t.Fatal("merge with defaults")
	}
	if err := Parse(nil, Default()); err != nil {
		t.Fatal("empty document")
	}
	bad := []string{
		"server:\n  prot: 1\n", "server:\n  port: 70000\n", "server:\n  tlsCert: x\n", "server:\n  maxRooms: 0\n",
		"accounts:\n  registration: maybe\n", "accounts:\n  minPasswordLength: 4\n", "security:\n  sessionTTL: 1s\n",
		"security:\n  apiRate: 0\n", "security:\n  maxBodyBytes: 10\n", "game:\n  maxSavesPerUser: -1\n",
		"game:\n  demo:\n    idleMinutes: 0\n", "anticheat:\n  warnScore: 200\n", "metrics:\n  token: short\n", ":::",
	}
	for _, b := range bad {
		if err := Parse([]byte(b), Default()); err == nil {
			t.Errorf("accepted %q", b)
		}
	}
	f := filepath.Join(t.TempDir(), "c.yaml")
	os.WriteFile(f, []byte("server:\n  bogus: 1\n"), 0o600)
	if _, err := Load(f); err == nil || !strings.Contains(err.Error(), "c.yaml") {
		t.Fatal("error should name the file")
	}
}
