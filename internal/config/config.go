// Package config loads the server's YAML configuration file.
package config

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Registration modes.
const (
	RegOpen     = "open"     // anyone may create an account
	RegApproval = "approval" // accounts wait for an administrator
	RegClosed   = "closed"   // only administrators create accounts
)

// Config is the complete server configuration.
type Config struct {
	Server    Server    `yaml:"server"`
	Data      Data      `yaml:"data"`
	Security  Security  `yaml:"security"`
	Accounts  Accounts  `yaml:"accounts"`
	Game      Game      `yaml:"game"`
	AntiCheat AntiCheat `yaml:"anticheat"`
	Metrics   Metrics   `yaml:"metrics"`
}

// Server holds network settings.
type Server struct {
	Listen         string   `yaml:"listen"`
	Port           int      `yaml:"port"`
	TLSCert        string   `yaml:"tlsCert"`
	TLSKey         string   `yaml:"tlsKey"`
	SecureCookies  bool     `yaml:"secureCookies"`
	TrustProxy     bool     `yaml:"trustProxy"`
	AllowedOrigins []string `yaml:"allowedOrigins"`
	MaxRooms       int      `yaml:"maxRooms"`
	LogLevel       string   `yaml:"logLevel"`
}

// Data holds storage settings.
type Data struct {
	Dir string `yaml:"dir"`
}

// Security holds sandbox and rate-limit settings.
type Security struct {
	Sandbox      bool          `yaml:"sandbox"`
	SessionTTL   time.Duration `yaml:"sessionTTL"`
	APIRate      float64       `yaml:"apiRate"`
	APIBurst     float64       `yaml:"apiBurst"`
	AuthRate     float64       `yaml:"authRate"`
	AuthBurst    float64       `yaml:"authBurst"`
	MaxBodyBytes int64         `yaml:"maxBodyBytes"`
}

// Accounts holds login policy.
type Accounts struct {
	Registration      string `yaml:"registration"`
	AllowGuests       bool   `yaml:"allowGuests"`
	BootstrapAdmin    string `yaml:"bootstrapAdmin"`
	RequireAdminMFA   bool   `yaml:"requireAdminMFA"`
	MinPasswordLength int    `yaml:"minPasswordLength"`
	MFAIssuer         string `yaml:"mfaIssuer"`
}

// Game holds gameplay service settings.
type Game struct {
	MaxSavesPerUser int  `yaml:"maxSavesPerUser"`
	Demo            Demo `yaml:"demo"`
}

// Demo configures the self-playing attract mode.
type Demo struct {
	Enabled       bool    `yaml:"enabled"`
	IdleMinutes   float64 `yaml:"idleMinutes"`
	RotateMinutes float64 `yaml:"rotateMinutes"`
	MaxRooms      int     `yaml:"maxRooms"`
}

// AntiCheat configures cheat detection.
type AntiCheat struct {
	Enabled    bool    `yaml:"enabled"`
	SignedCmds bool    `yaml:"signedCommands"`
	MaxAPM     float64 `yaml:"maxAPM"`
	WarnScore  float64 `yaml:"warnScore"`
	KickScore  float64 `yaml:"kickScore"`
}

// Metrics configures the diagnostics endpoints.
type Metrics struct {
	Token  string `yaml:"token"`
	Public bool   `yaml:"public"`
}

// Default returns the built-in configuration.
func Default() *Config {
	return &Config{
		Server:    Server{Listen: "127.0.0.1:8080", MaxRooms: 200, LogLevel: "info"},
		Data:      Data{Dir: "./data"},
		Security:  Security{Sandbox: true, SessionTTL: 7 * 24 * time.Hour, APIRate: 20, APIBurst: 60, AuthRate: 0.2, AuthBurst: 8, MaxBodyBytes: 1 << 20},
		Accounts:  Accounts{Registration: RegOpen, AllowGuests: true, MinPasswordLength: 8, MFAIssuer: "Lords of the Lowlands"},
		Game:      Game{MaxSavesPerUser: 20, Demo: Demo{Enabled: true, IdleMinutes: 3, RotateMinutes: 6, MaxRooms: 10}},
		AntiCheat: AntiCheat{Enabled: true, SignedCmds: true, MaxAPM: 900, WarnScore: 40, KickScore: 100},
	}
}

// Load reads a YAML file over the defaults. Unknown keys are rejected so
// typos do not silently disable a setting.
func Load(path string) (*Config, error) {
	c := Default()
	if path == "" {
		return c, nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if err := Parse(b, c); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return c, nil
}

// Parse decodes YAML into c (which should hold defaults) and validates it.
func Parse(b []byte, c *Config) error {
	dec := yaml.NewDecoder(bytes.NewReader(b))
	dec.KnownFields(true)
	if err := dec.Decode(c); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return c.Validate()
}

// Validate checks value ranges.
func (c *Config) Validate() error {
	if c.Server.Port < 0 || c.Server.Port > 65535 {
		return errors.New("server.port must be 0..65535")
	}
	if (c.Server.TLSCert == "") != (c.Server.TLSKey == "") {
		return errors.New("server.tlsCert and server.tlsKey must be set together")
	}
	if c.Server.MaxRooms < 1 || c.Server.MaxRooms > 10000 {
		return errors.New("server.maxRooms must be 1..10000")
	}
	switch c.Accounts.Registration {
	case RegOpen, RegApproval, RegClosed:
	default:
		return fmt.Errorf("accounts.registration must be open, approval or closed (got %q)", c.Accounts.Registration)
	}
	if c.Accounts.MinPasswordLength < 8 || c.Accounts.MinPasswordLength > 128 {
		return errors.New("accounts.minPasswordLength must be 8..128")
	}
	if c.Security.SessionTTL < time.Minute {
		return errors.New("security.sessionTTL must be at least 1m")
	}
	if c.Security.APIRate <= 0 || c.Security.APIBurst < 1 || c.Security.AuthRate <= 0 || c.Security.AuthBurst < 1 {
		return errors.New("security rate limits must be positive")
	}
	if c.Security.MaxBodyBytes < 64<<10 || c.Security.MaxBodyBytes > 16<<20 {
		return errors.New("security.maxBodyBytes must be 64KiB..16MiB")
	}
	if c.Game.MaxSavesPerUser < 0 || c.Game.MaxSavesPerUser > 1000 {
		return errors.New("game.maxSavesPerUser must be 0..1000")
	}
	if c.Game.Demo.IdleMinutes <= 0 || c.Game.Demo.RotateMinutes <= 0 || c.Game.Demo.MaxRooms < 0 {
		return errors.New("game.demo minutes must be positive")
	}
	if c.AntiCheat.MaxAPM < 60 || c.AntiCheat.KickScore <= c.AntiCheat.WarnScore || c.AntiCheat.WarnScore <= 0 {
		return errors.New("anticheat: maxAPM >= 60 and 0 < warnScore < kickScore required")
	}
	if c.Metrics.Token != "" && len(c.Metrics.Token) < 16 {
		return errors.New("metrics.token must be at least 16 characters")
	}
	return nil
}
